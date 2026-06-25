import json
import aiohttp
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.analytics.delta import klines_to_delta_bars

router = APIRouter()

_BINANCE_REST = "https://api.binance.com"
_BINANCE_WS = "wss://stream.binance.com:9443/ws"


async def _fetch_klines(symbol: str, interval: str, limit: int = 200) -> list[list]:
    url = f"{_BINANCE_REST}/api/v3/klines"
    params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            return await resp.json()


@router.websocket("/ws/delta/{symbol}/{interval}")
async def delta_stream(ws: WebSocket, symbol: str, interval: str):
    await ws.accept()

    # ── 1. Historical: last 200 klines → delta bars ──────────────────────
    try:
        klines = await _fetch_klines(symbol, interval, 200)
        historical, last_cvd = klines_to_delta_bars(klines)
        await ws.send_json({"type": "historical", "deltas": historical})
    except Exception as exc:
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close(code=1011)
        return

    # ── 2. Live: aggTrade stream, bucket by minute, emit on close ─────────
    # aggTrade fields used:
    #   T  → trade time (ms)
    #   q  → quantity
    #   m  → buyer is maker (True = sell aggressor, False = buy aggressor)
    binance_url = f"{_BINANCE_WS}/{symbol.lower()}@aggTrade"

    current_minute: int | None = None
    buy_vol = 0.0
    sell_vol = 0.0
    cvd = last_cvd

    try:
        async with websockets.connect(binance_url) as bws:
            async for raw in bws:
                trade = json.loads(raw)
                trade_ms: int = trade["T"]
                qty: float = float(trade["q"])
                is_maker: bool = trade["m"]

                minute = (trade_ms // 60_000) * 60_000

                if current_minute is None:
                    current_minute = minute

                if minute != current_minute:
                    # Current minute just closed — emit it
                    delta = buy_vol - sell_vol
                    cvd += delta
                    bar = {
                        "time": current_minute,
                        "buy_volume": round(buy_vol, 4),
                        "sell_volume": round(sell_vol, 4),
                        "delta": round(delta, 4),
                        "cvd": round(cvd, 4),
                    }
                    try:
                        await ws.send_json({"type": "update", "delta": bar})
                    except (WebSocketDisconnect, Exception):
                        return

                    # Start fresh bucket for the new minute
                    current_minute = minute
                    buy_vol = 0.0
                    sell_vol = 0.0

                # Accumulate current trade into open bucket
                if is_maker:
                    sell_vol += qty   # seller is aggressor
                else:
                    buy_vol += qty    # buyer is aggressor

    except (WebSocketDisconnect, Exception):
        pass
