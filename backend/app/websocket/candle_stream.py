import asyncio
import json
import aiohttp
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.market.binance_markets import INTERVALS, KLINES_URL, WS_BASE, Market, display_symbol, parse_symbol

router = APIRouter()


async def _fetch_klines(
    market: Market, raw: str, display: str, interval: str, limit: int = 1000, end_time: int | None = None
) -> list[dict]:
    params = {"symbol": raw, "interval": interval, "limit": limit}
    if end_time is not None:
        params["endTime"] = end_time
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(KLINES_URL[market], params=params) as resp:
            resp.raise_for_status()
            rows = await resp.json()
    return [
        {
            "symbol": display,
            "t": row[0],
            "o": float(row[1]),
            "h": float(row[2]),
            "l": float(row[3]),
            "c": float(row[4]),
            "v": float(row[5]),
            "interval": interval,
        }
        for row in rows
    ]


@router.websocket("/ws/candles/{symbol}/{interval}")
async def candle_stream(ws: WebSocket, symbol: str, interval: str):
    await ws.accept()

    try:
        market, raw = parse_symbol(symbol)
    except ValueError:
        await ws.send_json({"type": "error", "message": "invalid symbol"})
        await ws.close(code=1008)
        return
    if interval not in INTERVALS[market]:
        await ws.send_json({"type": "error", "message": "invalid interval"})
        await ws.close(code=1008)
        return
    # Candle payloads carry the display symbol (BTCUSDT.P) so the frontend's
    # symbol matching is the same for both markets.
    display = display_symbol(market, raw)

    # Fetch last 1000 candles (Binance's max per request on both markets) and send immediately
    try:
        historical = await _fetch_klines(market, raw, display, interval, 1000)
        await ws.send_json({"type": "historical", "candles": historical})
    except Exception as exc:
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close(code=1011)
        return

    binance_url = f"{WS_BASE[market]}/{raw.lower()}@kline_{interval}"

    async def relay_live():
        """Forward live Binance kline updates to the client until disconnected."""
        async with websockets.connect(binance_url) as bws:
            async for raw_msg in bws:
                k = json.loads(raw_msg)["k"]
                await ws.send_json({
                    "type": "update",
                    "candle": {
                        "symbol": display,
                        "t": k["t"],
                        "o": float(k["o"]),
                        "h": float(k["h"]),
                        "l": float(k["l"]),
                        "c": float(k["c"]),
                        "v": float(k["v"]),
                        "interval": interval,
                    },
                })

    async def handle_requests():
        """Client asks for older candles (scroll-back pagination) via {"type": "loadMore", "before": <ms>}."""
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "loadMore":
                continue
            before = msg.get("before")
            if not isinstance(before, (int, float)):
                continue
            try:
                older = await _fetch_klines(market, raw, display, interval, 1000, end_time=int(before) - 1)
            except Exception:
                older = []
            await ws.send_json({"type": "historical_prepend", "candles": older})

    # Run the live relay and the client's loadMore requests concurrently;
    # whichever ends first (usually a disconnect) tears both down.
    tasks = [asyncio.create_task(relay_live()), asyncio.create_task(handle_requests())]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for t in done:
            t.exception()  # retrieve to avoid "exception never retrieved" warnings
    except (WebSocketDisconnect, Exception):
        pass
