from dataclasses import dataclass
from enum import Enum


class SMCZoneType(Enum):
    ORDER_BLOCK_BULLISH = "order_block_bullish"
    ORDER_BLOCK_BEARISH = "order_block_bearish"
    FAIR_VALUE_GAP = "fair_value_gap"
    BREAKER_BLOCK = "breaker_block"
    LIQUIDITY_VOID = "liquidity_void"


@dataclass
class SMCZone:
    zone_type: SMCZoneType
    price_high: float
    price_low: float
    timestamp: int
    strength: float  # 0.0 - 1.0
    mitigated: bool = False


def detect_order_blocks(candles: list[dict], lookback: int = 20) -> list[SMCZone]:
    """
    Detect bullish and bearish order blocks.
    A bullish OB is the last bearish candle before a strong upward impulse.
    A bearish OB is the last bullish candle before a strong downward impulse.
    """
    zones: list[SMCZone] = []
    if len(candles) < 3:
        return zones

    for i in range(1, len(candles) - 1):
        prev = candles[i - 1]
        curr = candles[i]
        nxt = candles[i + 1]

        curr_body = abs(curr["c"] - curr["o"])
        nxt_move = abs(nxt["c"] - nxt["o"])

        if nxt_move < curr_body * 1.5:
            continue

        # Bullish OB: bearish candle followed by strong bullish move
        if curr["c"] < curr["o"] and nxt["c"] > nxt["o"]:
            zones.append(SMCZone(
                zone_type=SMCZoneType.ORDER_BLOCK_BULLISH,
                price_high=curr["o"],
                price_low=curr["l"],
                timestamp=curr["t"],
                strength=min(nxt_move / curr_body, 1.0),
            ))

        # Bearish OB: bullish candle followed by strong bearish move
        elif curr["c"] > curr["o"] and nxt["c"] < nxt["o"]:
            zones.append(SMCZone(
                zone_type=SMCZoneType.ORDER_BLOCK_BEARISH,
                price_high=curr["h"],
                price_low=curr["o"],
                timestamp=curr["t"],
                strength=min(nxt_move / curr_body, 1.0),
            ))

    return zones[-lookback:]


def detect_fair_value_gaps(candles: list[dict]) -> list[SMCZone]:
    """
    Detect Fair Value Gaps (FVGs): 3-candle pattern where candle 1 high < candle 3 low (bullish)
    or candle 1 low > candle 3 high (bearish).
    """
    zones: list[SMCZone] = []
    for i in range(2, len(candles)):
        c1, c2, c3 = candles[i - 2], candles[i - 1], candles[i]

        # Bullish FVG
        if c1["h"] < c3["l"]:
            gap_size = c3["l"] - c1["h"]
            zones.append(SMCZone(
                zone_type=SMCZoneType.FAIR_VALUE_GAP,
                price_high=c3["l"],
                price_low=c1["h"],
                timestamp=c2["t"],
                strength=min(gap_size / c2["c"] * 100, 1.0),
            ))

        # Bearish FVG
        elif c1["l"] > c3["h"]:
            gap_size = c1["l"] - c3["h"]
            zones.append(SMCZone(
                zone_type=SMCZoneType.FAIR_VALUE_GAP,
                price_high=c1["l"],
                price_low=c3["h"],
                timestamp=c2["t"],
                strength=min(gap_size / c2["c"] * 100, 1.0),
            ))

    return zones
