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


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


class TokenError(Exception):
    pass


def decode_token(token: str) -> int:
    """Return the user id in the token's `sub`, or raise TokenError."""
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
        return int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise TokenError("Invalid token") from exc


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


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Session cookie first; Bearer header kept as a fallback for scripts/tools.
    token = request.cookies.get(settings.cookie_name)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        raise _unauthorized("Not authenticated")
    try:
        user_id = decode_token(token)
    except TokenError as exc:
        raise _unauthorized(str(exc))

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("Invalid token")
    return user
