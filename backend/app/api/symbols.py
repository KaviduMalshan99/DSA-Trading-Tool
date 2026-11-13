from fastapi import APIRouter, HTTPException, Query
from app.market import binance_markets
from app.market.binance_markets import PERP_SUFFIX, parse_symbol
from app.market.providers.binance import BinanceProvider
from app.market.providers.forex import ForexProvider
from app.market.providers.stocks import StocksProvider

router = APIRouter(prefix="/symbols", tags=["symbols"])

_providers = {
    "crypto": BinanceProvider(),
    "forex": ForexProvider(),
    "stocks": StocksProvider(),
}


async def _crypto_symbols() -> list[str]:
    """Spot symbols, each followed by its perpetual (XXX.P) when one exists;
    perpetuals without a spot pair come last. Either list failing to load
    just leaves its market out."""
    try:
        spot = await binance_markets.get_symbols("spot")
    except Exception:
        spot = []
    try:
        perp = await binance_markets.get_symbols("perp")
    except Exception:
        perp = []
    if not spot and not perp:
        raise HTTPException(status_code=502, detail="Symbol list unavailable")
    perp_set = set(perp)
    out: list[str] = []
    for s in spot:
        out.append(s)
        if s in perp_set:
            out.append(s + PERP_SUFFIX)
    spot_set = set(spot)
    out.extend(p + PERP_SUFFIX for p in perp if p not in spot_set)
    return out


@router.get("/search")
async def search_symbols(q: str = Query(..., min_length=1), market: str = Query("crypto")):
    if market not in _providers:
        raise HTTPException(status_code=400, detail="Unknown market")
    q_upper = q.strip().upper()
    if market != "crypto":
        all_symbols = await _providers[market].get_symbols()
        return {"results": [s for s in all_symbols if q_upper in s]}

    matches = [s for s in await _crypto_symbols() if q_upper in s]
    # Exact match first; the rest keep spot-then-its-.P order.
    if q_upper in matches:
        matches.remove(q_upper)
        matches.insert(0, q_upper)
    return {"results": matches}


@router.get("/info/{symbol}")
async def symbol_info(symbol: str):
    """Price tick size for a display symbol (BTCUSDT / BTCUSDT.P), from the cached exchangeInfo."""
    try:
        market, raw = parse_symbol(symbol)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid symbol")
    try:
        tick = await binance_markets.get_tick_size(market, raw)
    except Exception:
        raise HTTPException(status_code=502, detail="Symbol info unavailable")
    if tick is None:
        raise HTTPException(status_code=404, detail="Unknown symbol")
    return {"symbol": symbol.upper(), "market": market, "tick_size": tick}
