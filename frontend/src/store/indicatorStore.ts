import { create } from 'zustand';

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

interface IndicatorState {
  activeIndicators: Set<IndicatorType>;
  // Per-indicator settings (e.g. EMA periods/colors) will live here once
  // indicators become configurable; for now each uses fixed defaults.

  /** The oscillator shown in the sub-panel, or null for no panel. */
  activeSubPanel: SubPanelIndicator | null;

  toggleIndicator: (indicator: IndicatorType) => void;
  /** Selecting a panel indicator swaps out any other; selecting the active one hides the panel. */
  toggleSubPanel: (indicator: SubPanelIndicator) => void;
}

export const useIndicatorStore = create<IndicatorState>((set) => ({
  activeIndicators: new Set<IndicatorType>(),
  activeSubPanel: null,

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
}));
