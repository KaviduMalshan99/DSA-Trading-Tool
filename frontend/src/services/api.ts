import type { Candle, CandleInterval, MarketType } from '../types/market';
import type { DeltaBar, FootprintBar, VolumeProfileNode, SMCData } from '../types/analytics';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  getCandles: (symbol: string, interval: CandleInterval, limit = 200) =>
    request<Candle[]>(`/candles/${symbol}?interval=${interval}&limit=${limit}`),

  getLatestCandle: (symbol: string, interval: CandleInterval) =>
    request<Candle>(`/candles/${symbol}/latest?interval=${interval}`),

  getSymbols: (market: MarketType = 'crypto') =>
    request<{ market: string; symbols: string[] }>(`/symbols/?market=${market}`),

  searchSymbols: (q: string, market: MarketType = 'crypto') =>
    request<{ results: string[] }>(`/symbols/search?q=${q}&market=${market}`),

  getDelta: (symbol: string, limit = 500) =>
    request<DeltaBar[]>(`/indicators/delta/${symbol}?limit=${limit}`),

  getVolumeProfile: (symbol: string, tickSize = 1, limit = 1000) =>
    request<VolumeProfileNode[]>(
      `/indicators/volume-profile/${symbol}?tick_size=${tickSize}&limit=${limit}`
    ),

  getFootprint: (symbol: string, interval: CandleInterval, tickSize = 1) =>
    request<FootprintBar>(
      `/indicators/footprint/${symbol}?interval=${interval}&tick_size=${tickSize}`
    ),

  getSMCZones: (symbol: string, interval: CandleInterval) =>
    request<SMCData>(`/indicators/smc/${symbol}?interval=${interval}`),
};
