"""
Email/password auth plus Google OAuth login (Stage 3). Either way the JWT is
delivered as an httpOnly session cookie (Stage 2a).

If the database is unavailable these endpoints return 500 — acceptable for now;
the rest of the app keeps running without a DB.
"""
import logging
import re
import secrets
import time
import unicodedata
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import RedirectResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic_core import PydanticCustomError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import google_oauth, rate_limit
from app.core.config import settings
from app.core.countries import COUNTRY_CODES
from app.core.database import get_db
from app.core.google_oauth import GoogleAuthError
from app.core.security import (
    CurrentSession,
    bump_token_version,
    clear_auth_cookie,
    create_access_token,
    get_current_session,
    get_current_user,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.models.user import User

logger = logging.getLogger(__name__)

_NO_STORE = {"Cache-Control": "no-store"}


class _NoStoreRoute(APIRoute):
    """Mark every /auth/* response no-store (prod sits behind Cloudflare), including
    errors raised from the route or its dependencies (e.g. 401 from get_current_user)
    and 422 validation errors."""

    def get_route_handler(self) -> Callable:
        handler = super().get_route_handler()

        async def no_store_handler(request: Request) -> Response:
            try:
                response = await handler(request)
            except HTTPException as exc:
                exc.headers = {**(exc.headers or {}), **_NO_STORE}
                raise
            except RequestValidationError as exc:
                response = await request_validation_exception_handler(request, exc)
            response.headers.update(_NO_STORE)
            return response

        return no_store_handler


router = APIRouter(prefix="/auth", tags=["auth"], route_class=_NoStoreRoute)


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    auth_provider: str
    is_active: bool
    first_name: str | None
    last_name: str | None
    phone: str | None
    country: str | None
    avatar_url: str | None
    created_at: int  # epoch ms
    has_password: bool
    google_linked: bool

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        # Built explicitly so the password hash and google_sub never leave the
        # server — only whether they are set.
        return cls(
            id=user.id,
            email=user.email,
            auth_provider=user.auth_provider,
            is_active=user.is_active,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            country=user.country,
            avatar_url=user.avatar_url,
            created_at=user.created_at,
            has_password=user.password_hash is not None,
            google_linked=user.google_sub is not None,
        )


class AuthOut(BaseModel):
    user: UserOut


# ── Profile validation ────────────────────────────────────────────────────────

NAME_MAX = 50
# Allowed besides letters: space, hyphen, apostrophe (straight + typographic), period.
_NAME_PUNCT = frozenset(" -'\u2019.")
_PHONE_RE = re.compile(r"\+[1-9]\d{6,14}")  # E.164


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value  # None, or a wrong type left for pydantic's own str check


def _validate_name(value: str, label: str) -> str:
    value = " ".join(value.split())  # trim + collapse inner runs of whitespace
    if len(value) > NAME_MAX:
        raise PydanticCustomError("name_too_long", f"{label} must be at most {NAME_MAX} characters")
    has_letter = False
    for ch in value:
        cat = unicodedata.category(ch)
        if cat[0] == "L":
            has_letter = True
        # Marks (M*) are the combining vowel signs of scripts such as Sinhala or Hindi.
        elif cat[0] != "M" and ch not in _NAME_PUNCT:
            raise PydanticCustomError(
                "name_chars",
                f"{label} may only contain letters, spaces, hyphens, apostrophes and periods",
            )
    if not has_letter:
        raise PydanticCustomError("name_chars", f"{label} must contain at least one letter")
    return value


class ProfileUpdateIn(BaseModel):
    """Only the fields present in the body change; null or "" clears a field."""

    # avatar_url is deliberately absent (it only ever comes from Google), and
    # unknown fields are rejected so an attempt to set it fails loudly.
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    country: str | None = None

    @field_validator("first_name", "last_name", "phone", "country", mode="before")
    @classmethod
    def _blank(cls, v: object) -> object:
        return _blank_to_none(v)

    @field_validator("first_name")
    @classmethod
    def _first_name(cls, v: str | None) -> str | None:
        return None if v is None else _validate_name(v, "First name")

    @field_validator("last_name")
    @classmethod
    def _last_name(cls, v: str | None) -> str | None:
        return None if v is None else _validate_name(v, "Last name")

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is not None and not _PHONE_RE.fullmatch(v):
            raise PydanticCustomError(
                "phone_format", "Phone must be in international format, e.g. +94771234567"
            )
        return v

    @field_validator("country")
    @classmethod
    def _country(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.upper()
        if v not in COUNTRY_CODES:
            raise PydanticCustomError("country_code", "Country must be a valid ISO 3166-1 alpha-2 code")
        return v


class ChangePasswordIn(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=72)


# Password changes: attempts per user per window (accounts that have a password).
PASSWORD_ATTEMPT_LIMIT = 5
PASSWORD_ATTEMPT_WINDOW_S = 900
# Setting a first password on a Google-only account needs a session at most this old.
REAUTH_MAX_AGE_S = 600


def _auth_response(response: Response, user: User) -> AuthOut:
    # The token travels only in the httpOnly cookie — never in the body.
    set_auth_cookie(response, create_access_token(user))
    return AuthOut(user=UserOut.from_user(user))


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
async def signup(body: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    conflict = HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    existing = await db.scalar(select(User.id).where(User.email == email))
    if existing is not None:
        raise conflict

    user = User(email=email, password_hash=hash_password(body.password), auth_provider="email")
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:  # lost a race with a concurrent signup for the same email
        await db.rollback()
        raise conflict
    await db.refresh(user)
    return _auth_response(response, user)


@router.post("/login", response_model=AuthOut)
async def login(body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    user = await db.scalar(select(User).where(User.email == email))

    # Same message for unknown email and wrong password — no email enumeration.
    if user is None or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return _auth_response(response, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    # No auth required and idempotent — clearing an absent cookie is harmless.
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookie(response)
    return response


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.from_user(user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: ProfileUpdateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field in body.model_fields_set:
        setattr(user, field, getattr(body, field))
    await db.commit()
    await db.refresh(user)
    return UserOut.from_user(user)


@router.post("/password", response_model=UserOut)
async def change_password(
    body: ChangePasswordIn,
    response: Response,
    session: CurrentSession = Depends(get_current_session),
    db: AsyncSession = Depends(get_db),
):
    user = session.user
    if user.password_hash:
        if not await rate_limit.hit(f"pwchange:{user.id}", PASSWORD_ATTEMPT_LIMIT, PASSWORD_ATTEMPT_WINDOW_S):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts, try again later"
            )
        if not body.current_password or not verify_password(body.current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        if verify_password(body.new_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from the current one",
            )
    else:
        # Google-only (or linked) account setting its first password: there is no
        # current password to check, so require a recent sign-in instead. A stolen
        # or long-lived session alone can't add a password.
        if session.iat is None or time.time() - session.iat > REAUTH_MAX_AGE_S:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="reauth_required")

    user.password_hash = hash_password(body.new_password)
    bump_token_version(user)  # revokes every other session
    await db.commit()
    await db.refresh(user)
    # Re-issue this device's cookie at the new version so it stays logged in.
    set_auth_cookie(response, create_access_token(user))
    return UserOut.from_user(user)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    bump_token_version(user)
    await db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookie(response)
    return response


# ── Google OAuth ──────────────────────────────────────────────────────────────

# Temporary cookie carrying "state.verifier.nonce" between /google/start and
# /google/callback (token_urlsafe never emits '.'). Must be SameSite=Lax: a Strict
# cookie is not sent on Google's top-level redirect back to us.
_OAUTH_COOKIE = "cyc_oauth"
_OAUTH_COOKIE_PATH = "/api/v1/auth/google"
_OAUTH_COOKIE_MAX_AGE = 600


def _oauth_cookie_kwargs() -> dict:
    # Shared by set/delete — browsers ignore a delete whose attributes don't match.
    return {
        "key": _OAUTH_COOKIE,
        "path": _OAUTH_COOKIE_PATH,
        "domain": settings.cookie_domain,
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": "lax",
    }


def _auth_error_redirect(code: str) -> RedirectResponse:
    # Only a short code reaches the URL; the reason is logged by the caller.
    return RedirectResponse(f"{settings.frontend_url}/?auth_error={code}", status_code=status.HTTP_302_FOUND)


def _parse_oauth_cookie(raw: str | None) -> tuple[str, str, str] | None:
    parts = raw.split(".") if raw else []
    if len(parts) != 3 or not all(parts):
        return None
    return parts[0], parts[1], parts[2]


class _GoogleLoginError(Exception):
    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code


@dataclass(frozen=True)
class GoogleProfile:
    """Optional profile claims from the verified ID token, already sanitised."""
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None


_AVATAR_MAX = 500


def _google_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return value[:NAME_MAX].rstrip() or None


def _google_picture(value: object) -> str | None:
    """Accept only an https URL on Google's user-content CDN; anything else is ignored."""
    if not isinstance(value, str) or not value or len(value) > _AVATAR_MAX:
        return None
    if any(ch.isspace() for ch in value):
        return None
    try:
        parsed = urlparse(value)
        host = parsed.hostname
    except ValueError:
        return None
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        return None
    if not host.endswith(".googleusercontent.com"):
        return None
    return value


def _google_profile(claims: dict) -> GoogleProfile:
    return GoogleProfile(
        first_name=_google_name(claims.get("given_name")),
        last_name=_google_name(claims.get("family_name")),
        avatar_url=_google_picture(claims.get("picture")),
    )


def _apply_google_profile(user: User, profile: GoogleProfile) -> None:
    """Existing/linked users: the Google photo always refreshes; names are only
    filled in when the user has none, so edits made in the app are never overwritten."""
    if profile.avatar_url:
        user.avatar_url = profile.avatar_url
    if not user.first_name and not user.last_name:
        if profile.first_name:
            user.first_name = profile.first_name
        if profile.last_name:
            user.last_name = profile.last_name


async def _find_or_link_google_user(
    db: AsyncSession, email: str, sub: str, profile: GoogleProfile = GoogleProfile()
) -> User:
    user = await db.scalar(select(User).where(User.google_sub == sub))
    if user is not None:
        _apply_google_profile(user, profile)
        return user

    user = await db.scalar(select(User).where(User.email == email))
    if user is not None:
        if user.google_sub:
            raise _GoogleLoginError("account_conflict", f"user {user.id} already linked to another Google account")
        # Link the existing email account. Email signup never proved ownership of the
        # address, but Google just did — so drop the unverified password. Otherwise an
        # attacker could pre-register the victim's email with a password of their own
        # and keep access after the victim later signs in with Google (pre-account
        # hijacking). auth_provider is left as-is.
        user.google_sub = sub
        user.password_hash = None
        # Sessions issued before the link may belong to whoever set that password.
        bump_token_version(user)
        _apply_google_profile(user, profile)
        return user

    user = User(
        email=email,
        password_hash=None,
        auth_provider="google",
        google_sub=sub,
        first_name=profile.first_name,
        last_name=profile.last_name,
        avatar_url=profile.avatar_url,
    )
    db.add(user)
    return user


async def _resolve_google_user(
    db: AsyncSession, email: str, sub: str, profile: GoogleProfile = GoogleProfile()
) -> User:
    for attempt in range(2):
        user = await _find_or_link_google_user(db, email, sub, profile)
        try:
            await db.commit()
        except IntegrityError:
            # Lost a race (concurrent signup/link for this email or sub) — retry once,
            # which now finds the winning row via google_sub or email.
            await db.rollback()
            if attempt == 0:
                continue
            raise _GoogleLoginError("google_failed", "integrity error persisted after retry")
        await db.refresh(user)
        return user
    raise AssertionError("unreachable")


@router.get("/google/start")
async def google_start() -> Response:
    if not settings.google_enabled:
        logger.info("Google sign-in requested but GOOGLE_* is not configured")
        return _auth_error_redirect("google_unavailable")

    state = secrets.token_urlsafe(32)
    verifier, challenge = google_oauth.make_pkce()
    nonce = secrets.token_urlsafe(32)

    response = RedirectResponse(
        google_oauth.build_authorize_url(state, challenge, nonce), status_code=status.HTTP_302_FOUND
    )
    response.set_cookie(
        value=f"{state}.{verifier}.{nonce}", max_age=_OAUTH_COOKIE_MAX_AGE, **_oauth_cookie_kwargs()
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> Response:
    oauth = _parse_oauth_cookie(request.cookies.get(_OAUTH_COOKIE))
    response = await _google_callback(db, oauth, code, state, error)
    # One-shot cookie: always cleared, whatever the outcome.
    response.delete_cookie(**_oauth_cookie_kwargs())
    return response


async def _google_callback(
    db: AsyncSession,
    oauth: tuple[str, str, str] | None,
    code: str | None,
    state: str | None,
    error: str | None,
) -> Response:
    if error:
        logger.info("Google sign-in returned error=%s", error[:64])
        return _auth_error_redirect("cancelled")
    if oauth is None or not state:
        logger.warning("Google callback without a valid oauth cookie or state")
        return _auth_error_redirect("invalid_state")
    cookie_state, verifier, nonce = oauth
    # Compare as bytes: compare_digest raises TypeError on non-ASCII str.
    if not secrets.compare_digest(state.encode(), cookie_state.encode()):
        logger.warning("Google callback state mismatch")
        return _auth_error_redirect("invalid_state")
    if not code:
        logger.warning("Google callback without code")
        return _auth_error_redirect("google_failed")
    if not settings.google_enabled:
        logger.warning("Google callback hit but GOOGLE_* is not configured")
        return _auth_error_redirect("google_unavailable")

    try:
        id_token = await google_oauth.exchange_code(code, verifier)
        claims = await google_oauth.verify_id_token(id_token, nonce)
    except GoogleAuthError as exc:
        logger.warning("Google sign-in failed: %s", exc)
        return _auth_error_redirect("google_failed")

    if claims.get("email_verified") is not True:
        logger.info("Google sign-in rejected: email not verified")
        return _auth_error_redirect("unverified_email")
    email = claims.get("email")
    if not isinstance(email, str) or not email.strip():
        logger.warning("Google ID token has no email claim")
        return _auth_error_redirect("google_failed")
    email = email.strip().lower()
    sub = claims["sub"]

    try:
        user = await _resolve_google_user(db, email, sub, _google_profile(claims))
    except _GoogleLoginError as exc:
        logger.warning("Google sign-in failed (%s): %s", exc.code, exc)
        return _auth_error_redirect(exc.code)

    if not user.is_active:
        logger.info("Google sign-in rejected: user %s is disabled", user.id)
        return _auth_error_redirect("account_disabled")

    response = RedirectResponse(f"{settings.frontend_url}/", status_code=status.HTTP_302_FOUND)
    set_auth_cookie(response, create_access_token(user))
    return response
