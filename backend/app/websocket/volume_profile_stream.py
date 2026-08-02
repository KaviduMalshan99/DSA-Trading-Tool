"""
Volume Profile WebSocket — /ws/vprofile/{symbol}/{interval}

On connect: fetches 200 klines from Binance REST, computes volume profile,
sends snapshot immediately.  Re-fetches every 60 s and pushes an update.

Messages:
  {"type": "snapshot", "profile": {...}}   — sent immediately on connect
  {"type": "update",   "profile": {...}}   — sent every 60 s while connected
"""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.analytics.volume_profile import fetch_and_build
from app.analytics.price_step import fetch_current_price, price_step_for

router = APIRouter()


@router.websocket("/ws/vprofile/{symbol}/{interval}")
async def vprofile_stream(ws: WebSocket, symbol: str, interval: str) -> None:
    await ws.accept()

    # Price is fetched once per connection; the resulting tick size stays
    # fixed for every subsequent refresh so bucket boundaries don't drift.
    try:
        price = await fetch_current_price(symbol)
        tick_size = price_step_for(price)
    except Exception:
        tick_size = 1.0

    # Initial snapshot
    try:
        profile = await fetch_and_build(symbol, interval, tick_size=tick_size)
        await ws.send_json({"type": "snapshot", "profile": profile})
    except Exception as exc:
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close(code=1011)
        return

    # Periodic updates — re-compute every 60 s
    try:
        while True:
            await asyncio.sleep(60)
            try:
                profile = await fetch_and_build(symbol, interval, tick_size=tick_size)
                await ws.send_json({"type": "update", "profile": profile})
            except Exception:
                pass  # keep the connection alive even if one fetch fails
    except (WebSocketDisconnect, Exception):
        pass
