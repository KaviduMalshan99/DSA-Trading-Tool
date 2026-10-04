"""
Email/password auth. The JWT is delivered as an httpOnly session cookie (Stage 2a).

If the database is unavailable these endpoints return 500 — acceptable for now;
the rest of the app keeps running without a DB.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


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
