import time as _time

_IMBALANCE_RATIO = 5.0
_IMBALANCE_MIN_SMALLER = 0.5  # smaller side must have at least this volume


def _is_imbalance(buy: float, sell: float) -> bool:
    # Require BOTH: the smaller side must meet a minimum (avoids flagging levels
    # with a single stray trade) AND one side must be 5× the other.
    smaller = min(buy, sell)
    if smaller < _IMBALANCE_MIN_SMALLER:
        return False
    return buy >= _IMBALANCE_RATIO * sell or sell >= _IMBALANCE_RATIO * buy


def _price_decimals(symbol: str) -> int:
    """
    ndigits for round(price, ndigits).
    Negative ndigits round to the left of the decimal point.
      -1 → nearest $10   (BTC: 60334 → 60330)
       1 → nearest $0.10 (others: 3521.45 → 3521.5)
    """
    if "BTC" in symbol.upper():
        return -1  # $10 buckets
    return 1       # 10-cent buckets


class FootprintAccumulator:
    """
    Consumes Binance aggTrade dicts and accumulates per-price-level buy/sell
    volume into 1-minute footprint bars.

    aggTrade fields used:
      T  → trade time (ms)
      p  → price string
      q  → quantity string
      m  → buyer is maker (True = sell aggressor, False = buy aggressor)
    """

    def __init__(self, max_candles: int = 50, partial_interval: float = 2.0,
                 symbol: str = ""):
        self.max_candles       = max_candles
        self._partial_interval = partial_interval
        self._decimals         = _price_decimals(symbol)

        self._completed: list[dict] = []
        self._current_minute: int | None = None
        self._levels: dict[float, dict] = {}

        self._last_partial_mono: float = 0.0

    # ── public ────────────────────────────────────────────────────────────

    def process_trade(self, trade: dict) -> dict | None:
        """
        Feed one aggTrade.  Returns the just-closed footprint bar if a
        minute boundary was crossed, otherwise None.
        """
        trade_ms: int = trade["T"]
        price = round(float(trade["p"]), self._decimals)
        qty = float(trade["q"])
        is_maker: bool = trade["m"]

        minute = (trade_ms // 60_000) * 60_000

        if self._current_minute is None:
            self._current_minute = minute

        closed: dict | None = None
        if minute != self._current_minute:
            closed = self._build_bar(self._current_minute)
            self._completed.append(closed)
            if len(self._completed) > self.max_candles:
                self._completed.pop(0)
            self._current_minute = minute
            self._levels = {}

        self._accumulate(price, qty, is_maker)
        return closed

    def should_emit_partial(self, now: float) -> bool:
        """True at most once per partial_interval seconds."""
        if now - self._last_partial_mono >= self._partial_interval:
            self._last_partial_mono = now
            return True
        return False

    def get_current_partial(self) -> dict | None:
        if self._current_minute is None or not self._levels:
            return None
        return self._build_bar(self._current_minute)

    def get_historical(self) -> list[dict]:
        return list(self._completed)

    # ── private ───────────────────────────────────────────────────────────

    def _accumulate(self, price: float, qty: float, is_maker: bool) -> None:
        entry = self._levels.setdefault(price, {"buy_vol": 0.0, "sell_vol": 0.0})
        if is_maker:
            entry["sell_vol"] += qty
        else:
            entry["buy_vol"] += qty

    def _build_bar(self, time_ms: int) -> dict:
        levels = []
        for price in sorted(self._levels, reverse=True):
            v = self._levels[price]
            bv = round(v["buy_vol"], 4)
            sv = round(v["sell_vol"], 4)
            levels.append(
                {
                    "price": price,
                    "buy_vol": bv,
                    "sell_vol": sv,
                    "imbalance": _is_imbalance(bv, sv),
                }
            )
        return {"time": time_ms, "levels": levels}


# ── Legacy REST-endpoint compatibility ────────────────────────────────────────
# indicators.py still calls build_footprint(candle, trades, tick_size).
# Keep it working without changing the REST layer.

from dataclasses import dataclass, field as _field


@dataclass
class _FootprintRow:
    price_level: float
    buy_volume: float
    sell_volume: float
    delta: float


@dataclass
class _FootprintBarLegacy:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    rows: list[_FootprintRow] = _field(default_factory=list)
    total_volume: float = 0.0
    imbalances: list[float] = _field(default_factory=list)


def build_footprint(
    candle: dict,
    trades: list[dict],
    tick_size: float = 1.0,
) -> _FootprintBarLegacy:
    """Legacy function kept for the REST /indicators/footprint endpoint."""
    levels: dict[float, _FootprintRow] = {}

    for trade in trades:
        price = round(float(trade["p"]) / tick_size) * tick_size
        qty = float(trade["q"])
        if price not in levels:
            levels[price] = _FootprintRow(price_level=price, buy_volume=0.0, sell_volume=0.0, delta=0.0)
        row = levels[price]
        if trade["m"]:
            row.sell_volume += qty
        else:
            row.buy_volume += qty
        row.delta = row.buy_volume - row.sell_volume

    rows = sorted(levels.values(), key=lambda r: r.price_level, reverse=True)
    total_volume = sum(r.buy_volume + r.sell_volume for r in rows)
    imbalances = [
        r.price_level
        for r in rows
        if (r.buy_volume + r.sell_volume) > 0
        and max(r.buy_volume, r.sell_volume) / (r.buy_volume + r.sell_volume) >= 0.70
    ]
    return _FootprintBarLegacy(
        timestamp=candle.get("t", 0),
        open=candle.get("o", 0),
        high=candle.get("h", 0),
        low=candle.get("l", 0),
        close=candle.get("c", 0),
        rows=rows,
        total_volume=total_volume,
        imbalances=imbalances,
    )
