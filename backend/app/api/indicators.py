from fastapi import APIRouter, Query, HTTPException
from app.core.redis import get_redis
from app.analytics.delta import compute_delta
from app.analytics.volume_profile import build_volume_profile
from app.analytics.footprint import build_footprint
from app.analytics.heatmap import build_heatmap_slice
from app.analytics.smc import detect_order_blocks, detect_fair_value_gaps
import json

router = APIRouter(prefix="/indicators", tags=["indicators"])


async def _get_trades(symbol: str, limit: int = 500) -> list[dict]:
    r = await get_redis()
    raw = await r.lrange(f"trade_buffer:{symbol}", -limit, -1)
    return [json.loads(t) for t in raw]


@router.get("/delta/{symbol}")
async def get_delta(symbol: str, limit: int = Query(500, le=2000)):
    trades = await _get_trades(symbol, limit)
    if not trades:
        raise HTTPException(status_code=404, detail="No trade data")
    bars = compute_delta(trades)
    return [b.__dict__ for b in bars]


@router.get("/volume-profile/{symbol}")
async def get_volume_profile(
    symbol: str,
    tick_size: float = Query(1.0),
    value_area_pct: float = Query(0.70),
    limit: int = Query(1000, le=5000),
):
    trades = await _get_trades(symbol, limit)
    if not trades:
        raise HTTPException(status_code=404, detail="No trade data")
    nodes = build_volume_profile(trades, tick_size, value_area_pct)
    return [n.__dict__ for n in nodes]


@router.get("/footprint/{symbol}")
async def get_footprint(
    symbol: str,
    interval: str = Query("1m"),
    tick_size: float = Query(1.0),
):
    from app.core.redis import cache_get
    candle_raw = await cache_get(f"latest_candle:{symbol}:{interval}")
    if not candle_raw:
        raise HTTPException(status_code=404, detail="No candle data")
    candle = json.loads(candle_raw)
    trades = await _get_trades(symbol, 500)
    bar = build_footprint(candle, trades, tick_size)
    return {
        "timestamp": bar.timestamp,
        "ohlc": {"o": bar.open, "h": bar.high, "l": bar.low, "c": bar.close},
        "total_volume": bar.total_volume,
        "imbalances": bar.imbalances,
        "rows": [r.__dict__ for r in bar.rows],
    }


@router.get("/smc/{symbol}")
async def get_smc_zones(symbol: str, interval: str = Query("1m"), lookback: int = Query(20)):
    from app.core.redis import get_redis
    r = await get_redis()
    raw = await r.lrange(f"candles:{symbol}:{interval}", -100, -1)
    if not raw:
        raise HTTPException(status_code=404, detail="No candle data")
    candles = [json.loads(c) for c in raw]
    obs = detect_order_blocks(candles, lookback)
    fvgs = detect_fair_value_gaps(candles)
    return {
        "order_blocks": [{"type": z.zone_type.value, "high": z.price_high, "low": z.price_low,
                          "ts": z.timestamp, "strength": z.strength} for z in obs],
        "fair_value_gaps": [{"type": z.zone_type.value, "high": z.price_high, "low": z.price_low,
                             "ts": z.timestamp, "strength": z.strength} for z in fvgs],
    }
