import json
import asyncio
from app.market.providers.base import BaseProvider, Candle
from app.core.redis import publish, cache_set


class CandleCollector:
    """Streams candles from a provider and fans out via Redis pub/sub."""

    def __init__(self, provider: BaseProvider):
        self.provider = provider
        self._tasks: list[asyncio.Task] = []

    async def start(self, symbol: str, interval: str):
        task = asyncio.create_task(self._stream(symbol, interval))
        self._tasks.append(task)

    async def stop_all(self):
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    async def _stream(self, symbol: str, interval: str):
        async for candle in self.provider.subscribe_candles(symbol, interval):
            payload = self._serialize(candle)
            channel = f"candles:{symbol}:{interval}"
            await publish(channel, payload)
            await cache_set(f"latest_candle:{symbol}:{interval}", payload)

    @staticmethod
    def _serialize(candle: Candle) -> str:
        return json.dumps({
            "symbol": candle.symbol,
            "t": candle.timestamp,
            "o": candle.open,
            "h": candle.high,
            "l": candle.low,
            "c": candle.close,
            "v": candle.volume,
            "interval": candle.interval,
        })
