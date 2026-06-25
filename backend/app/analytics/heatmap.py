from dataclasses import dataclass
import numpy as np


@dataclass
class HeatmapSlice:
    timestamp: int
    price_levels: list[float]
    bid_liquidity: list[float]
    ask_liquidity: list[float]


def build_heatmap_slice(depth: dict, num_levels: int = 50) -> HeatmapSlice:
    """
    Convert an order book depth snapshot into a heatmap slice.
    Normalises liquidity values to [0, 1] range for rendering.
    """
    bids = sorted(depth["bids"], key=lambda x: x[0], reverse=True)[:num_levels]
    asks = sorted(depth["asks"], key=lambda x: x[0])[:num_levels]

    bid_prices = [b[0] for b in bids]
    ask_prices = [a[0] for a in asks]
    bid_qty = [b[1] for b in bids]
    ask_qty = [a[1] for a in asks]

    all_qty = bid_qty + ask_qty
    max_qty = max(all_qty) if all_qty else 1.0

    return HeatmapSlice(
        timestamp=depth.get("t", 0),
        price_levels=bid_prices + ask_prices,
        bid_liquidity=[q / max_qty for q in bid_qty],
        ask_liquidity=[q / max_qty for q in ask_qty],
    )


def aggregate_heatmap_history(slices: list[HeatmapSlice]) -> dict:
    """
    Aggregate multiple slices into a 2D liquidity matrix for the heatmap canvas.
    Returns {timestamps, price_levels, matrix} where matrix[t][p] = liquidity.
    """
    if not slices:
        return {}

    all_prices = sorted({p for s in slices for p in s.price_levels})
    price_index = {p: i for i, p in enumerate(all_prices)}
    matrix = np.zeros((len(slices), len(all_prices)))

    for t_idx, s in enumerate(slices):
        for price, liq in zip(s.price_levels, s.bid_liquidity + s.ask_liquidity):
            if price in price_index:
                matrix[t_idx][price_index[price]] = liq

    return {
        "timestamps": [s.timestamp for s in slices],
        "price_levels": all_prices,
        "matrix": matrix.tolist(),
    }
