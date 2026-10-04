from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

# bcrypt only uses the first 72 bytes of a password (bcrypt>=5 raises on longer input).
_BCRYPT_MAX_BYTES = 72


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:_BCRYPT_MAX_BYTES], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:_BCRYPT_MAX_BYTES], hashed.encode())
    except ValueError:  # malformed hash
        return False


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "iat": now,
        # Session revocation: the token is only valid while this matches users.token_version.
        "ver": user.token_version or 0,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


class TokenError(Exception):
    pass


@dataclass(frozen=True)
class TokenClaims:
    user_id: int
    ver: int
    iat: int | None  # epoch seconds; None for tokens issued before `iat` was added


def decode_token(token: str) -> TokenClaims:
    """Return the token's user id, version and issue time, or raise TokenError."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Invalid token") from exc
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise TokenError("Invalid token") from exc
    # Tokens issued before token_version existed carry no `ver`: treat as 0 so
    # sessions survive the deploy (every existing row starts at 0).
    ver = payload.get("ver", 0)
    if isinstance(ver, bool) or not isinstance(ver, int):
        raise TokenError("Invalid token")
    iat = payload.get("iat")  # PyJWT already rejects a non-numeric iat
    return TokenClaims(user_id=user_id, ver=ver, iat=int(iat) if iat is not None else None)


def bump_token_version(user: User) -> None:
    """Revoke every outstanding session for this user. The caller commits."""
    user.token_version = (user.token_version or 0) + 1


def _cookie_kwargs() -> dict:
    # Shared by set/clear — browsers ignore a delete whose attributes don't match the original cookie.
    return {
        "key": settings.cookie_name,
        "path": "/",
        "domain": settings.cookie_domain,
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": settings.cookie_samesite,
    }


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(value=token, max_age=settings.access_token_expire_minutes * 60, **_cookie_kwargs())


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(**_cookie_kwargs())


# auto_error=False so a missing header yields our own 401 (HTTPBearer defaults to 403).
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@dataclass(frozen=True)
class CurrentSession:
    user: User
    iat: int | None  # when this session's token was issued (epoch seconds)


async def get_current_session(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> CurrentSession:
    # Session cookie first; Bearer header kept as a fallback for scripts/tools.
    token = request.cookies.get(settings.cookie_name)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        raise _unauthorized("Not authenticated")
    try:
        claims = decode_token(token)
    except TokenError as exc:
        raise _unauthorized(str(exc))

    user = await db.get(User, claims.user_id)
    if user is None or not user.is_active:
        raise _unauthorized("Invalid token")
    if claims.ver != (user.token_version or 0):
        # Revoked by a password change or "log out of all devices".
        raise _unauthorized("Invalid token")
    return CurrentSession(user=user, iat=claims.iat)


async def get_current_user(session: CurrentSession = Depends(get_current_session)) -> User:
    return session.user
