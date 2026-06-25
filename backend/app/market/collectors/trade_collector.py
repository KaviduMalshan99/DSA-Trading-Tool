import json
import asyncio
from app.market.providers.base import BaseProvider, Trade
from app.core.redis import publish, get_redis


class TradeCollector:
    """Streams raw trades and pushes them to Redis for analytics workers."""

    def __init__(self, provider: BaseProvider, whale_threshold: float = 100_000.0):
        self.provider = provider
        self.whale_threshold = whale_threshold
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
        async for trade in self.provider.subscribe_trades(symbol):
            payload = self._serialize(trade)
            await publish(f"trades:{symbol}", payload)

            notional = trade.price * trade.quantity
            if notional >= self.whale_threshold:
                await publish(f"whales:{symbol}", payload)

            r = await get_redis()
            await r.lpush(f"trade_buffer:{symbol}", payload)
            await r.ltrim(f"trade_buffer:{symbol}", 0, 999)

    @staticmethod
    def _serialize(trade: Trade) -> str:
        return json.dumps({
            "symbol": trade.symbol,
            "t": trade.timestamp,
            "p": trade.price,
            "q": trade.quantity,
            "m": trade.is_buyer_maker,
        })
