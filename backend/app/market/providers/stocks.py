import aiohttp
import asyncio
from typing import AsyncGenerator
from .base import BaseProvider, Candle, Trade, OrderBookDepth
from app.core.config import settings


class StocksProvider(BaseProvider):
    """Polygon.io-based US stocks provider."""

    REST_BASE = "https://api.polygon.io"

    async def connect(self):
        pass

    async def disconnect(self):
        pass

    async def subscribe_candles(
        self, symbol: str, interval: str
    ) -> AsyncGenerator[Candle, None]:
        while True:
            candle = await self._fetch_latest(symbol, interval)
            if candle:
                yield candle
            await asyncio.sleep(60)

    async def _fetch_latest(self, symbol: str, interval: str) -> Candle | None:
        url = f"{self.REST_BASE}/v2/aggs/ticker/{symbol}/prev"
        params = {"apiKey": settings.stocks_api_key}
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                if not data.get("results"):
                    return None
                bar = data["results"][0]
                return Candle(
                    symbol=symbol,
                    timestamp=bar["t"],
                    open=float(bar["o"]),
                    high=float(bar["h"]),
                    low=float(bar["l"]),
                    close=float(bar["c"]),
                    volume=float(bar["v"]),
                    interval=interval,
                )

    async def subscribe_trades(self, symbol: str) -> AsyncGenerator[Trade, None]:
        raise NotImplementedError("Use Polygon WebSocket for real-time trades")

    async def subscribe_depth(self, symbol: str) -> AsyncGenerator[OrderBookDepth, None]:
        raise NotImplementedError("Depth stream not supported for stocks")

    async def get_symbols(self) -> list[str]:
        return ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY"]
