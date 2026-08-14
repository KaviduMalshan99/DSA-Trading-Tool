"""
Shared price-bucket sizing for footprint, volume profile, and heatmap.

All three used to hardcode a step tuned for BTC's ~$100k scale (nearest $10,
or "BTC" in symbol -> else a flat $0.10/$1 fallback), which collapses every
trade on a sub-$1 coin (XRP, DOGE, PEPE, SHIB, ...) into a single bucket.
This module derives the step from the coin's own current price instead, so
every overlay gets one shared, symbol-aware bucket size.
"""

import math

import aiohttp

_CLEAN_MULTIPLIERS = (1.0, 2.0, 5.0)
_BINANCE_REST = "https://api.binance.com"
_FOOTPRINT_TARGET_LEVELS = 10
_FOOTPRINT_RANGE_PERCENTILE = 0.8


def _snap_to_clean(raw_step: float) -> float:
    """Round `raw_step` to the nearest clean 1/2/5 x 10^n value."""
    exponent = math.floor(math.log10(raw_step))
    candidates = [
        m * (10 ** e)
        for e in (exponent - 1, exponent, exponent + 1)
        for m in _CLEAN_MULTIPLIERS
    ]
    return min(candidates, key=lambda c: abs(c - raw_step))


def price_step_for(price: float) -> float:
    """
    Suggest a price-bucket step sized to a coin's own price, snapped to a
    clean 1/2/5 x 10^n value (e.g. BTC ~$100,000 -> $100, XRP ~$2 -> $0.002,
    PEPE ~$0.000008 -> $0.00000001) instead of a fixed BTC-scale constant.

    For bucketing across a whole chart axis (volume profile, heatmap). NOT
    suitable for footprint, which buckets trades within a single candle —
    use footprint_step_for for that.
    """
    if price <= 0:
        return 1.0
    return _snap_to_clean(price / 1000.0)


def footprint_step_for(typical_range: float, tick_size: float) -> float:
    """
    Suggest a footprint price-bucket step sized to fit ~_FOOTPRINT_TARGET_LEVELS
    buckets across `typical_range` (the symbol's own 80th-percentile recent
    1-minute high-low range — see fetch_typical_range), floored at the
    symbol's exchange tick size so buckets are never finer than a tradable
    price increment, and snapped to a clean 1/2/5 x 10^n value.

    Footprint buckets trades within a single candle, so unlike price_step_for
    (whole chart axis, sized off absolute price) it needs a step tied to the
    symbol's own actual intra-candle volatility — a fixed price- or
    tick-relative step is either too coarse (BTC would collapse to one
    bucket) or too fine (XRP/PEPE would spam thousands of empty buckets),
    depending on how active that symbol currently is.
    """
    if tick_size <= 0:
        return 1.0
    raw_step = max(typical_range / _FOOTPRINT_TARGET_LEVELS, tick_size)
    return _snap_to_clean(raw_step)


def price_decimals_for(step: float) -> int:
    """Decimal places needed to display `step` without trailing noise."""
    if step <= 0:
        return 0
    return max(0, -math.floor(math.log10(step)))


async def fetch_current_price(symbol: str) -> float:
    """One-shot lookup of a symbol's current price, used to size buckets."""
    url = f"{_BINANCE_REST}/api/v3/ticker/price"
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params={"symbol": symbol.upper()}) as resp:
            resp.raise_for_status()
            data = await resp.json()
    return float(data["price"])


async def fetch_tick_size(symbol: str) -> float:
    """One-shot lookup of a symbol's exchange-defined minimum price increment."""
    url = f"{_BINANCE_REST}/api/v3/exchangeInfo"
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params={"symbol": symbol.upper()}) as resp:
            resp.raise_for_status()
            data = await resp.json()
    filters = data["symbols"][0]["filters"]
    price_filter = next(f for f in filters if f["filterType"] == "PRICE_FILTER")
    return float(price_filter["tickSize"])


async def fetch_typical_range(symbol: str, lookback: int = 30) -> float:
    """
    80th-percentile high-low range of the symbol's last `lookback` 1-minute
    candles, used to size footprint buckets to its actual current volatility
    rather than a fixed constant. Percentile (not median) so a handful of
    flat candles don't understate the step; not max, so one outlier spike
    doesn't oversize it.
    """
    url = f"{_BINANCE_REST}/api/v3/klines"
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(
            url, params={"symbol": symbol.upper(), "interval": "1m", "limit": lookback}
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
    ranges = sorted(float(k[2]) - float(k[3]) for k in data)
    idx = min(len(ranges) - 1, int(_FOOTPRINT_RANGE_PERCENTILE * len(ranges)))
    return ranges[idx]
