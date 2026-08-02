"""
Whale Detector WebSocket — /ws/whales/{symbol}

A "whale trade" is a single aggTrade with notional > that symbol's own whale
threshold. The threshold is derived per-symbol (not a flat USD figure) from a
sample of that symbol's own recent trade sizes, so a "whale" means genuinely
big for BTC and genuinely big for a cheap/illiquid coin alike.

Architecture: one Binance aggTrade connection is shared per symbol across all
connected frontend clients. The connection is started when the first client
connects and cancelled when the last client disconnects. The threshold is
(re)computed each time the listener (re)starts.

Messages sent to clients:
  {"type": "historical", "trades": [...], "threshold": <float>}  — on connect
  {"type": "whale", "trade": {...}}                                — each new whale event
"""

import asyncio
import json
import logging
import time
from collections import deque

import aiohttp
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger(__name__)

# Per-symbol threshold = this percentile of recent trade notionals — i.e. a
# "whale" is a trade in roughly the top 3% by size for that specific symbol.
THRESHOLD_PERCENTILE = 0.97
SAMPLE_SIZE          = 1000     # recent aggTrades fetched to derive the threshold
MIN_THRESHOLD         = 1_000.0    # floor so "whale" stays meaningful even on illiquid coins
FALLBACK_THRESHOLD    = 100_000.0  # used if the REST sample can't be fetched

MAX_HISTORY      = 50
RECENT_WINDOW_MS = 10 * 60 * 1_000  # 10 minutes in ms

_BINANCE_WS  = "wss://stream.binance.com:9443/ws"
_BINANCE_REST = "https://api.binance.com/api/v3/aggTrades"

# Per-symbol shared state (all async, single-threaded — no locking needed)
_history:    dict[str, deque] = {}
_clients:    dict[str, set[WebSocket]] = {}
_tasks:      dict[str, asyncio.Task] = {}
_thresholds: dict[str, float] = {}


async def _compute_threshold(symbol: str) -> float:
    """Derive a whale threshold from this symbol's own recent trade sizes."""
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
            async with session.get(_BINANCE_REST, params={"symbol": symbol, "limit": SAMPLE_SIZE}) as resp:
                data = await resp.json()
        notionals = sorted(float(t["p"]) * float(t["q"]) for t in data)
        if not notionals:
            raise ValueError("no recent trades returned")
        idx = min(int(len(notionals) * THRESHOLD_PERCENTILE), len(notionals) - 1)
        threshold = max(notionals[idx], MIN_THRESHOLD)
        logger.info(
            "Whale threshold for %s: $%.0f (%.0fth percentile of %d recent trades)",
            symbol, threshold, THRESHOLD_PERCENTILE * 100, len(notionals),
        )
        return threshold
    except Exception as e:
        logger.warning(
            "Whale threshold sampling failed for %s, using fallback $%.0f (%s: %s)",
            symbol, FALLBACK_THRESHOLD, type(e).__name__, e,
        )
        return FALLBACK_THRESHOLD


async def _binance_listener(symbol: str) -> None:
    """Fan out whale events from one Binance aggTrade stream to all clients."""
    threshold = await _compute_threshold(symbol)
    _thresholds[symbol] = threshold

    url = f"{_BINANCE_WS}/{symbol.lower()}@aggTrade"
    while True:
        try:
            async with websockets.connect(url) as bws:
                async for raw in bws:
                    trade = json.loads(raw)
                    price = float(trade["p"])
                    qty = float(trade["q"])
                    notional = price * qty

                    if notional < threshold:
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
            logger.info("Whale listener for %s cancelled (no clients left).", symbol)
            return
        except Exception as e:
            logger.warning(
                "Whale listener for %s lost connection (%s: %s) — reconnecting in 3s.",
                symbol, type(e).__name__, e,
            )
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
        await ws.send_json({
            "type": "historical",
            "trades": recent,
            "threshold": _thresholds.get(symbol),
        })
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
