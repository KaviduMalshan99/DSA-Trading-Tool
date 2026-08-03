"""
Institutional levels — today's daily open and the prior day's high/low (PDH/PDL).

Both are read straight off Binance's own 1d candles: the current (still-forming)
day's candle open is the daily open, and the candle before it holds PDH/PDL. No
timezone math needed on our side since Binance's daily boundary is authoritative.
"""

from dataclasses import dataclass

from app.analytics.price_step import price_decimals_for


@dataclass
class InstitutionalLevels:
    daily_open: float
    pdh: float
    pdl: float
    decimals: int


def compute_levels(daily_candles: list[dict], tick_size: float) -> InstitutionalLevels:
    """
    `daily_candles` must be the last two 1d candles in Binance's chronological
    order: [prior_day, today].
    """
    if len(daily_candles) < 2:
        raise ValueError("need at least 2 daily candles (prior day + today)")

    prior_day, today = daily_candles[-2], daily_candles[-1]
    decimals = price_decimals_for(tick_size)
    return InstitutionalLevels(
        daily_open=round(today["o"], decimals),
        pdh=round(prior_day["h"], decimals),
        pdl=round(prior_day["l"], decimals),
        decimals=decimals,
    )
