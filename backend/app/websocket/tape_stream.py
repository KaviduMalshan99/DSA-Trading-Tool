"""
Tape (Time & Sales) WebSocket — /ws/tape/{symbol}

Mirrors delta_stream.py / footprint_stream.py's aggTrade connection pattern
(same feed, same per-symbol-shared-across-clients lifecycle as heatmap_stream.py
and dom_stream.py) but forwards every trade RAW instead of aggregating it into
bars. Deliberately does not use trade_collector.py — dead code, see PROJECT.md.

Side interpretation matches delta_stream.py exactly, so Tape and Delta/CVD
never disagree about which side was the aggressor:
  m=True  -> buyer is maker -> seller is aggressor -> side="sell"
  m=False -> buyer is taker -> buyer is aggressor  -> side="buy"

Messages sent to clients (all trade arrays are oldest-first / chronological;
the frontend is responsible for displaying newest-first):
  {"type": "historical", "trades": [...]}   -> on connect, last _HISTORY_MAX trades
  {"type": "trades",     "trades": [...]}   -> batched live trades, flushed ~5-6x/sec
"""

import asyncio
import json
from collections import deque

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

_BINANCE_WS  = "wss://stream.binance.com:9443/ws"
_FLUSH_SECS  = 0.18   # batch flush interval — smooth bursts instead of one msg/trade
_HISTORY_MAX = 150    # rolling backlog sent to newly-connected clients

_history : dict[str, deque]              = {}
_buffers : dict[str, list[dict]]         = {}
_clients : dict[str, set[WebSocket]]     = {}
_tasks   : dict[str, list[asyncio.Task]] = {}


def _parse_trade(raw: dict) -> dict:
    return {
        "price": float(raw["p"]),
        "qty":   float(raw["q"]),
        "time":  raw["T"],
        "side":  "sell" if raw["m"] else "buy",
    }


async def _trade_task(symbol: str) -> None:
    """Keep receiving aggTrade and appending to this symbol's history + pending buffer."""
    url = f"{_BINANCE_WS}/{symbol.lower()}@aggTrade"
    while True:
        try:
            async with websockets.connect(url) as bws:
                async for raw in bws:
                    trade = _parse_trade(json.loads(raw))
                    _history.setdefault(symbol, deque(maxlen=_HISTORY_MAX)).append(trade)
                    _buffers.setdefault(symbol, []).append(trade)
        except asyncio.CancelledError:
            return
        except Exception:
            await asyncio.sleep(2)


async def _flush_task(symbol: str) -> None:
    """Throttled fan-out: flush whatever trades arrived since the last tick."""
    while True:
        try:
            await asyncio.sleep(_FLUSH_SECS)
            buf = _buffers.get(symbol)
            if not buf:
                continue
            _buffers[symbol] = []

            msg = json.dumps({"type": "trades", "trades": buf})
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


@router.websocket("/ws/tape/{symbol}")
async def tape_stream(ws: WebSocket, symbol: str) -> None:
    symbol = symbol.upper()
    await ws.accept()

    _clients.setdefault(symbol, set()).add(ws)

    existing = _tasks.get(symbol, [])
    if not existing or all(t.done() for t in existing):
        _tasks[symbol] = [
            asyncio.create_task(_trade_task(symbol)),
            asyncio.create_task(_flush_task(symbol)),
        ]

    hist = _history.get(symbol)
    if hist:
        try:
            await ws.send_json({"type": "historical", "trades": list(hist)})
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
            _history.pop(symbol, None)
            _buffers.pop(symbol, None)
