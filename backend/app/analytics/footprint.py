from dataclasses import dataclass, field


@dataclass
class FootprintRow:
    price_level: float
    buy_volume: float
    sell_volume: float
    delta: float


@dataclass
class FootprintBar:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    rows: list[FootprintRow] = field(default_factory=list)
    total_volume: float = 0.0
    imbalances: list[float] = field(default_factory=list)  # price levels with >70% imbalance


def build_footprint(candle: dict, trades: list[dict], tick_size: float = 1.0) -> FootprintBar:
    """
    Build a footprint chart bar from candle OHLC + individual trades.
    Groups trades by rounded price level (tick_size increments).
    """
    levels: dict[float, FootprintRow] = {}

    for trade in trades:
        price = round(float(trade["p"]) / tick_size) * tick_size
        qty = float(trade["q"])

        if price not in levels:
            levels[price] = FootprintRow(
                price_level=price, buy_volume=0.0, sell_volume=0.0, delta=0.0
            )

        row = levels[price]
        if trade["m"]:
            row.sell_volume += qty
        else:
            row.buy_volume += qty
        row.delta = row.buy_volume - row.sell_volume

    rows = sorted(levels.values(), key=lambda r: r.price_level, reverse=True)
    total_volume = sum(r.buy_volume + r.sell_volume for r in rows)

    imbalances = []
    for row in rows:
        total = row.buy_volume + row.sell_volume
        if total > 0:
            ratio = max(row.buy_volume, row.sell_volume) / total
            if ratio >= 0.70:
                imbalances.append(row.price_level)

    return FootprintBar(
        timestamp=candle.get("t", 0),
        open=candle.get("o", 0),
        high=candle.get("h", 0),
        low=candle.get("l", 0),
        close=candle.get("c", 0),
        rows=rows,
        total_volume=total_volume,
        imbalances=imbalances,
    )
