from abc import ABC, abstractmethod
from typing import AsyncGenerator
from dataclasses import dataclass


@dataclass
class Candle:
    symbol: str
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    interval: str


@dataclass
class Trade:
    symbol: str
    timestamp: int
    price: float
    quantity: float
    is_buyer_maker: bool


@dataclass
class OrderBookDepth:
    symbol: str
    timestamp: int
    bids: list[list[float]]  # [[price, qty], ...]
    asks: list[list[float]]


class BaseProvider(ABC):
    """Abstract base for all market data providers."""

    @abstractmethod
    async def connect(self): ...

    @abstractmethod
    async def disconnect(self): ...

    @abstractmethod
    async def subscribe_candles(
        self, symbol: str, interval: str
    ) -> AsyncGenerator[Candle, None]: ...

    @abstractmethod
    async def subscribe_trades(
        self, symbol: str
    ) -> AsyncGenerator[Trade, None]: ...

    @abstractmethod
    async def subscribe_depth(
        self, symbol: str
    ) -> AsyncGenerator[OrderBookDepth, None]: ...

    @abstractmethod
    async def get_symbols(self) -> list[str]: ...
