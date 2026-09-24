import { create } from 'zustand';

/**
 * Student-facing chart indicators (Indicators dropdown). Deliberately separate
 * from chartStore's visibleOverlays: those are the pro order-flow overlays,
 * gated by config/topBarVisibility.ts, while indicators are always available.
 */
export type IndicatorType = 'ema';

interface IndicatorState {
  activeIndicators: Set<IndicatorType>;
  // Per-indicator settings (e.g. EMA periods/colors) will live here once
  // indicators become configurable; for now each uses fixed defaults.

  toggleIndicator: (indicator: IndicatorType) => void;
}

export const useIndicatorStore = create<IndicatorState>((set) => ({
  activeIndicators: new Set<IndicatorType>(),

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
}));
