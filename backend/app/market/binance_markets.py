"""
Binance spot + USD-M perpetual futures, addressed by one display symbol.

Display symbols follow TradingView: spot is the raw pair ("BTCUSDT"), a
perpetual carries a ".P" suffix ("BTCUSDT.P"). The suffix is ours only; it is
always stripped before a symbol reaches a Binance URL or stream name.
"""
import asyncio
import logging
import re
import time
from typing import Literal

import aiohttp

logger = logging.getLogger(__name__)

Market = Literal["spot", "perp"]

PERP_SUFFIX = ".P"
_SYMBOL_RE = re.compile(r"[A-Z0-9]{2,30}(\.P)?")

KLINES_URL: dict[Market, str] = {
    "spot": "https://api.binance.com/api/v3/klines",
    "perp": "https://fapi.binance.com/fapi/v1/klines",
}
WS_BASE: dict[Market, str] = {
    "spot": "wss://stream.binance.com:9443/ws",
    # Futures market streams live under /market: the legacy fstream.binance.com/ws
    # path still accepts the connection but no longer sends kline data.
    "perp": "wss://fstream.binance.com/market/ws",
}
EXCHANGE_INFO_URL: dict[Market, str] = {
    "spot": "https://api.binance.com/api/v3/exchangeInfo",
    "perp": "https://fapi.binance.com/fapi/v1/exchangeInfo",
}

# Kline intervals Binance offers per market (futures has no 1s).
INTERVALS: dict[Market, frozenset[str]] = {
    "spot": frozenset({"1s", "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"}),
    "perp": frozenset({"1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"}),
}


def parse_symbol(symbol: str) -> tuple[Market, str]:
    """"btcusdt" -> ("spot", "BTCUSDT"); "BTCUSDT.P" -> ("perp", "BTCUSDT").
    Raises ValueError for anything that isn't a plain [A-Z0-9] pair with an
    optional ".P" suffix, so arbitrary strings never reach a Binance URL."""
    s = symbol.upper()
    if _SYMBOL_RE.fullmatch(s) is None:
        raise ValueError("invalid symbol")
    if s.endswith(PERP_SUFFIX):
        return "perp", s[: -len(PERP_SUFFIX)]
    return "spot", s


def display_symbol(market: Market, raw: str) -> str:
    return f"{raw}{PERP_SUFFIX}" if market == "perp" else raw


# ── exchangeInfo cache ──────────────────────────────────────────────────────

_CACHE_TTL = 3600.0
_RETRY_AFTER_FAILURE = 60.0  # don't hammer Binance while it's failing


class _SymbolCache:
    def __init__(self, market: Market):
        self.market = market
        self.symbols: list[str] = []          # raw symbols, exchange order
        self.tick_sizes: dict[str, str] = {}  # raw symbol -> tickSize string
        self.expires_at = 0.0
        self.lock = asyncio.Lock()

    def _accept(self, s: dict) -> bool:
        if s.get("status") != "TRADING":
            return False
        if self.market == "perp":
            return s.get("contractType") == "PERPETUAL"
        return True

    async def get(self) -> "_SymbolCache":
        if time.monotonic() < self.expires_at:
            return self
        async with self.lock:
            if time.monotonic() < self.expires_at:
                return self
            try:
                timeout = aiohttp.ClientTimeout(total=15)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(EXCHANGE_INFO_URL[self.market]) as resp:
                        resp.raise_for_status()
                        data = await resp.json()
                symbols: list[str] = []
                ticks: dict[str, str] = {}
                for s in data["symbols"]:
                    if not self._accept(s):
                        continue
                    raw = s["symbol"]
                    if _SYMBOL_RE.fullmatch(raw) is None:
                        continue
                    symbols.append(raw)
                    for f in s.get("filters", []):
                        if f.get("filterType") == "PRICE_FILTER":
                            ticks[raw] = f.get("tickSize", "")
                self.symbols, self.tick_sizes = symbols, ticks
                self.expires_at = time.monotonic() + _CACHE_TTL
            except Exception as exc:  # noqa: BLE001 — keep serving the old list
                logger.warning("Binance %s exchangeInfo refresh failed: %s", self.market, exc)
                self.expires_at = time.monotonic() + _RETRY_AFTER_FAILURE
                if not self.symbols:
                    raise
        return self


_caches: dict[Market, _SymbolCache] = {"spot": _SymbolCache("spot"), "perp": _SymbolCache("perp")}


async def get_symbols(market: Market) -> list[str]:
    """Raw TRADING symbols for the market (perp: PERPETUAL contracts only), cached 1h."""
    return (await _caches[market].get()).symbols


async def get_tick_size(market: Market, raw: str) -> str | None:
    cache = await _caches[market].get()
    return cache.tick_sizes.get(raw)
