import { create } from 'zustand';

export interface CandleStyle {
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  bodyVisible: boolean;
  bordersVisible: boolean;
  wickVisible: boolean;
}

// TradingView's own default candle colors.
const DEFAULT_STYLE: CandleStyle = {
  upColor: '#089981',
  downColor: '#F23645',
  borderUpColor: '#089981',
  borderDownColor: '#F23645',
  wickUpColor: '#089981',
  wickDownColor: '#F23645',
  bodyVisible: true,
  bordersVisible: true,
  wickVisible: true,
};

const STORAGE_KEY = 'dsa-candle-style';

function loadInitial(): CandleStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STYLE, ...JSON.parse(raw) };
  } catch { /* ignore malformed/blocked storage */ }
  return DEFAULT_STYLE;
}

interface CandleStyleState extends CandleStyle {
  setStyle: (patch: Partial<CandleStyle>) => void;
  resetStyle: () => void;
}

export const useCandleStyleStore = create<CandleStyleState>((set, get) => ({
  ...loadInitial(),

  setStyle: (patch) => {
    set(patch);
    // JSON.stringify silently drops function-valued properties (setStyle/resetStyle),
    // so this persists only the plain CandleStyle fields.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get())); } catch { /* ignore */ }
  },

  resetStyle: () => {
    set(DEFAULT_STYLE);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(get())); } catch { /* ignore */ }
  },
}));
