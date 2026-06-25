from dataclasses import dataclass


@dataclass
class DeltaBar:
    timestamp: int
    buy_volume: float
    sell_volume: float
    delta: float          # buy - sell
    cumulative_delta: float


def compute_delta(trades: list[dict]) -> list[DeltaBar]:
    """
    Aggregate raw trades into per-bar delta values.
    trades: list of {t, p, q, m} dicts (m=True means seller is maker => sell-side aggression)
    """
    if not trades:
        return []

    bars: dict[int, DeltaBar] = {}
    cumulative = 0.0

    for trade in sorted(trades, key=lambda x: x["t"]):
        bar_ts = trade["t"] - (trade["t"] % 60_000)  # 1-min bars

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
