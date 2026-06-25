import aiohttp
from typing import AsyncGenerator
from .base import BaseProvider, Candle, Trade, OrderBookDepth
from app.core.config import settings


class ForexProvider(BaseProvider):
    """Alpha Vantage-based forex provider (polling, no native WS)."""

    BASE_URL = "https://www.alphavantage.co/query"

    async def connect(self):
        pass

    async def disconnect(self):
        pass

    async def subscribe_candles(
        self, symbol: str, interval: str
    ) -> AsyncGenerator[Candle, None]:
        # Alpha Vantage uses polling; yield latest candle on each poll
        import asyncio
        while True:
            candle = await self._fetch_latest(symbol, interval)
            if candle:
                yield candle
            await asyncio.sleep(60)

    async def _fetch_latest(self, symbol: str, interval: str) -> Candle | None:
        from_sym, to_sym = symbol[:3], symbol[3:]
        params = {
            "function": "FX_INTRADAY",
            "from_symbol": from_sym,
            "to_symbol": to_sym,
            "interval": interval,
            "apikey": settings.forex_api_key,
        }
        async with aiohttp.ClientSession() as session:
            async with session.get(self.BASE_URL, params=params) as resp:
                data = await resp.json()
                key = f"Time Series FX ({interval})"
                if key not in data:
                    return None
                ts_data = data[key]
                latest_ts = next(iter(ts_data))
                bar = ts_data[latest_ts]
                return Candle(
                    symbol=symbol,
                    timestamp=0,
                    open=float(bar["1. open"]),
                    high=float(bar["2. high"]),
                    low=float(bar["3. low"]),
                    close=float(bar["4. close"]),
                    volume=0.0,
                    interval=interval,
                )

    async def subscribe_trades(self, symbol: str) -> AsyncGenerator[Trade, None]:
        raise NotImplementedError("Forex provider does not support trade stream")

    async def subscribe_depth(self, symbol: str) -> AsyncGenerator[OrderBookDepth, None]:
        raise NotImplementedError("Forex provider does not support depth stream")

    async def get_symbols(self) -> list[str]:
        return ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF"]
