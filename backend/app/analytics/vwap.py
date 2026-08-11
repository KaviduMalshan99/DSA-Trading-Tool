"""
Session VWAP — the volume-weighted average price of the current trading day.

    typical_price = (high + low + close) / 3          per candle
    VWAP          = Σ(typical_price × volume) / Σ(volume)

accumulated from the session's first candle onward, so each point is the
running VWAP *as of* that candle — a line that tracks across the day rather
than a single number.

The session resets at 00:00 UTC. That's the same boundary Binance's own 1d
candles use, so this stays consistent with levels.py's daily open / PDH / PDL.
Note the chart *displays* Asia/Colombo wall-clock time (see chartTime.ts), but
the reset is deliberately a fixed UTC day: a viewer-dependent boundary would
make the same symbol show a different VWAP to different people.
"""

from dataclasses import dataclass

from app.analytics.price_step import price_decimals_for

_DAY_MS = 86_400_000


def utc_day_start_ms(epoch_ms: int) -> int:
    """Epoch-ms of 00:00 UTC on the day containing `epoch_ms`."""
    return (epoch_ms // _DAY_MS) * _DAY_MS


@dataclass
class VWAPPoint:
    time: int  # candle open time, epoch ms
    vwap: float


@dataclass
class SessionVWAP:
    points: list[VWAPPoint]
    session_start: int
    decimals: int

    @property
    def current(self) -> float | None:
        """Latest running VWAP, i.e. the session VWAP right now."""
        return self.points[-1].vwap if self.points else None


def compute_session_vwap(
    candles: list[dict],
    tick_size: float,
    session_start: int | None = None,
) -> SessionVWAP:
    """
    `candles` are intraday candles in Binance's chronological order, each
    {"t": open_time_ms, "h", "l", "c", "v"}. Anything before `session_start`
    is ignored, so passing a longer history than one day is harmless.

    `session_start` defaults to the UTC day containing the last candle.
    """
    decimals = price_decimals_for(tick_size)

    if not candles:
        return SessionVWAP(points=[], session_start=session_start or 0, decimals=decimals)

    if session_start is None:
        session_start = utc_day_start_ms(candles[-1]["t"])

    points: list[VWAPPoint] = []
    cum_pv = 0.0
    cum_vol = 0.0

    for candle in candles:
        if candle["t"] < session_start:
            continue
        volume = candle["v"]
        typical_price = (candle["h"] + candle["l"] + candle["c"]) / 3
        cum_pv += typical_price * volume
        cum_vol += volume
        # A zero-volume candle contributes nothing and can't be divided by;
        # skip emitting a point until the session has traded at all.
        if cum_vol <= 0:
            continue
        points.append(VWAPPoint(time=candle["t"], vwap=round(cum_pv / cum_vol, decimals)))

    return SessionVWAP(points=points, session_start=session_start, decimals=decimals)
