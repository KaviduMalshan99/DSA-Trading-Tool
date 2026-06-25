from fastapi import APIRouter, Query, HTTPException
from app.core.redis import cache_get, get_redis
import json

router = APIRouter(prefix="/candles", tags=["candles"])


@router.get("/{symbol}")
async def get_candles(
    symbol: str,
    interval: str = Query("1m", description="Candle interval, e.g. 1m, 5m, 1h"),
    limit: int = Query(100, le=1000),
):
    """Return cached candles for a symbol/interval from Redis."""
    r = await get_redis()
    key = f"candles:{symbol}:{interval}"
    raw = await r.lrange(key, -limit, -1)
    if not raw:
        latest = await cache_get(f"latest_candle:{symbol}:{interval}")
        if not latest:
            raise HTTPException(status_code=404, detail="No candles found")
        return [json.loads(latest)]
    return [json.loads(c) for c in raw]


@router.get("/{symbol}/latest")
async def get_latest_candle(symbol: str, interval: str = Query("1m")):
    raw = await cache_get(f"latest_candle:{symbol}:{interval}")
    if not raw:
        raise HTTPException(status_code=404, detail="No candle data available")
    return json.loads(raw)
