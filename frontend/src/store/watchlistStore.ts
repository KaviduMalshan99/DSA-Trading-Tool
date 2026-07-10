import { create } from 'zustand';

const DEFAULT_WATCHLIST = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT',
];

const STORAGE_KEY = 'dsa-watchlist';

function loadInitial(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore malformed/blocked storage */ }
  return DEFAULT_WATCHLIST;
}

interface WatchlistState {
  symbols: string[];
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  symbols: loadInitial(),

  addSymbol: (symbol) => {
    if (get().symbols.includes(symbol)) return;
    const next = [...get().symbols, symbol];
    set({ symbols: next });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  },

  removeSymbol: (symbol) => {
    const next = get().symbols.filter((s) => s !== symbol);
    set({ symbols: next });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  },
}));
