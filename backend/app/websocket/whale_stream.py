"""
Whale Detector WebSocket — /ws/whales/{symbol}

A "whale trade" is a single aggTrade with notional > WHALE_THRESHOLD USD.

Architecture: one Binance aggTrade connection is shared per symbol across all
connected frontend clients. The connection is started when the first client
connects and cancelled when the last client disconnects.

Messages sent to clients:
  {"type": "historical", "trades": [...]}   — on connect, last 50 whale trades
  {"type": "whale", "trade": {...}}          — each new whale event
"""

import asyncio
import json
import time
from collections import deque

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

WHALE_THRESHOLD  = 500_000  # USD notional
MAX_HISTORY      = 50
RECENT_WINDOW_MS = 10 * 60 * 1_000  # 10 minutes in ms

_BINANCE_WS = "wss://stream.binance.com:9443/ws"

# Per-symbol shared state (all async, single-threaded — no locking needed)
_history: dict[str, deque] = {}
_clients: dict[str, set[WebSocket]] = {}
_tasks: dict[str, asyncio.Task] = {}


async def _binance_listener(symbol: str) -> None:
    """Fan out whale events from one Binance aggTrade stream to all clients."""
    url = f"{_BINANCE_WS}/{symbol.lower()}@aggTrade"
    while True:
        try:
            async with websockets.connect(url) as bws:
                async for raw in bws:
                    trade = json.loads(raw)
                    price = float(trade["p"])
                    qty = float(trade["q"])
                    notional = price * qty

                    if notional < WHALE_THRESHOLD:
                        continue

                    is_maker: bool = trade["m"]
                    event = {
                        "time": trade["T"],
                        "price": round(price, 8),
                        "quantity": round(qty, 8),
                        "notional": round(notional, 2),
                        "side": "sell" if is_maker else "buy",
                        "is_maker": is_maker,
                    }

                    hist = _history.setdefault(symbol, deque(maxlen=MAX_HISTORY))
                    hist.appendleft(event)

                    msg = json.dumps({"type": "whale", "trade": event})
                    dead: set[WebSocket] = set()
                    for client in list(_clients.get(symbol, set())):
                        try:
                            await client.send_text(msg)
                        except Exception:
                            dead.add(client)
                    for d in dead:
                        _clients[symbol].discard(d)

        except asyncio.CancelledError:
            return
        except Exception:
            await asyncio.sleep(3)


@router.websocket("/ws/whales/{symbol}")
async def whale_stream(ws: WebSocket, symbol: str) -> None:
    symbol = symbol.upper()
    await ws.accept()

    # Register this client
    _clients.setdefault(symbol, set()).add(ws)

    # Start shared Binance listener if not already running
    task = _tasks.get(symbol)
    if task is None or task.done():
        _tasks[symbol] = asyncio.create_task(_binance_listener(symbol))

    # Send only recent history (last 10 min, max 10 trades)
    cutoff_ms = int(time.time() * 1_000) - RECENT_WINDOW_MS
    recent = [t for t in _history.get(symbol, []) if t["time"] > cutoff_ms][:10]
    try:
        await ws.send_json({"type": "historical", "trades": recent})
    except Exception:
        _clients[symbol].discard(ws)
        return

    # Hold connection open; the listener task pushes new events
    try:
        while True:
            await ws.receive_text()  # raises WebSocketDisconnect on close
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        _clients[symbol].discard(ws)
        if not _clients[symbol] and symbol in _tasks:
            _tasks[symbol].cancel()
