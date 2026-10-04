"""
Email/password auth plus Google OAuth login (Stage 3). Either way the JWT is
delivered as an httpOnly session cookie (Stage 2a).

If the database is unavailable these endpoints return 500 — acceptable for now;
the rest of the app keeps running without a DB.
"""
import logging
import secrets
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import RedirectResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import google_oauth
from app.core.config import settings
from app.core.database import get_db
from app.core.google_oauth import GoogleAuthError
from app.core.security import (
    clear_auth_cookie,
    create_access_token,
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
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    auth_provider: str
    is_active: bool


class AuthOut(BaseModel):
    user: UserOut


def _auth_response(response: Response, user: User) -> AuthOut:
    # The token travels only in the httpOnly cookie — never in the body.
    set_auth_cookie(response, create_access_token(user.id))
    return AuthOut(user=UserOut.model_validate(user))


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
    return user


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


async def _find_or_link_google_user(db: AsyncSession, email: str, sub: str) -> User:
    user = await db.scalar(select(User).where(User.google_sub == sub))
    if user is not None:
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
        return user

    user = User(email=email, password_hash=None, auth_provider="google", google_sub=sub)
    db.add(user)
    return user


async def _resolve_google_user(db: AsyncSession, email: str, sub: str) -> User:
    for attempt in range(2):
        user = await _find_or_link_google_user(db, email, sub)
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
        user = await _resolve_google_user(db, email, sub)
    except _GoogleLoginError as exc:
        logger.warning("Google sign-in failed (%s): %s", exc.code, exc)
        return _auth_error_redirect(exc.code)

    if not user.is_active:
        logger.info("Google sign-in rejected: user %s is disabled", user.id)
        return _auth_error_redirect("account_disabled")

    response = RedirectResponse(f"{settings.frontend_url}/", status_code=status.HTTP_302_FOUND)
    set_auth_cookie(response, create_access_token(user.id))
    return response
