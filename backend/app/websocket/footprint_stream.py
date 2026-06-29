"""
Footprint WebSocket endpoint — /ws/footprint/{symbol}/{interval}

Architecture
────────────
One shared FootprintAccumulator per (symbol, interval) pair is fed by a
single background asyncio task that streams Binance aggTrades.  Multiple
browser connections share the same accumulator via an asyncio.Queue per
subscriber.  This avoids opening a new Binance connection per client.

Messages sent to clients
────────────────────────
  {"type": "historical", "footprints": [...]}   → on connect (may be empty on cold start)
  {"type": "update",    "footprint": {...}}      → each time a 1-min candle closes
  {"type": "partial",   "footprint": {...}}      → every ~2 s for the current open candle
"""

import asyncio
import json
import time

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.analytics.footprint import FootprintAccumulator

router = APIRouter()

_BINANCE_WS = "wss://stream.binance.com:9443/ws"

# ── Module-level shared state (one set per symbol) ──────────────────────────
_accumulators: dict[str, FootprintAccumulator] = {}
_subscribers:  dict[str, set[asyncio.Queue]] = {}
_bg_tasks:     dict[str, asyncio.Task] = {}


def _key(symbol: str, interval: str) -> str:
    return f"{symbol.lower()}@{interval}"


async def _agg_trade_loop(symbol: str, interval: str) -> None:
    """
    Connects to Binance aggTrade stream and feeds the shared accumulator.
    Broadcasts `update` and `partial` events to all subscribed queues.
    Auto-reconnects on error.
    """
    k = _key(symbol, interval)
    acc = _accumulators[k]
    url = f"{_BINANCE_WS}/{symbol.lower()}@aggTrade"

    while True:
        try:
            async with websockets.connect(url) as bws:
                async for raw in bws:
                    trade = json.loads(raw)
                    now = time.monotonic()

                    completed = acc.process_trade(trade)
                    if completed:
                        subs = list(_subscribers.get(k, set()))
                        for q in subs:
                            await q.put(("update", completed))

                    if acc.should_emit_partial(now):
                        partial = acc.get_current_partial()
                        if partial and partial["levels"]:
                            subs = list(_subscribers.get(k, set()))
                            for q in subs:
                                await q.put(("partial", partial))

        except Exception:
            await asyncio.sleep(2)


def _ensure_running(symbol: str, interval: str) -> None:
    """Start the background accumulator task if not already running."""
    k = _key(symbol, interval)

    if k not in _accumulators:
        _accumulators[k] = FootprintAccumulator(max_candles=50, partial_interval=2.0, symbol=symbol)
        _subscribers[k] = set()

    task = _bg_tasks.get(k)
    if task is None or task.done():
        _bg_tasks[k] = asyncio.create_task(_agg_trade_loop(symbol, interval))


# ── WebSocket handler ────────────────────────────────────────────────────────

@router.websocket("/ws/footprint/{symbol}/{interval}")
async def footprint_stream(ws: WebSocket, symbol: str, interval: str) -> None:
    await ws.accept()

    _ensure_running(symbol, interval)
    k = _key(symbol, interval)
    acc = _accumulators[k]

    # Send whatever has been accumulated so far (empty on cold start)
    try:
        await ws.send_json({
            "type": "historical",
            "footprints": acc.get_historical(),
        })
    except Exception:
        return

    # Subscribe this connection to broadcast events
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers[k].add(queue)

    try:
        while True:
            # Wait up to 3 s so the loop stays alive even if no trades arrive
            try:
                event_type, data = await asyncio.wait_for(queue.get(), timeout=3.0)
                await ws.send_json({"type": event_type, "footprint": data})
            except asyncio.TimeoutError:
                pass  # keep looping
            except (WebSocketDisconnect, Exception):
                break
    finally:
        _subscribers[k].discard(queue)
