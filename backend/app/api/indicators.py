import aiohttp
from fastapi import APIRouter, Query, HTTPException
from app.core.redis import get_redis
from app.analytics.delta import compute_delta
from app.analytics.volume_profile import build_volume_profile
from app.analytics.footprint import build_footprint
from app.analytics.smc import detect_order_blocks, detect_fair_value_gaps
import json

router = APIRouter(prefix="/indicators", tags=["indicators"])

_BINANCE_REST = "https://api.binance.com"


async def _get_trades(symbol: str, limit: int = 500) -> list[dict]:
    r = await get_redis()
    raw = await r.lrange(f"trade_buffer:{symbol}", -limit, -1)
    return [json.loads(t) for t in raw]


async def _fetch_klines(symbol: str, interval: str, limit: int = 100) -> list[dict]:
    """Pull recent candles straight from Binance — mirrors candle_stream.py's
    approach so this endpoint works without the standalone Redis-fed worker."""
    url = f"{_BINANCE_REST}/api/v3/klines"
    params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            rows = await resp.json()
    return [
        {"t": row[0], "o": float(row[1]), "h": float(row[2]), "l": float(row[3]), "c": float(row[4])}
        for row in rows
    ]


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
    try:
        candles = await _fetch_klines(symbol, interval, 100)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch candles: {exc}")
    if not candles:
        raise HTTPException(status_code=404, detail="No candle data")
    obs = detect_order_blocks(candles, lookback)
    fvgs = detect_fair_value_gaps(candles)
    return {
        "order_blocks": [{"type": z.zone_type.value, "high": z.price_high, "low": z.price_low,
                          "ts": z.timestamp, "strength": z.strength} for z in obs],
        "fair_value_gaps": [{"type": z.zone_type.value, "high": z.price_high, "low": z.price_low,
                             "ts": z.timestamp, "strength": z.strength} for z in fvgs],
    }
