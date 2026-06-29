"""
HeatmapAccumulator — collects Binance order-book depth snapshots and
exposes them as normalised (0.0–1.0) heatmap cells ready for the frontend.
"""

import time
from collections import deque

MAX_SNAPSHOTS = 2000
DEFAULT_STEP  = 10     # price rounding granularity — suitable for BTC ≈ $100 k
SNAPSHOT_SECS = 1      # interval between snapshots (seconds)


class HeatmapAccumulator:
    """
    Rolling order-book snapshot store.
    Not thread-safe; call exclusively from one asyncio task.
    """

    def __init__(self, price_step: int = DEFAULT_STEP) -> None:
        self._step      : int              = price_step
        self._book      : dict[int, float] = {}     # rounded_price → raw_qty
        self._snapshots : deque[dict]      = deque(maxlen=MAX_SNAPSHOTS)

    # ── internal ──────────────────────────────────────────────────────────────

    def _round(self, price: float) -> int:
        return round(price / self._step) * self._step

    def _global_max(self) -> float:
        m = 0.0
        for s in self._snapshots:
            for q in s["levels"].values():
                if q > m:
                    m = q
        return m

    # ── public ────────────────────────────────────────────────────────────────

    def update(self, bids: list, asks: list) -> None:
        """Merge a depth-update message into the live order book."""
        book: dict[int, float] = {}
        for p_str, q_str in bids:
            q = float(q_str)
            if q > 0:
                p = self._round(float(p_str))
                book[p] = book.get(p, 0.0) + q
        for p_str, q_str in asks:
            q = float(q_str)
            if q > 0:
                p = self._round(float(p_str))
                book[p] = book.get(p, 0.0) + q
        self._book = book

    def take_snapshot(self) -> None:
        """Commit the current book state into the rolling history."""
        if self._book:
            self._snapshots.append({
                "time":   int(time.time()),
                "levels": dict(self._book),
            })

    def normalized_snapshots(self) -> tuple[list[dict], float, float]:
        """
        Return (snapshots, price_min, price_max).
        Quantities are normalised to [0, 1] by dividing by the global max
        across all stored snapshots.
        """
        if not self._snapshots:
            return [], 0.0, 0.0

        gmax = self._global_max()
        if gmax == 0:
            return [], 0.0, 0.0

        all_prices = [p for s in self._snapshots for p in s["levels"]]
        price_min  = float(min(all_prices))
        price_max  = float(max(all_prices))

        result = [
            {
                "time":   s["time"],
                "levels": {
                    str(p): round(q / gmax, 4)
                    for p, q in s["levels"].items()
                },
            }
            for s in self._snapshots
        ]
        return result, price_min, price_max

    def normalized_latest(self) -> dict | None:
        """Latest snapshot with normalised quantities, or None if empty."""
        if not self._snapshots:
            return None
        gmax = self._global_max()
        if gmax == 0:
            return None
        s = self._snapshots[-1]
        return {
            "time":   s["time"],
            "levels": {
                str(p): round(q / gmax, 4)
                for p, q in s["levels"].items()
            },
        }
