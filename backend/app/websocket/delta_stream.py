import time as _time

import json
import aiohttp
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.analytics.delta import klines_to_delta_bars

router = APIRouter()

_BINANCE_REST = "https://api.binance.com"
_BINANCE_WS = "wss://stream.binance.com:9443/ws"

# Matches candle_stream.py's historical window (Binance's per-request cap) so
# the CVD candle series covers the same span the price chart does, instead of
# being clipped to "today so far" — a UTC-midnight anchor made 1h+ intervals
# render only a handful of candles.
_HISTORY_LIMIT = 1000

_INTERVAL_UNIT_MS = {"m": 60_000, "h": 3_600_000, "d": 86_400_000, "w": 604_800_000}


def _interval_to_ms(interval: str) -> int:
    """'1m' -> 60000, '15m' -> 900000, '1h' -> 3600000, etc."""
    return int(interval[:-1]) * _INTERVAL_UNIT_MS[interval[-1]]


async def _fetch_klines_raw(symbol: str, interval: str, limit: int) -> list[list]:
    """
    Last `limit` raw kline rows (most recent, no startTime) — keeps the
    untransformed rows (needed for taker-buy volume at row[9], which
    `klines_to_delta_bars` reads directly).
    """
    url = f"{_BINANCE_REST}/api/v3/klines"
    timeout = aiohttp.ClientTimeout(total=10)
    params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            return await resp.json()


@router.websocket("/ws/delta/{symbol}/{interval}")
async def delta_stream(ws: WebSocket, symbol: str, interval: str):
    await ws.accept()

    now_ms = int(_time.time() * 1000)

    # ── 1. Historical: last _HISTORY_LIMIT candles → continuous delta bars ──
    # Same window as candle_stream.py's price history, so the CVD panel is a
    # dense candle series spanning the same range as the price chart instead
    # of clipping to "today so far." Cumulative delta runs continuously
    # across the whole window (no daily reset) — a mid-chart reset would
    # otherwise draw an ugly vertical cliff. A session-reset toggle is a
    # future settings-panel item, not built here.
    try:
        klines = await _fetch_klines_raw(symbol, interval, _HISTORY_LIMIT)
        # Binance's klines response includes the still-forming candle as the
        # last row. Seed history only up to the last *closed* candle (close
        # time already in the past) — the live aggTrade loop below owns the
        # forming one, so its delta isn't counted once here and again live.
        closed_klines = [row for row in klines if int(row[6]) <= now_ms]
        historical, last_cvd = klines_to_delta_bars(closed_klines)
        range_start = historical[0]["time"] if historical else now_ms
        await ws.send_json({"type": "historical", "deltas": historical, "range_start": range_start})
    except Exception as exc:
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close(code=1011)
        return

    # ── 2. Live: aggTrade stream, bucket by the chart interval ────────────
    # aggTrade fields used:
    #   T  → trade time (ms)
    #   q  → quantity
    #   m  → buyer is maker (True = sell aggressor, False = buy aggressor)
    binance_url = f"{_BINANCE_WS}/{symbol.lower()}@aggTrade"

    bucket_ms = _interval_to_ms(interval)
    current_bucket: int | None = None
    buy_vol = 0.0
    sell_vol = 0.0

    # cvd is the cumulative delta as of the last *closed* bucket, i.e. the
    # opening value of the bucket currently being built. bucket_cvd is the
    # running value as trades land inside that bucket — its high/low across
    # the bucket's life become the CVD candle's wicks (unlike historical
    # bars, live bars get the real intrabar path from the tick stream, no
    # approximation needed).
    cvd = last_cvd
    bucket_open_cvd = cvd
    bucket_high = cvd
    bucket_low = cvd

    def _start_bucket(bucket_start_ms: int) -> None:
        nonlocal bucket_open_cvd, bucket_high, bucket_low
        # No day-boundary reset: cvd keeps running continuously from the
        # historical seed for as long as the socket stays open (see the
        # historical-fetch comment above) — bucket_start_ms is unused for
        # now but kept as the hook a future session-reset toggle would use.
        bucket_open_cvd = cvd
        bucket_high = cvd
        bucket_low = cvd

    try:
        async with websockets.connect(binance_url) as bws:
            async for raw in bws:
                trade = json.loads(raw)
                trade_ms: int = trade["T"]
                qty: float = float(trade["q"])
                is_maker: bool = trade["m"]

                bucket_start = (trade_ms // bucket_ms) * bucket_ms

                if current_bucket is None:
                    current_bucket = bucket_start
                    _start_bucket(bucket_start)

                if bucket_start != current_bucket:
                    # Current bucket just closed — emit it
                    delta = buy_vol - sell_vol
                    cvd = bucket_open_cvd + delta
                    bar = {
                        "time": current_bucket,
                        "buy_volume": round(buy_vol, 4),
                        "sell_volume": round(sell_vol, 4),
                        "delta": round(delta, 4),
                        "cvd": round(cvd, 4),
                        "cvd_open": round(bucket_open_cvd, 4),
                        "cvd_high": round(bucket_high, 4),
                        "cvd_low": round(bucket_low, 4),
                        "cvd_close": round(cvd, 4),
                    }
                    try:
                        await ws.send_json({"type": "update", "delta": bar})
                    except (WebSocketDisconnect, Exception):
                        return

                    # Start fresh bucket for the new period
                    current_bucket = bucket_start
                    buy_vol = 0.0
                    sell_vol = 0.0
                    _start_bucket(bucket_start)

                # Accumulate current trade into open bucket
                if is_maker:
                    sell_vol += qty   # seller is aggressor
                else:
                    buy_vol += qty    # buyer is aggressor

                running_cvd = bucket_open_cvd + (buy_vol - sell_vol)
                bucket_high = max(bucket_high, running_cvd)
                bucket_low = min(bucket_low, running_cvd)

    except (WebSocketDisconnect, Exception):
        pass
