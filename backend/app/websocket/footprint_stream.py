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
import logging
import time

import aiohttp
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.analytics.footprint import FootprintAccumulator, klines_to_footprint_bars
from app.analytics.price_step import fetch_tick_size, fetch_typical_range, footprint_step_for

logger = logging.getLogger(__name__)

router = APIRouter()

_BINANCE_WS   = "wss://stream.binance.com:9443/ws"
_BINANCE_REST = "https://api.binance.com"

# The accumulator buckets trades by wall-clock minute regardless of the
# requested interval, so backfill must be 1m to line up with what the live
# path produces.
_BACKFILL_INTERVAL = "1m"
_BACKFILL_CANDLES  = 50  # matches FootprintAccumulator(max_candles=50)
_BACKFILL_RETRIES  = 3
_BACKFILL_RETRY_DELAY = 0.75  # seconds between attempts

# ── Module-level shared state (one set per symbol) ──────────────────────────
_accumulators: dict[str, FootprintAccumulator] = {}
_subscribers:  dict[str, set[asyncio.Queue]] = {}
_bg_tasks:     dict[str, asyncio.Task] = {}
_init_locks:   dict[str, asyncio.Lock] = {}


def _key(symbol: str, interval: str) -> str:
    return f"{symbol.lower()}@{interval}"


async def _fetch_klines(symbol: str, interval: str, limit: int) -> list[list]:
    """Recent OHLCV rows used to approximate footprint history on cold start."""
    url = f"{_BINANCE_REST}/api/v3/klines"
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(
            url, params={"symbol": symbol.upper(), "interval": interval, "limit": limit}
        ) as resp:
            resp.raise_for_status()
            return await resp.json()


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


async def _create_accumulator(symbol: str, k: str) -> None:
    """
    Build the accumulator for `k` and seed it with approximated history.

    Both Binance lookups are best-effort: a failure degrades to the previous
    behaviour (default step / empty history) rather than failing the connect.
    """
    try:
        tick_size = await fetch_tick_size(symbol)
        typical_range = await fetch_typical_range(symbol)
        step = footprint_step_for(typical_range, tick_size)
    except Exception:
        step = 1.0

    acc = FootprintAccumulator(max_candles=_BACKFILL_CANDLES, partial_interval=2.0, price_step=step)

    # Backfill: without this, get_historical() returns [] on cold start and the
    # overlay can only ever draw the single candle currently forming.
    #
    # Retried: this accumulator is created exactly once per (symbol, interval)
    # key for the lifetime of the process (module-level dict — see top-level
    # docstring), and `uvicorn --reload` restarts that process, and wipes this
    # dict, on every backend file save. A single unretried failure here (a
    # timeout, a transient Binance blip, a 429 from the several other
    # endpoints in this app hitting Binance REST concurrently) used to leave
    # that accumulator permanently seeded with zero history for the rest of
    # the process's life — the footprint ladder would then only ever show
    # however many live minutes had accumulated since, which is exactly the
    # "sometimes 50 candles, sometimes 2-3 near-empty" symptom this fixes.
    for attempt in range(1, _BACKFILL_RETRIES + 1):
        try:
            klines = await _fetch_klines(symbol, _BACKFILL_INTERVAL, _BACKFILL_CANDLES + 1)
            # Drop the last row — it's the in-progress candle, which the live path
            # owns and will emit as `partial`.
            acc.seed_completed(klines_to_footprint_bars(klines[:-1], acc.step, acc.decimals))
            break
        except Exception as exc:
            if attempt == _BACKFILL_RETRIES:
                logger.warning(
                    "Footprint backfill failed for %s after %d attempts — "
                    "starting with no history: %s", k, _BACKFILL_RETRIES, exc,
                )
            else:
                await asyncio.sleep(_BACKFILL_RETRY_DELAY)

    _accumulators[k] = acc
    _subscribers.setdefault(k, set())


async def _ensure_running(symbol: str, interval: str) -> None:
    """Start the background accumulator task if not already running."""
    k = _key(symbol, interval)

    if k not in _accumulators:
        # Two clients connecting at once would otherwise both run the Binance
        # lookups and the second would discard the first's accumulator.
        lock = _init_locks.setdefault(k, asyncio.Lock())
        async with lock:
            if k not in _accumulators:
                await _create_accumulator(symbol, k)

    task = _bg_tasks.get(k)
    if task is None or task.done():
        _bg_tasks[k] = asyncio.create_task(_agg_trade_loop(symbol, interval))


# ── WebSocket handler ────────────────────────────────────────────────────────

@router.websocket("/ws/footprint/{symbol}/{interval}")
async def footprint_stream(ws: WebSocket, symbol: str, interval: str) -> None:
    await ws.accept()

    await _ensure_running(symbol, interval)
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
