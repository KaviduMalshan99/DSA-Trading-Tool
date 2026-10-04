import { create } from 'zustand';
import { saveLocal } from '../services/persist';

const DEFAULT_WATCHLIST = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT',
];

const STORAGE_KEY = 'dsa-watchlist';
// Kept separate from STORAGE_KEY so the existing bare-array watchlist format is untouched.
const TAGS_STORAGE_KEY = 'dsa-watchlist-tags';

export const TAG_COLORS = ['#ef4444', '#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

function loadInitial(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore malformed/blocked storage */ }
  return DEFAULT_WATCHLIST;
}

function loadTags(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') out[k] = v;
        }
        return out;
      }
    }
  } catch { /* ignore malformed/blocked storage */ }
  return {};
}

interface WatchlistState {
  symbols: string[];
  tagColors: Record<string, string>;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
  setTagColor: (symbol: string, color: string | null) => void;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  symbols: loadInitial(),
  tagColors: loadTags(),

  addSymbol: (symbol) => {
    if (get().symbols.includes(symbol)) return;
    const next = [...get().symbols, symbol];
    set({ symbols: next });
    saveLocal(STORAGE_KEY, JSON.stringify(next));
  },

  removeSymbol: (symbol) => {
    const next = get().symbols.filter((s) => s !== symbol);
    const nextTags = { ...get().tagColors };
    delete nextTags[symbol];
    set({ symbols: next, tagColors: nextTags });
    saveLocal(STORAGE_KEY, JSON.stringify(next));
    saveLocal(TAGS_STORAGE_KEY, JSON.stringify(nextTags));
  },

  setTagColor: (symbol, color) => {
    const nextTags = { ...get().tagColors };
    if (color === null) delete nextTags[symbol];
    else nextTags[symbol] = color;
    set({ tagColors: nextTags });
    saveLocal(TAGS_STORAGE_KEY, JSON.stringify(nextTags));
  },
}));
