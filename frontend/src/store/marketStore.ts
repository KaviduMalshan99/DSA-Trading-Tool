import { create } from 'zustand';
import type { Candle, MarketType, CandleInterval } from '../types/market';

export interface IntervalGroup {
  label: string;
  items: CandleInterval[];
}

// Single source of truth for the selectable intervals, in duration order —
// drives the Timeframe dropdown, the favorite-pill sort order, and the
// filter that drops stale stored favorites.
export const INTERVAL_GROUPS: IntervalGroup[] = [
  { label: 'Minutes', items: ['1m', '3m', '5m', '15m', '30m'] },
  { label: 'Hours',   items: ['1h', '2h', '4h', '6h', '8h', '12h'] },
  { label: 'Days',    items: ['1d', '3d'] },
  { label: 'Weeks',   items: ['1w'] },
  { label: 'Months',  items: ['1M'] },
];

export const ALL_INTERVALS: CandleInterval[] = INTERVAL_GROUPS.flatMap((g) => g.items);

const FAV_INTERVALS_KEY = 'dsa-fav-intervals';

function loadInitialFavoriteIntervals(): CandleInterval[] {
  try {
    const raw = localStorage.getItem(FAV_INTERVALS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      // Drop anything that isn't a currently-known interval so a removed or
      // renamed interval can't render a broken pill.
      if (Array.isArray(parsed)) {
        return ALL_INTERVALS.filter((iv) => parsed.includes(iv));
      }
    }
  } catch { /* ignore malformed/blocked storage */ }
  return [];
}

interface MarketState {
  activeSymbol: string;
  activeMarket: MarketType;
  activeInterval: CandleInterval;
  candles: Candle[];
  isLoading: boolean;
  favoriteIntervals: CandleInterval[];

  setSymbol: (symbol: string) => void;
  setActiveSymbol: (symbol: string) => void;
  setMarket: (market: MarketType) => void;
  setInterval: (interval: CandleInterval) => void;
  setActiveInterval: (interval: CandleInterval) => void;
  setCandles: (candles: Candle[]) => void;
  appendCandle: (candle: Candle) => void;
  prependCandles: (older: Candle[]) => void;
  setLoading: (v: boolean) => void;
  toggleFavoriteInterval: (interval: CandleInterval) => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  activeSymbol: 'BTCUSDT',
  activeMarket: 'crypto',
  activeInterval: '1h',
  candles: [],
  isLoading: false,
  favoriteIntervals: loadInitialFavoriteIntervals(),

  setSymbol:         (symbol)   => set({ activeSymbol: symbol, candles: [] }),
  setActiveSymbol:   (symbol)   => set({ activeSymbol: symbol, candles: [] }),
  setMarket:         (market)   => set({ activeMarket: market }),
  setInterval:       (interval) => set({ activeInterval: interval, candles: [] }),
  setActiveInterval: (interval) => set({ activeInterval: interval, candles: [] }),
  setCandles: (candles) => set({ candles }),
  appendCandle: (candle) =>
    set((state) => {
      const last = state.candles.at(-1);
      if (last && last.t === candle.t) {
        return { candles: [...state.candles.slice(0, -1), candle] };
      }
      return { candles: [...state.candles, candle].slice(-2000) };
    }),
  prependCandles: (older) =>
    set((state) => {
      if (older.length === 0) return {};
      const firstT = state.candles[0]?.t;
      const filtered = firstT !== undefined ? older.filter((c) => c.t < firstT) : older;
      if (filtered.length === 0) return {};
      return { candles: [...filtered, ...state.candles].slice(-2000) };
    }),
  setLoading: (isLoading) => set({ isLoading }),
  toggleFavoriteInterval: (interval) => {
    const favs = get().favoriteIntervals;
    const next = favs.includes(interval)
      ? favs.filter((iv) => iv !== interval)
      : [...favs, interval];
    set({ favoriteIntervals: next });
    try { localStorage.setItem(FAV_INTERVALS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  },
}));
