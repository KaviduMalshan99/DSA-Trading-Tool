from sqlalchemy import BigInteger, Column, ForeignKey, Integer, String, Text
from app.core.database import Base


class UserData(Base):
    """One synced localStorage entry per (user, key). `value` is the exact
    localStorage string — some keys hold raw strings, not JSON, so it is never parsed."""

    __tablename__ = "user_data"

    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    key = Column(String(200), primary_key=True)
    value = Column(Text, nullable=False)
    version = Column(Integer, nullable=False, default=1)  # bumped on every update (optimistic concurrency)
    updated_at = Column(BigInteger, nullable=False)  # epoch ms
