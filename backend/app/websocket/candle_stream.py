import json
import aiohttp
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

_BINANCE_REST = "https://api.binance.com"
_BINANCE_WS = "wss://stream.binance.com:9443/ws"


async def _fetch_klines(symbol: str, interval: str, limit: int = 200) -> list[dict]:
    url = f"{_BINANCE_REST}/api/v3/klines"
    params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            rows = await resp.json()
    return [
        {
            "symbol": symbol.upper(),
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

    # Fetch last 200 candles and send immediately
    try:
        historical = await _fetch_klines(symbol, interval, 200)
        await ws.send_json({"type": "historical", "candles": historical})
    except Exception as exc:
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close(code=1011)
        return

    # Relay live Binance kline updates until client disconnects
    binance_url = f"{_BINANCE_WS}/{symbol.lower()}@kline_{interval}"
    try:
        async with websockets.connect(binance_url) as bws:
            async for raw in bws:
                k = json.loads(raw)["k"]
                try:
                    await ws.send_json({
                        "type": "update",
                        "candle": {
                            "symbol": symbol.upper(),
                            "t": k["t"],
                            "o": float(k["o"]),
                            "h": float(k["h"]),
                            "l": float(k["l"]),
                            "c": float(k["c"]),
                            "v": float(k["v"]),
                            "interval": interval,
                        },
                    })
                except (WebSocketDisconnect, Exception):
                    return
    except (WebSocketDisconnect, Exception):
        pass
