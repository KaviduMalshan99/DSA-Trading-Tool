// Display symbols follow TradingView: spot is the raw Binance pair ("BTCUSDT"),
// a USD-M perpetual carries a ".P" suffix ("BTCUSDT.P"). The suffix is ours
// only — strip it before talking to Binance or splitting base/quote.

import { useEffect, useState } from 'react';
import { api } from '../services/api';

export const PERP_SUFFIX = '.P';

export function isPerp(symbol: string): boolean {
  return symbol.toUpperCase().endsWith(PERP_SUFFIX);
}

/** "BTCUSDT.P" → "BTCUSDT"; spot symbols are returned as-is. */
export function rawSymbol(symbol: string): string {
  return isPerp(symbol) ? symbol.slice(0, -PERP_SUFFIX.length) : symbol;
}

/** Binance 24h ticker URL for the symbol's market (both send CORS `*`). */
export function ticker24hUrl(symbol: string): string {
  const raw = encodeURIComponent(rawSymbol(symbol).toUpperCase());
  return isPerp(symbol)
    ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${raw}`
    : `https://api.binance.com/api/v3/ticker/24hr?symbol=${raw}`;
}

// ── Perp tick size ──────────────────────────────────────────────────────────
// Perpetual prices sit on a coarser grid than spot (BTCUSDT.P ticks 0.10), so
// perps are displayed at their tick's decimals, as TradingView does. Spot keeps
// the magnitude-based decimals from priceFormat.ts unchanged.

export interface TickInfo {
  decimals: number;
  minMove: number;
}

const tickCache = new Map<string, TickInfo | null>();
const inflight = new Map<string, Promise<TickInfo | null>>();

function parseTick(tick: string): TickInfo | null {
  const minMove = Number(tick);
  if (!Number.isFinite(minMove) || minMove <= 0) return null;
  const frac = tick.includes('.') ? tick.split('.')[1].replace(/0+$/, '') : '';
  return { decimals: frac.length, minMove };
}

function loadTick(symbol: string): Promise<TickInfo | null> {
  const key = symbol.toUpperCase();
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = api.symbolInfo(key)
    .then((r) => parseTick(r.tick_size))
    .catch(() => null)
    .then((info) => { tickCache.set(key, info); inflight.delete(key); return info; });
  inflight.set(key, p);
  return p;
}

/** Tick info for a perpetual (null for spot, or until/unless it loads). */
export function usePerpTick(symbol: string): TickInfo | null {
  const key = symbol.toUpperCase();
  const [info, setInfo] = useState<TickInfo | null>(() => (isPerp(key) ? tickCache.get(key) ?? null : null));
  useEffect(() => {
    if (!isPerp(key)) { setInfo(null); return; }
    if (tickCache.has(key)) { setInfo(tickCache.get(key) ?? null); return; }
    setInfo(null);
    let cancelled = false;
    loadTick(key).then((v) => { if (!cancelled) setInfo(v); });
    return () => { cancelled = true; };
  }, [key]);
  return info;
}
