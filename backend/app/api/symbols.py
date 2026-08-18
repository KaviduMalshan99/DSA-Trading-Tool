from fastapi import APIRouter, Query
from app.market.providers.binance import BinanceProvider
from app.market.providers.forex import ForexProvider
from app.market.providers.stocks import StocksProvider

router = APIRouter(prefix="/symbols", tags=["symbols"])

_providers = {
    "crypto": BinanceProvider(),
    "forex": ForexProvider(),
    "stocks": StocksProvider(),
}


@router.get("/search")
async def search_symbols(q: str = Query(..., min_length=1), market: str = Query("crypto")):
    provider = _providers[market]
    all_symbols = await provider.get_symbols()
    q_upper = q.upper()
    return {"results": [s for s in all_symbols if q_upper in s]}
