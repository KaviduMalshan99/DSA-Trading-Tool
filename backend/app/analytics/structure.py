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
    time: int      # candle open time, epoch ms
    price: float   # the high (for 'high') or low (for 'low') of that candle
    type: str      # 'high' | 'low'


@dataclass
class MarketStructure:
    swings: list[SwingPoint]
    swing_strength: int
    decimals: int


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
        return MarketStructure(swings=[], swing_strength=swing_strength, decimals=decimals)

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

    return MarketStructure(swings=swings, swing_strength=swing_strength, decimals=decimals)
