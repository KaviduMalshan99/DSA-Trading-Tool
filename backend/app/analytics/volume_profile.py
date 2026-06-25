from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

import aiohttp


# ── Legacy REST-endpoint interface ────────────────────────────────────────────
# indicators.py imports build_volume_profile and VolumeProfileNode directly.

@dataclass
class VolumeProfileNode:
    price: float
    volume: float
    buy_volume: float
    sell_volume: float
    is_poc: bool = False
    in_value_area: bool = False


def build_volume_profile(
    trades: list[dict],
    tick_size: float = 1.0,
    value_area_pct: float = 0.70,
) -> list[VolumeProfileNode]:
    """Build a Volume Profile from raw aggTrade dicts (used by REST endpoint)."""
    levels: dict[float, VolumeProfileNode] = {}

    for trade in trades:
        price = round(float(trade["p"]) / tick_size) * tick_size
        qty   = float(trade["q"])

        if price not in levels:
            levels[price] = VolumeProfileNode(
                price=price, volume=0.0, buy_volume=0.0, sell_volume=0.0
            )
        node = levels[price]
        node.volume += qty
        if trade["m"]:
            node.sell_volume += qty
        else:
            node.buy_volume += qty

    nodes = sorted(levels.values(), key=lambda n: n.volume, reverse=True)
    if not nodes:
        return []

    nodes[0].is_poc = True

    total_volume = sum(n.volume for n in nodes)
    target       = total_volume * value_area_pct
    accumulated  = 0.0
    for node in nodes:
        accumulated += node.volume
        node.in_value_area = True
        if accumulated >= target:
            break

    return sorted(nodes, key=lambda n: n.price)


# ── Klines-based profile (used by the WebSocket stream) ─────────────────────

_BINANCE_REST = "https://api.binance.com"


def _tick_size_for(symbol: str) -> float:
    """BTC rounds to nearest 10; all others to nearest 1."""
    return 10.0 if "BTC" in symbol.upper() else 1.0


def build_profile_from_klines(
    klines: list[list],
    tick_size: float = 10.0,
    value_area_pct: float = 0.70,
) -> dict:
    """
    Approximate volume profile from OHLCV kline rows.

    Volume for each candle is distributed evenly across price levels in the
    candle's [low, high] range at tick_size granularity.
    taker_buy_base_volume (kline[9]) gives buy side; remainder is sell side.
    """
    levels: dict[float, dict] = defaultdict(
        lambda: {"volume": 0.0, "buy_vol": 0.0, "sell_vol": 0.0}
    )

    for kline in klines:
        high_price  = float(kline[2])
        low_price   = float(kline[3])
        total_vol   = float(kline[5])
        buy_vol     = float(kline[9])
        sell_vol    = total_vol - buy_vol

        low_tick  = round(low_price  / tick_size) * tick_size
        high_tick = round(high_price / tick_size) * tick_size
        n_levels  = max(1, round((high_tick - low_tick) / tick_size) + 1)

        vol_each  = total_vol / n_levels
        buy_each  = buy_vol   / n_levels
        sell_each = sell_vol  / n_levels

        price = low_tick
        while price <= high_tick + 1e-9:
            lv = levels[price]
            lv["volume"]   += vol_each
            lv["buy_vol"]  += buy_each
            lv["sell_vol"] += sell_each
            price = round(price + tick_size, 10)

    if not levels:
        return {"levels": [], "poc": None, "vah": None, "val": None, "total_volume": 0.0}

    sorted_prices = sorted(levels.keys())
    total_volume  = sum(v["volume"] for v in levels.values())
    poc_price     = max(levels, key=lambda p: levels[p]["volume"])

    # Value Area: expand from POC (highest-volume first) to cover value_area_pct
    target      = total_volume * value_area_pct
    accumulated = levels[poc_price]["volume"]
    above       = [p for p in sorted_prices if p > poc_price]
    below       = [p for p in reversed(sorted_prices) if p < poc_price]
    va_prices   = {poc_price}
    i_a = i_b   = 0

    while accumulated < target:
        vol_a = levels[above[i_a]]["volume"] if i_a < len(above) else 0.0
        vol_b = levels[below[i_b]]["volume"] if i_b < len(below) else 0.0
        if vol_a == 0.0 and vol_b == 0.0:
            break
        if vol_a >= vol_b:
            va_prices.add(above[i_a]); accumulated += vol_a; i_a += 1
        else:
            va_prices.add(below[i_b]); accumulated += vol_b; i_b += 1

    vah = max(va_prices)
    val = min(va_prices)

    result_levels = [
        {
            "price":         round(p, 2),
            "volume":        round(levels[p]["volume"],   4),
            "buy_vol":       round(levels[p]["buy_vol"],  4),
            "sell_vol":      round(levels[p]["sell_vol"], 4),
            "is_poc":        p == poc_price,
            "in_value_area": p in va_prices,
        }
        for p in sorted_prices
    ]

    return {
        "levels":       result_levels,
        "poc":          round(poc_price, 2),
        "vah":          round(vah, 2),
        "val":          round(val, 2),
        "total_volume": round(total_volume, 4),
    }


async def fetch_and_build(symbol: str, interval: str, limit: int = 200) -> dict:
    """Fetch klines from Binance REST and return a volume profile dict."""
    tick_size = _tick_size_for(symbol)
    url    = f"{_BINANCE_REST}/api/v3/klines"
    params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}

    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            klines = await resp.json()

    return build_profile_from_klines(klines, tick_size=tick_size)
