"""
Heatmap WebSocket — /ws/heatmap/{symbol}

One Binance depth20@100ms connection and one 1-second snapshot task are shared
per symbol across all connected clients (same fan-out pattern as whale_stream).

Messages sent to clients:
  {"type": "historical", "snapshots": [...], "price_min": N, "price_max": N}
  {"type": "snapshot",   "snapshot":  {...}}
"""

import asyncio
import json

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.analytics.heatmap import HeatmapAccumulator, SNAPSHOT_SECS

router = APIRouter()

_BINANCE_WS   = "wss://stream.binance.com:9443/ws"

_accumulators : dict[str, HeatmapAccumulator] = {}
_clients      : dict[str, set[WebSocket]]     = {}
_tasks        : dict[str, list[asyncio.Task]] = {}


async def _book_task(symbol: str) -> None:
    """Keep the accumulator's live book in sync with Binance depth20."""
    acc = _accumulators[symbol]
    url = f"{_BINANCE_WS}/{symbol.lower()}@depth20@100ms"
    while True:
        try:
            async with websockets.connect(url) as bws:
                async for raw in bws:
                    data = json.loads(raw)
                    acc.update(data.get("bids", []), data.get("asks", []))
        except asyncio.CancelledError:
            return
        except Exception:
            await asyncio.sleep(2)


async def _snapshot_task(symbol: str) -> None:
    """Every second: commit a snapshot and fan it out to all connected clients."""
    acc = _accumulators[symbol]
    while True:
        try:
            await asyncio.sleep(SNAPSHOT_SECS)
            acc.take_snapshot()

            snap = acc.normalized_latest()
            if snap is None:
                continue

            msg  = json.dumps({"type": "snapshot", "snapshot": snap})
            dead : set[WebSocket] = set()
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
            pass


@router.websocket("/ws/heatmap/{symbol}")
async def heatmap_stream(ws: WebSocket, symbol: str) -> None:
    symbol = symbol.upper()
    await ws.accept()

    if symbol not in _accumulators:
        _accumulators[symbol] = HeatmapAccumulator()

    _clients.setdefault(symbol, set()).add(ws)

    # Start background tasks if not already running for this symbol
    existing = _tasks.get(symbol, [])
    if not existing or all(t.done() for t in existing):
        _tasks[symbol] = [
            asyncio.create_task(_book_task(symbol)),
            asyncio.create_task(_snapshot_task(symbol)),
        ]

    # Send accumulated history immediately on connect
    snapshots, price_min, price_max = _accumulators[symbol].normalized_snapshots()
    try:
        await ws.send_json({
            "type":      "historical",
            "snapshots": snapshots,
            "price_min": price_min,
            "price_max": price_max,
        })
    except Exception:
        _clients[symbol].discard(ws)
        return

    # Hold connection open; _snapshot_task pushes live updates
    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        _clients[symbol].discard(ws)
        if not _clients[symbol]:
            for t in _tasks.pop(symbol, []):
                t.cancel()
            _accumulators.pop(symbol, None)
