"""
Market structure — swing high / swing low (pivot) detection.

Layer 1 of the market-structure feature: find the peaks and valleys everything
else is defined against. Trend labelling and BOS/CHOCH build on these, so the
pivots need to be right before anything is layered on top.

Fractal/pivot method: a candle is a swing high if its high beats every candle
within `swing_strength` bars on each side, and a swing low if its low is under
every candle in the same window.

Two consequences worth knowing, both inherent to the method rather than to this
implementation:

* The most recent `swing_strength` candles can never be classified — a pivot
  isn't confirmed until enough candles have printed to its right. Swing
  detection always lags the live edge by that many bars.
* Larger `swing_strength` means fewer, more significant pivots; smaller means
  more, noisier ones. It's exposed as a parameter because the useful value
  depends on the timeframe and the coin.
"""

from dataclasses import dataclass

from app.analytics.price_step import price_decimals_for


@dataclass
class SwingPoint:
    time: int             # candle open time, epoch ms
    price: float          # the high (for 'high') or low (for 'low') of that candle
    type: str             # 'high' | 'low'
    label: str | None = None  # 'HH'|'LH' for highs, 'HL'|'LL' for lows; None if unlabelable


@dataclass
class MarketStructure:
    swings: list[SwingPoint]
    swing_strength: int
    decimals: int
    current_trend: str = "range"  # 'up' | 'down' | 'range'


def _label_swings(swings: list[SwingPoint]) -> None:
    """
    Tag each swing against the previous swing of the *same* type: a high is
    HH/LH versus the last high, a low is HL/LL versus the last low.

    The first swing of each type has nothing to compare against and keeps
    `label = None` — the frontend skips those rather than inventing a
    direction. Exact ties resolve to LH/LL: a double top isn't a higher high,
    and the four-label vocabulary has no separate "equal" state.
    """
    prev_high: float | None = None
    prev_low: float | None = None

    for swing in swings:
        if swing.type == "high":
            if prev_high is not None:
                swing.label = "HH" if swing.price > prev_high else "LH"
            prev_high = swing.price
        else:
            if prev_low is not None:
                swing.label = "HL" if swing.price > prev_low else "LL"
            prev_low = swing.price


def _derive_trend(swings: list[SwingPoint]) -> str:
    """
    Overall trend from the most recent labelled high and low — the standard
    market-structure reading: rising peaks *and* rising troughs is an uptrend,
    falling peaks *and* falling troughs a downtrend, anything mixed is a range.

    Requires both a labelled high and a labelled low, so at least two of each
    type must exist; until then there's no structure to read and it stays
    'range' rather than guessing from one side.
    """
    last_high = next((s.label for s in reversed(swings) if s.type == "high" and s.label), None)
    last_low = next((s.label for s in reversed(swings) if s.type == "low" and s.label), None)

    if last_high == "HH" and last_low == "HL":
        return "up"
    if last_high == "LH" and last_low == "LL":
        return "down"
    return "range"


def detect_swings(
    candles: list[dict],
    tick_size: float,
    swing_strength: int = 3,
) -> MarketStructure:
    """
    `candles` are in Binance's chronological order, each {"t", "h", "l", ...}.

    Comparison is strict on the left and inclusive on the right, so a flat
    double-top (equal highs on adjacent candles) yields exactly one swing at the
    *first* candle of the plateau rather than none. Strict-on-both-sides is the
    textbook fractal, but it silently drops pivots on coins whose prices repeat
    often at their tick size — sub-cent coins like PEPE hit exact ties routinely.
    """
    decimals = price_decimals_for(tick_size)
    n = swing_strength
    swings: list[SwingPoint] = []

    if n < 1 or len(candles) < 2 * n + 1:
        return MarketStructure(
            swings=[], swing_strength=swing_strength, decimals=decimals, current_trend="range"
        )

    for i in range(n, len(candles) - n):
        candle = candles[i]
        high, low = candle["h"], candle["l"]

        is_high = all(high > candles[j]["h"] for j in range(i - n, i)) and all(
            high >= candles[j]["h"] for j in range(i + 1, i + n + 1)
        )
        if is_high:
            swings.append(SwingPoint(time=candle["t"], price=round(high, decimals), type="high"))

        is_low = all(low < candles[j]["l"] for j in range(i - n, i)) and all(
            low <= candles[j]["l"] for j in range(i + 1, i + n + 1)
        )
        if is_low:
            swings.append(SwingPoint(time=candle["t"], price=round(low, decimals), type="low"))

    _label_swings(swings)
    return MarketStructure(
        swings=swings,
        swing_strength=swing_strength,
        decimals=decimals,
        current_trend=_derive_trend(swings),
    )
