"""
DOM (Depth of Market) WebSocket — /ws/dom/{symbol}

Mirrors heatmap_stream.py's connection pattern exactly: one shared Binance
depth20@100ms connection per symbol, fanned out to all connected clients.
Unlike HeatmapAccumulator (which merges bids+asks into one side-less dict and
normalizes to 0-1 for the chart-overlay heatmap), this keeps bids and asks
separate and raw — real prices, real quantities — for a live order-book
ladder.

Messages sent to clients:
  {"type": "snapshot", "bids": [[price, qty], ...], "asks": [[price, qty], ...]}
"""

import asyncio
import json

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

_BINANCE_WS      = "wss://stream.binance.com:9443/ws"
_BROADCAST_SECS  = 0.18  # ~5-6 updates/sec — smooth without hammering the browser
_LEVELS          = 20

_books   : dict[str, dict]              = {}  # symbol -> {"bids": [...], "asks": [...]}
_clients : dict[str, set[WebSocket]]    = {}
_tasks   : dict[str, list[asyncio.Task]] = {}


def _parse_side(raw: list, reverse: bool) -> list[list[float]]:
    """Convert [["price","qty"], ...] strings into sorted [[price, qty], ...] floats."""
    levels = [[float(p), float(q)] for p, q in raw if float(q) > 0]
    levels.sort(key=lambda lv: lv[0], reverse=reverse)
    return levels[:_LEVELS]


async def _book_task(symbol: str) -> None:
    """Keep the raw book in sync with Binance depth20 (same feed heatmap uses)."""
    url = f"{_BINANCE_WS}/{symbol.lower()}@depth20@100ms"
    while True:
        try:
            async with websockets.connect(url) as bws:
                async for raw in bws:
                    data = json.loads(raw)
                    _books[symbol] = {
                        "bids": _parse_side(data.get("bids", []), reverse=True),
                        "asks": _parse_side(data.get("asks", []), reverse=False),
                    }
        except asyncio.CancelledError:
            return
        except Exception:
            await asyncio.sleep(2)


async def _broadcast_task(symbol: str) -> None:
    """Throttled fan-out: send the latest book to all clients a few times/sec."""
    while True:
        try:
            await asyncio.sleep(_BROADCAST_SECS)
            book = _books.get(symbol)
            if book is None:
                continue

            msg = json.dumps({"type": "snapshot", "bids": book["bids"], "asks": book["asks"]})
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
            pass


@router.websocket("/ws/dom/{symbol}")
async def dom_stream(ws: WebSocket, symbol: str) -> None:
    symbol = symbol.upper()
    await ws.accept()

    _clients.setdefault(symbol, set()).add(ws)

    existing = _tasks.get(symbol, [])
    if not existing or all(t.done() for t in existing):
        _tasks[symbol] = [
            asyncio.create_task(_book_task(symbol)),
            asyncio.create_task(_broadcast_task(symbol)),
        ]

    # Send whatever's already in the book immediately, rather than waiting for
    # the next broadcast tick.
    book = _books.get(symbol)
    if book is not None:
        try:
            await ws.send_json({"type": "snapshot", "bids": book["bids"], "asks": book["asks"]})
        except Exception:
            _clients[symbol].discard(ws)
            return

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
            _books.pop(symbol, None)
