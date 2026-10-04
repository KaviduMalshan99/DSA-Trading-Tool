import time

from sqlalchemy import BigInteger, Boolean, Column, String
from app.core.database import Base


def _now_ms() -> int:
    return int(time.time() * 1000)


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)  # always stored lowercased
    password_hash = Column(String(255), nullable=True)  # null for OAuth-only users (Google, Stage 3)
    auth_provider = Column(String(20), nullable=False, default="email")  # 'email' | 'google'
    google_sub = Column(String(255), nullable=True, unique=True, index=True)  # Google account id (ID token `sub`)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(BigInteger, nullable=False, default=_now_ms)  # epoch ms
