from sqlalchemy import BigInteger, Column, Float, String, UniqueConstraint
from app.core.database import Base


class CandleRecord(Base):
    __tablename__ = "candles"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False)
    interval = Column(String(5), nullable=False)
    timestamp = Column(BigInteger, nullable=False)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("symbol", "interval", "timestamp", name="uq_candle"),
    )
