import type { Candle, CandleInterval, MarketType } from '../types/market';
import type {
  SMCData, LevelsData, VWAPData, StructureData, AbsorptionData,
} from '../types/analytics';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  getCandles: (symbol: string, interval: CandleInterval, limit = 200) =>
    request<Candle[]>(`/candles/${symbol}?interval=${interval}&limit=${limit}`),

  searchSymbols: (q: string, market: MarketType = 'crypto') =>
    request<{ results: string[] }>(`/symbols/search?q=${q}&market=${market}`),

  getSMCZones: (symbol: string, interval: CandleInterval) =>
    request<SMCData>(`/indicators/smc/${symbol}?interval=${interval}`),

  getLevels: (symbol: string) =>
    request<LevelsData>(`/indicators/levels/${symbol}`),

  getSessionVWAP: (symbol: string, interval: CandleInterval) =>
    request<VWAPData>(`/indicators/vwap/${symbol}/${interval}`),

  // swing_strength is tunable server-side; the overlay uses the backend default (3)
  getStructure: (symbol: string, interval: CandleInterval, swingStrength?: number) =>
    request<StructureData>(
      `/indicators/structure/${symbol}/${interval}` +
        (swingStrength === undefined ? '' : `?swing_strength=${swingStrength}`)
    ),

  // volume_multiplier/range_fraction/lookback are tunable server-side; the
  // overlay uses the backend defaults (1.5 / 0.85 / 20) until thresholds are tuned
  getAbsorption: (
    symbol: string,
    interval: CandleInterval,
    params?: { volumeMultiplier?: number; rangeFraction?: number; lookback?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.volumeMultiplier !== undefined) qs.set('volume_multiplier', String(params.volumeMultiplier));
    if (params?.rangeFraction !== undefined) qs.set('range_fraction', String(params.rangeFraction));
    if (params?.lookback !== undefined) qs.set('lookback', String(params.lookback));
    const query = qs.toString();
    return request<AbsorptionData>(
      `/indicators/absorption/${symbol}/${interval}${query ? `?${query}` : ''}`
    );
  },
};
