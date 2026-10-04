from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
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


# auto_error=False so a missing header yields our own 401 (HTTPBearer defaults to 403).
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized("Not authenticated")
    try:
        user_id = decode_token(credentials.credentials)
    except TokenError as exc:
        raise _unauthorized(str(exc))

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("Invalid token")
    return user
