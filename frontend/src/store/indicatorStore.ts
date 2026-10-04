import { create } from 'zustand';
import { saveLocal } from '../services/persist';

/**
 * Student-facing chart indicators (Indicators dropdown). Deliberately separate
 * from chartStore's visibleOverlays: those are the pro order-flow overlays,
 * gated by config/topBarVisibility.ts, while indicators are always available.
 */
export type IndicatorType = 'ema' | 'bollinger';

/**
 * Oscillators drawn in their own sub-panel below the main chart. Only one
 * panel slot exists, so these are single-select — unlike the overlays above,
 * which stack on the main chart and can all be on at once.
 */
export type SubPanelIndicator = 'rsi' | 'macd' | 'stochRsi';

/** Keys are unique across both kinds, so one union identifies any indicator (used for favorites). */
export type IndicatorKey = IndicatorType | SubPanelIndicator;

// Every known indicator key — used to drop stale stored favorites on load.
const ALL_INDICATOR_KEYS: IndicatorKey[] = ['ema', 'bollinger', 'rsi', 'stochRsi', 'macd'];

const FAV_INDICATORS_KEY = 'dsa-fav-indicators';

function loadInitialFavoriteIndicators(): IndicatorKey[] {
  try {
    const raw = localStorage.getItem(FAV_INDICATORS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      // Drop anything that isn't a currently-known indicator so a removed or
      // renamed indicator can't render a broken pill.
      if (Array.isArray(parsed)) {
        return ALL_INDICATOR_KEYS.filter((k) => parsed.includes(k));
      }
    }
  } catch { /* ignore malformed/blocked storage */ }
  return [];
}

const SUBPANEL_RATIO_KEY = 'dsa-subpanel-ratio';
const DEFAULT_SUBPANEL_RATIO = 0.2;
export const MIN_SUBPANEL_RATIO = 0.1;
export const MAX_SUBPANEL_RATIO = 0.6;

function clampSubPanelRatio(r: number): number {
  return Math.min(Math.max(r, MIN_SUBPANEL_RATIO), MAX_SUBPANEL_RATIO);
}

function loadInitialSubPanelRatio(): number {
  try {
    const raw = localStorage.getItem(SUBPANEL_RATIO_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        return clampSubPanelRatio(parsed);
      }
    }
  } catch { /* ignore malformed/blocked storage */ }
  return DEFAULT_SUBPANEL_RATIO;
}

interface IndicatorState {
  activeIndicators: Set<IndicatorType>;
  // Per-indicator settings (e.g. EMA periods/colors) will live here once
  // indicators become configurable; for now each uses fixed defaults.

  /** The oscillator shown in the sub-panel, or null for no panel. */
  activeSubPanel: SubPanelIndicator | null;

  /** Indicators starred in the Indicators dropdown; persisted to localStorage. */
  favoriteIndicators: IndicatorKey[];

  /** Fraction of the chart-column height the sub-panel takes; persisted to localStorage. */
  subPanelRatio: number;

  toggleIndicator: (indicator: IndicatorType) => void;
  /** Selecting a panel indicator swaps out any other; selecting the active one hides the panel. */
  toggleSubPanel: (indicator: SubPanelIndicator) => void;
  toggleFavoriteIndicator: (key: IndicatorKey) => void;
  /** Turns off every main-chart indicator and the sub-panel (favorites/ratio untouched). */
  clearAllIndicators: () => void;
  /** Live update (called every frame while dragging the divider) — does not persist. */
  setSubPanelRatio: (ratio: number) => void;
  /** Writes the current ratio to localStorage — called once when the drag ends. */
  persistSubPanelRatio: () => void;
}

export const useIndicatorStore = create<IndicatorState>((set, get) => ({
  activeIndicators: new Set<IndicatorType>(),
  activeSubPanel: null,
  favoriteIndicators: loadInitialFavoriteIndicators(),
  subPanelRatio: loadInitialSubPanelRatio(),

  toggleIndicator: (indicator) =>
    set((state) => {
      const next = new Set(state.activeIndicators);
      if (next.has(indicator)) {
        next.delete(indicator);
      } else {
        next.add(indicator);
      }
      return { activeIndicators: next };
    }),

  toggleSubPanel: (indicator) =>
    set((state) => ({
      activeSubPanel: state.activeSubPanel === indicator ? null : indicator,
    })),

  toggleFavoriteIndicator: (key) => {
    const favs = get().favoriteIndicators;
    const next = favs.includes(key)
      ? favs.filter((k) => k !== key)
      : [...favs, key];
    set({ favoriteIndicators: next });
    saveLocal(FAV_INDICATORS_KEY, JSON.stringify(next));
  },

  clearAllIndicators: () => set({ activeIndicators: new Set<IndicatorType>(), activeSubPanel: null }),

  setSubPanelRatio: (ratio) => set({ subPanelRatio: clampSubPanelRatio(ratio) }),

  persistSubPanelRatio: () => {
    try { localStorage.setItem(SUBPANEL_RATIO_KEY, JSON.stringify(get().subPanelRatio)); } catch { /* ignore */ }
  },
}));
