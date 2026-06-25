from dataclasses import dataclass


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
    """
    Build a Volume Profile (VP) from trades.
    Identifies Point of Control (POC) and Value Area High/Low.
    """
    levels: dict[float, VolumeProfileNode] = {}

    for trade in trades:
        price = round(float(trade["p"]) / tick_size) * tick_size
        qty = float(trade["q"])

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

    # Mark POC
    nodes[0].is_poc = True

    # Value Area: accumulate volume from POC until >= value_area_pct of total
    total_volume = sum(n.volume for n in nodes)
    target = total_volume * value_area_pct
    accumulated = 0.0
    for node in nodes:
        accumulated += node.volume
        node.in_value_area = True
        if accumulated >= target:
            break

    return sorted(nodes, key=lambda n: n.price)
