import json
import asyncio
from app.market.providers.base import BaseProvider, OrderBookDepth
from app.core.redis import publish, cache_set


class DepthCollector:
    """Streams order book snapshots and publishes them for heatmap generation."""

    def __init__(self, provider: BaseProvider):
        self.provider = provider
        self._tasks: list[asyncio.Task] = []

    async def start(self, symbol: str):
        task = asyncio.create_task(self._stream(symbol))
        self._tasks.append(task)

    async def stop_all(self):
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    async def _stream(self, symbol: str):
        async for depth in self.provider.subscribe_depth(symbol):
            payload = self._serialize(depth)
            await publish(f"depth:{symbol}", payload)
            await cache_set(f"latest_depth:{symbol}", payload, ttl=5)

    @staticmethod
    def _serialize(depth: OrderBookDepth) -> str:
        return json.dumps({
            "symbol": depth.symbol,
            "t": depth.timestamp,
            "bids": depth.bids,
            "asks": depth.asks,
        })
