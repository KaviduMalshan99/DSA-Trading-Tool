"""
Absorption detection — candles where unusually large volume traded but price
barely moved, meaning aggressive market orders were "absorbed" by large
passive (resting limit) orders without pushing price through.

Two flavors, told apart by which side's volume dominated the candle:

* Buy absorption (bullish): heavy SELLING volume, but price held or closed up
  instead of falling — a big buyer absorbed the selling. Often precedes a
  move up.
* Sell absorption (bearish): heavy BUYING volume, but price failed to rise —
  a big seller absorbed the buying. Often precedes a move down.

Detection gate, all three required:

1. Large volume: candle volume >= `volume_multiplier` x the average volume of
   the `lookback` candles *before* it (default 1.5x / 20 candles). The
   baseline deliberately excludes the candle under test — including it would
   let a single huge-volume candle inflate its own threshold and mask itself.
2. Small range: candle (high - low) <= `range_fraction` x the average range of
   that same preceding window (default 0.85x).
3. A clear aggressor: |delta| / (buy+sell volume) >= `_MIN_DELTA_FRACTION`
   (0.15). Without this, a candle that happens to be large-volume/small-range
   but had a roughly even buy/sell split (no real aggressor to "absorb")
   would otherwise get labelled by a coin-flip.

   Live-tested against real BTC data: the original 2.0x/0.7x defaults
   returned zero events on both 1h and 1m (too strict for how BTC actually
   trades); 1.3x/0.95x found real events but was untested for noise. 1.5x/
   0.85x is the recorded middle ground — confirm it stays that way as more
   data comes in, since these two numbers are expected to keep moving.

Direction then follows the dominant side directly: heavy sell volume (delta
< 0) on a candle passing the gate is buy absorption, heavy buy volume is sell
absorption. One more check keeps the direction honest on top of the raw
delta sign: the close must sit in the half of the candle's own range that
matches the story (buy absorption needs close >= midpoint — "held or closed
up" — sell absorption needs close <= midpoint). A small-range candle can
still drift entirely to one side of that small range, and a candle that
drifted the "wrong" way isn't the pattern being described here even if the
delta sign matches.

`volume_multiplier`, `range_fraction`, and `lookback` are left as function
parameters (not just module constants) specifically so the /indicators route
can expose them as query params — this is expected to need live tuning once
someone is looking at real flagged candles.
"""

from dataclasses import dataclass, field

from app.analytics.price_step import price_decimals_for

_ROLLING_N = 20            # baseline window, in candles
_VOLUME_MULTIPLIER = 1.5   # candle volume >= this x the baseline average volume
_RANGE_FRACTION = 0.85     # candle range <= this x the baseline average range
_MIN_DELTA_FRACTION = 0.15 # |delta| / total volume must clear this to count as a real aggressor


@dataclass
class AbsorptionEvent:
    time: int      # candle open time, epoch ms
    price: float   # candle close — used as the default anchor if high/low aren't needed
    high: float
    low: float
    type: str      # 'buy_absorption' | 'sell_absorption'
    strength: float  # unbounded score — bigger means larger volume spike + smaller relative range + cleaner aggressor split


@dataclass
class AbsorptionResult:
    events: list[AbsorptionEvent] = field(default_factory=list)
    decimals: int = 0
    volume_multiplier: float = _VOLUME_MULTIPLIER
    range_fraction: float = _RANGE_FRACTION
    lookback: int = _ROLLING_N


def detect_absorption(
    candles: list[dict],
    delta_bars: list[dict],
    tick_size: float,
    volume_multiplier: float = _VOLUME_MULTIPLIER,
    range_fraction: float = _RANGE_FRACTION,
    lookback: int = _ROLLING_N,
) -> AbsorptionResult:
    """
    `candles`: chronological {"t","o","h","l","c","v"} dicts (Binance klines).
    `delta_bars`: same length and order as `candles`, each carrying
    buy_volume/sell_volume/delta for that candle — pass
    `delta.klines_to_delta_bars()`'s output on the *same* raw kline rows so
    the two lists line up index-for-index.

    Like swing detection, the first `lookback` candles have no baseline to
    compare against and are never classified — this is the method's inherent
    warm-up lag, not a bug.
    """
    decimals = price_decimals_for(tick_size)

    if lookback < 1 or len(candles) <= lookback or len(candles) != len(delta_bars):
        return AbsorptionResult(
            events=[], decimals=decimals, volume_multiplier=volume_multiplier,
            range_fraction=range_fraction, lookback=lookback,
        )

    events: list[AbsorptionEvent] = []

    for i in range(lookback, len(candles)):
        window = candles[i - lookback:i]
        avg_volume = sum(c["v"] for c in window) / lookback
        avg_range = sum(c["h"] - c["l"] for c in window) / lookback
        if avg_volume <= 0:
            continue

        candle = candles[i]
        vol = candle["v"]
        if vol < volume_multiplier * avg_volume:
            continue

        # Floor the baseline range at tick_size so a dead-flat preceding
        # window (avg_range ~ 0) doesn't force every subsequent candle to
        # fail the small-range gate outright.
        effective_avg_range = max(avg_range, tick_size)
        rng = candle["h"] - candle["l"]
        if rng > range_fraction * effective_avg_range:
            continue

        db = delta_bars[i]
        buy_vol, sell_vol, delta = db["buy_volume"], db["sell_volume"], db["delta"]
        total = buy_vol + sell_vol
        if total <= 0:
            continue
        delta_fraction = abs(delta) / total
        if delta_fraction < _MIN_DELTA_FRACTION:
            continue

        mid = (candle["h"] + candle["l"]) / 2
        close = candle["c"]
        if delta < 0:
            if close < mid:  # heavy selling AND price still leaned down — not "held"
                continue
            event_type = "buy_absorption"
        else:
            if close > mid:  # heavy buying AND price still leaned up — not "capped"
                continue
            event_type = "sell_absorption"

        volume_ratio = vol / avg_volume
        range_ratio = effective_avg_range / max(rng, tick_size)
        strength = round(volume_ratio * range_ratio * delta_fraction, 2)

        events.append(
            AbsorptionEvent(
                time=candle["t"],
                price=round(close, decimals),
                high=round(candle["h"], decimals),
                low=round(candle["l"], decimals),
                type=event_type,
                strength=strength,
            )
        )

    return AbsorptionResult(
        events=events, decimals=decimals, volume_multiplier=volume_multiplier,
        range_fraction=range_fraction, lookback=lookback,
    )
