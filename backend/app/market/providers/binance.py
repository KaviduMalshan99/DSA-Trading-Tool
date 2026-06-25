import json
import asyncio
import websockets
from typing import AsyncGenerator
from .base import BaseProvider, Candle, Trade, OrderBookDepth
from app.core.config import settings


class BinanceProvider(BaseProvider):
    def __init__(self):
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._subscriptions: dict[str, asyncio.Queue] = {}

    async def connect(self):
        pass  # Connections are per-stream for Binance

    async def disconnect(self):
        if self._ws:
            await self._ws.close()

    async def subscribe_candles(
        self, symbol: str, interval: str
    ) -> AsyncGenerator[Candle, None]:
        stream = f"{symbol.lower()}@kline_{interval}"
        url = f"{settings.binance_ws_url}/{stream}"
        async with websockets.connect(url) as ws:
            async for raw in ws:
                data = json.loads(raw)
                k = data["k"]
                yield Candle(
                    symbol=symbol,
                    timestamp=k["t"],
                    open=float(k["o"]),
                    high=float(k["h"]),
                    low=float(k["l"]),
                    close=float(k["c"]),
                    volume=float(k["v"]),
                    interval=interval,
                )

    async def subscribe_trades(
        self, symbol: str
    ) -> AsyncGenerator[Trade, None]:
        stream = f"{symbol.lower()}@aggTrade"
        url = f"{settings.binance_ws_url}/{stream}"
        async with websockets.connect(url) as ws:
            async for raw in ws:
                data = json.loads(raw)
                yield Trade(
                    symbol=symbol,
                    timestamp=data["T"],
                    price=float(data["p"]),
                    quantity=float(data["q"]),
                    is_buyer_maker=data["m"],
                )

    async def subscribe_depth(
        self, symbol: str
    ) -> AsyncGenerator[OrderBookDepth, None]:
        stream = f"{symbol.lower()}@depth20@100ms"
        url = f"{settings.binance_ws_url}/{stream}"
        async with websockets.connect(url) as ws:
            async for raw in ws:
                data = json.loads(raw)
                yield OrderBookDepth(
                    symbol=symbol,
                    timestamp=data.get("T", 0),
                    bids=[[float(p), float(q)] for p, q in data["bids"]],
                    asks=[[float(p), float(q)] for p, q in data["asks"]],
                )

    async def get_symbols(self) -> list[str]:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://api.binance.com/api/v3/exchangeInfo"
            ) as resp:
                data = await resp.json()
                return [s["symbol"] for s in data["symbols"] if s["status"] == "TRADING"]
