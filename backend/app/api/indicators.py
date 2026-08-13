import aiohttp
from fastapi import APIRouter, Query, HTTPException
from app.core.redis import get_redis
from app.analytics.delta import compute_delta
from app.analytics.volume_profile import build_volume_profile
from app.analytics.footprint import build_footprint
from app.analytics.smc import detect_order_blocks, detect_fair_value_gaps
from app.analytics.levels import compute_levels
from app.analytics.vwap import compute_session_vwap, utc_day_start_ms
from app.analytics.structure import detect_swings
from app.analytics.price_step import fetch_tick_size
import json
import time

router = APIRouter(prefix="/indicators", tags=["indicators"])

_BINANCE_REST = "https://api.binance.com"
_KLINES_PER_PAGE = 1000   # Binance's per-response cap
_MAX_KLINE_PAGES = 3      # 3000 candles — covers a full UTC day at 1m with room to spare


async def _get_trades(symbol: str, limit: int = 500) -> list[dict]:
    r = await get_redis()
    raw = await r.lrange(f"trade_buffer:{symbol}", -limit, -1)
    return [json.loads(t) for t in raw]


async def _fetch_klines(
    symbol: str,
    interval: str,
    limit: int = 100,
    start_time: int | None = None,
) -> list[dict]:
    """Pull recent candles straight from Binance — mirrors candle_stream.py's
    approach so this endpoint works without the standalone Redis-fed worker."""
    url = f"{_BINANCE_REST}/api/v3/klines"
    params: dict = {"symbol": symbol.upper(), "interval": interval, "limit": limit}
    if start_time is not None:
        params["startTime"] = start_time
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            rows = await resp.json()
    return [
        {"t": row[0], "o": float(row[1]), "h": float(row[2]), "l": float(row[3]),
         "c": float(row[4]), "v": float(row[5])}
        for row in rows
    ]


async def _fetch_klines_since(symbol: str, interval: str, start_ms: int) -> list[dict]:
    """
    Every candle from `start_ms` to now, paging as needed. Binance caps a
    single klines response at 1000 rows, which isn't enough to cover a full
    UTC day at 1m (1440 candles), so keep requesting from just past the last
    row received until a short (final) page comes back.
    """
    out: list[dict] = []
    cursor = start_ms
    for _ in range(_MAX_KLINE_PAGES):
        page = await _fetch_klines(symbol, interval, _KLINES_PER_PAGE, cursor)
        if not page:
            break
        out.extend(page)
        if len(page) < _KLINES_PER_PAGE:
            break
        cursor = page[-1]["t"] + 1  # startTime is inclusive — step past it
    return out


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


@router.get("/levels/{symbol}")
async def get_institutional_levels(symbol: str):
    try:
        candles = await _fetch_klines(symbol, "1d", 2)
        tick_size = await fetch_tick_size(symbol)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch levels: {exc}")
    if len(candles) < 2:
        raise HTTPException(status_code=404, detail="No candle data")
    levels = compute_levels(candles, tick_size)
    return {
        "daily_open": levels.daily_open,
        "pdh": levels.pdh,
        "pdl": levels.pdl,
        "decimals": levels.decimals,
    }


@router.get("/vwap/{symbol}/{interval}")
async def get_session_vwap(symbol: str, interval: str):
    """
    Running session VWAP for the current UTC day, one point per candle at the
    viewing timeframe (hence `interval` in the path — VWAP is computed
    per-candle, so 1m and 1h give genuinely different series).
    """
    session_start = utc_day_start_ms(int(time.time() * 1000))
    try:
        candles = await _fetch_klines_since(symbol, interval, session_start)
        tick_size = await fetch_tick_size(symbol)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch VWAP candles: {exc}")
    if not candles:
        raise HTTPException(status_code=404, detail="No candle data")
    result = compute_session_vwap(candles, tick_size, session_start)
    if not result.points:
        raise HTTPException(status_code=404, detail="No traded volume in this session yet")
    return {
        "points": [{"time": p.time, "vwap": p.vwap} for p in result.points],
        "current": result.current,
        "session_start": result.session_start,
        "decimals": result.decimals,
    }


@router.get("/structure/{symbol}/{interval}")
async def get_market_structure(
    symbol: str,
    interval: str,
    swing_strength: int = Query(3, ge=1, le=20),
    limit: int = Query(200, le=1000),
):
    """
    Swing highs/lows (pivots), trend labels, and BOS/CHOCH structure breaks
    over the last `limit` candles at this timeframe.
    """
    try:
        candles = await _fetch_klines(symbol, interval, limit)
        tick_size = await fetch_tick_size(symbol)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch candles: {exc}")
    if not candles:
        raise HTTPException(status_code=404, detail="No candle data")
    structure = detect_swings(candles, tick_size, swing_strength)
    return {
        "swings": [
            {"time": s.time, "price": s.price, "type": s.type, "label": s.label}
            for s in structure.swings
        ],
        "current_trend": structure.current_trend,
        "swing_strength": structure.swing_strength,
        "decimals": structure.decimals,
        "structure_breaks": [
            {"time": b.time, "price": b.price, "type": b.type, "direction": b.direction}
            for b in structure.structure_breaks
        ],
    }
