from dataclasses import dataclass


@dataclass
class DeltaBar:
    timestamp: int
    buy_volume: float
    sell_volume: float
    delta: float
    cumulative_delta: float


def compute_delta(trades: list[dict]) -> list[DeltaBar]:
    """Aggregate raw trades into per-bar delta values.

    trades: list of {t, p, q, m} dicts
    m=True  → buyer is maker → sell aggressor
    m=False → buyer is taker → buy aggressor
    """
    if not trades:
        return []

    bars: dict[int, DeltaBar] = {}
    cumulative = 0.0

    for trade in sorted(trades, key=lambda x: x["t"]):
        bar_ts = trade["t"] - (trade["t"] % 60_000)

        if bar_ts not in bars:
            bars[bar_ts] = DeltaBar(
                timestamp=bar_ts,
                buy_volume=0.0,
                sell_volume=0.0,
                delta=0.0,
                cumulative_delta=cumulative,
            )

        bar = bars[bar_ts]
        qty = float(trade["q"])

        if trade["m"]:
            bar.sell_volume += qty
        else:
            bar.buy_volume += qty

        bar.delta = bar.buy_volume - bar.sell_volume

    for bar in bars.values():
        cumulative += bar.delta
        bar.cumulative_delta = cumulative

    return sorted(bars.values(), key=lambda b: b.timestamp)


def klines_to_delta_bars(
    klines: list[list],
    start_cvd: float = 0.0,
    session_start_ms: int | None = None,
) -> tuple[list[dict], float]:
    """Convert Binance kline rows into delta dicts using taker-buy volume.

    Binance kline index reference:
      [0]  open time
      [5]  base asset volume (total)
      [9]  taker buy base asset volume

    `session_start_ms`, when given, drops any row before it — defensive
    filtering for callers (delta_stream.py) that already fetch from a
    session boundary but want the guarantee enforced here too. Callers that
    just want delta over an arbitrary window (e.g. absorption.py) leave it
    None and get the old unfiltered behavior.

    Each bar also carries a candlestick view of the *cumulative* delta
    (cvd_open/high/low/close) for the CVD-candles display. A kline only
    gives us the bar's net delta, not the intra-bar path the trades actually
    took, so high/low are approximated as the open/close bracketing the
    move (i.e. we assume the running CVD moved monotonically within the
    bar) — the same kind of honest approximation used for footprint history
    reconstructed from klines.

    Returns (bars, final_cvd) so callers can chain CVD across batches.
    """
    bars: list[dict] = []
    cvd = start_cvd
    for row in klines:
        if session_start_ms is not None and int(row[0]) < session_start_ms:
            continue
        buy_vol = float(row[9])
        total_vol = float(row[5])
        sell_vol = total_vol - buy_vol
        delta = buy_vol - sell_vol
        cvd_open = cvd
        cvd_close = cvd + delta
        cvd = cvd_close
        bars.append(
            {
                "time": int(row[0]),
                "buy_volume": round(buy_vol, 4),
                "sell_volume": round(sell_vol, 4),
                "delta": round(delta, 4),
                "cvd": round(cvd_close, 4),
                "cvd_open": round(cvd_open, 4),
                "cvd_high": round(max(cvd_open, cvd_close), 4),
                "cvd_low": round(min(cvd_open, cvd_close), 4),
                "cvd_close": round(cvd_close, 4),
            }
        )
    return bars, cvd
