import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .manager import manager

router = APIRouter()


@router.websocket("/ws/{channel:path}")
async def websocket_endpoint(ws: WebSocket, channel: str):
    """
    Generic WebSocket endpoint.
    channel format: candles:BTCUSDT:1m | trades:BTCUSDT | depth:BTCUSDT
    """
    await ws.accept()
    await manager.subscribe(ws, channel)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("action") == "subscribe":
                new_channel = msg.get("channel", "")
                if new_channel:
                    await manager.subscribe(ws, new_channel)
            elif msg.get("action") == "unsubscribe":
                old_channel = msg.get("channel", "")
                if old_channel:
                    await manager.unsubscribe(ws, old_channel)
    except WebSocketDisconnect:
        await manager.disconnect(ws)
