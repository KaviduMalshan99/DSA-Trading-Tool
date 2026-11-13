import { create } from 'zustand';

export type ChartType = 'candle' | 'line';

const LOG_SCALE_KEY = 'dsa-log-scale';

function loadInitialLogScale(): boolean {
  try {
    return localStorage.getItem(LOG_SCALE_KEY) === 'true';
  } catch { /* ignore blocked storage */ }
  return false;
}

interface ChartState {
  visibleRange: { from: number; to: number } | null;
  crosshairPrice: number | null;
  crosshairTime: number | null;
  // Main price display. The candlestick series always exists (overlays map
  // prices through it); 'line' makes it transparent and shows a close-price
  // line series on top instead.
  chartType: ChartType;
  // Main chart's right price scale: logarithmic vs linear. Persisted. (Auto-scale
  // is transient view state and lives on the chart itself, not here.)
  logScale: boolean;
  // Chart Settings modal open state — in the store so both the toolbar gear and
  // the chart's right-click menu can open it.
  settingsOpen: boolean;

  setVisibleRange: (from: number, to: number) => void;
  setCrosshair: (price: number | null, time: number | null) => void;
  setChartType: (type: ChartType) => void;
  setLogScale: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
}

export const useChartStore = create<ChartState>((set) => ({
  visibleRange: null,
  crosshairPrice: null,
  crosshairTime: null,
  chartType: 'candle',
  logScale: loadInitialLogScale(),
  settingsOpen: false,

  setVisibleRange: (from, to) => set({ visibleRange: { from, to } }),
  setCrosshair: (crosshairPrice, crosshairTime) =>
    set({ crosshairPrice, crosshairTime }),
  setChartType: (chartType) => set({ chartType }),
  setLogScale: (logScale) => {
    set({ logScale });
    try { localStorage.setItem(LOG_SCALE_KEY, String(logScale)); } catch { /* ignore */ }
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
