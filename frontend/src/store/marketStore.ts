import { create } from 'zustand';
import type { Candle, MarketType, CandleInterval } from '../types/market';

interface MarketState {
  activeSymbol: string;
  activeMarket: MarketType;
  activeInterval: CandleInterval;
  candles: Candle[];
  isLoading: boolean;

  setSymbol: (symbol: string) => void;
  setActiveSymbol: (symbol: string) => void;
  setMarket: (market: MarketType) => void;
  setInterval: (interval: CandleInterval) => void;
  setCandles: (candles: Candle[]) => void;
  appendCandle: (candle: Candle) => void;
  setLoading: (v: boolean) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  activeSymbol: 'BTCUSDT',
  activeMarket: 'crypto',
  activeInterval: '1m',
  candles: [],
  isLoading: false,

  setSymbol:       (symbol) => set({ activeSymbol: symbol, candles: [] }),
  setActiveSymbol: (symbol) => set({ activeSymbol: symbol, candles: [] }),
  setMarket: (market) => set({ activeMarket: market }),
  setInterval: (interval) => set({ activeInterval: interval, candles: [] }),
  setCandles: (candles) => set({ candles }),
  appendCandle: (candle) =>
    set((state) => {
      const last = state.candles.at(-1);
      if (last && last.t === candle.t) {
        return { candles: [...state.candles.slice(0, -1), candle] };
      }
      return { candles: [...state.candles, candle].slice(-2000) };
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));
