import { create } from 'zustand';

/**
 * Mirrors the current-bar delta/CVD that DeltaPanel already computes from its
 * own /ws/delta/{symbol}/{interval} connection, so other components (the
 * Execution Dashboard) can read it without opening a second connection to
 * the same stream. DeltaPanel is the sole writer.
 */
interface DeltaState {
  delta: number | null;
  cvd: number | null;
  cvdTrend: 'rising' | 'falling' | 'flat' | null;

  /** One bar arrived live — derives trend from the previously stored cvd. */
  setDelta: (delta: number, cvd: number) => void;
  /** Historical bars just loaded — derives trend from the last two bars in one shot. */
  setFromBars: (bars: { delta: number; cvd: number }[]) => void;
  reset: () => void;
}

function trendOf(cvd: number, prevCvd: number | null): 'rising' | 'falling' | 'flat' | null {
  if (prevCvd === null) return null;
  if (cvd > prevCvd) return 'rising';
  if (cvd < prevCvd) return 'falling';
  return 'flat';
}

export const useDeltaStore = create<DeltaState>((set, get) => ({
  delta: null,
  cvd: null,
  cvdTrend: null,

  setDelta: (delta, cvd) => set({ delta, cvd, cvdTrend: trendOf(cvd, get().cvd) }),

  setFromBars: (bars) => {
    if (bars.length === 0) return;
    const last = bars[bars.length - 1];
    const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
    set({ delta: last.delta, cvd: last.cvd, cvdTrend: trendOf(last.cvd, prev?.cvd ?? null) });
  },

  reset: () => set({ delta: null, cvd: null, cvdTrend: null }),
}));
