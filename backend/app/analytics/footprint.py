import math
import time as _time

from app.analytics.price_step import price_decimals_for

_IMBALANCE_RATIO = 5.0
_IMBALANCE_MIN_SMALLER = 0.5  # smaller side must have at least this volume

# Safety cap for approximated historical bars: an outlier candle (flash move)
# divided by a step sized for the *typical* candle could otherwise produce
# thousands of levels in one payload.
_MAX_HISTORICAL_LEVELS = 200


def _is_imbalance(buy: float, sell: float) -> bool:
    # Require BOTH: the smaller side must meet a minimum (avoids flagging levels
    # with a single stray trade) AND one side must be 5× the other.
    smaller = min(buy, sell)
    if smaller < _IMBALANCE_MIN_SMALLER:
        return False
    return buy >= _IMBALANCE_RATIO * sell or sell >= _IMBALANCE_RATIO * buy


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
                 price_step: float = 1.0):
        self.max_candles       = max_candles
        self._partial_interval = partial_interval
        self._step              = price_step
        self._decimals          = price_decimals_for(price_step)

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
        price = round(round(float(trade["p"]) / self._step) * self._step, self._decimals)
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

    def seed_completed(self, bars: list[dict]) -> None:
        """
        Pre-load approximated historical bars (see klines_to_footprint_bars)
        ahead of live accumulation, so clients get a full ladder history on
        connect instead of only the one candle currently forming.

        Live bars always win: any seeded bar whose minute has already been
        accumulated for real is discarded.
        """
        if not bars:
            return
        live_times = {b["time"] for b in self._completed}
        seeded = [b for b in bars if b["time"] not in live_times]
        merged = seeded + self._completed
        merged.sort(key=lambda b: b["time"])
        self._completed = merged[-self.max_candles:]

    @property
    def step(self) -> float:
        return self._step

    @property
    def decimals(self) -> int:
        return self._decimals

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
        return {"time": time_ms, "decimals": self._decimals, "levels": levels}


# ── Historical backfill from klines ───────────────────────────────────────────


def klines_to_footprint_bars(
    klines: list[list],
    step: float,
    decimals: int,
) -> list[dict]:
    """
    Approximate completed footprint bars from Binance OHLCV kline rows, in the
    exact payload shape _build_bar produces (levels sorted high→low).

    The live path builds each level from per-trade aggTrades, so every level
    carries its own true buy/sell split. Klines have no per-price aggressor
    detail — only the candle's totals — so history is approximated the same way
    the volume profile and delta overlays already do it:

      * buy  = taker_buy_base_volume (kline[9])  — the candle's REAL aggressor
      * sell = total volume (kline[5]) - buy       split, not a guess
      * both spread evenly across every `step` bucket in [low, high]

    Consequence worth knowing: within one approximated bar every level carries
    the same buy/sell ratio, so per-level imbalance degenerates to a per-candle
    signal on history (all levels flagged, or none). Live bars keep true
    per-level resolution. Nothing here is fabricated — the shape of the
    distribution is simply unknown, so it is left flat rather than invented.
    """
    if step <= 0:
        return []

    bars: list[dict] = []

    for row in klines:
        open_ms   = int(row[0])
        high      = float(row[2])
        low       = float(row[3])
        total_vol = float(row[5])
        buy_total = float(row[9])
        sell_total = max(0.0, total_vol - buy_total)

        # An outlier candle against a step sized for the typical one can span a
        # huge number of buckets; coarsen this bar's step rather than truncate
        # its range (which would silently drop price levels).
        bar_step = step
        bar_decimals = decimals
        span = max(0.0, high - low)
        if span / bar_step + 1 > _MAX_HISTORICAL_LEVELS:
            factor = math.ceil((span / bar_step + 1) / _MAX_HISTORICAL_LEVELS)
            bar_step = step * factor
            bar_decimals = price_decimals_for(bar_step)

        low_b  = round(round(low  / bar_step) * bar_step, bar_decimals)
        high_b = round(round(high / bar_step) * bar_step, bar_decimals)
        n = max(1, int(round((high_b - low_b) / bar_step)) + 1)

        buy_each  = round(buy_total  / n, 4)
        sell_each = round(sell_total / n, 4)

        levels = [
            {
                "price": round(low_b + i * bar_step, bar_decimals),
                "buy_vol": buy_each,
                "sell_vol": sell_each,
                "imbalance": _is_imbalance(buy_each, sell_each),
            }
            for i in range(n - 1, -1, -1)  # high → low, matching _build_bar
        ]

        bars.append({"time": open_ms, "decimals": bar_decimals, "levels": levels})

    return bars


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
