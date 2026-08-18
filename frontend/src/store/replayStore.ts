import { create } from 'zustand';
import { useMarketStore } from './marketStore';

export type ReplaySpeed = 0.5 | 1 | 2 | 4;

interface ReplayState {
  /** Armed, waiting for the user to click a candle on the chart to pick the start bar. */
  isPicking: boolean;
  /** Replay mode is live — chart shows candles only up to cursorTime. */
  isActive: boolean;
  isPlaying: boolean;
  speed: ReplaySpeed;
  /** Candle `t` (ms) of the last bar currently revealed. Null when not in replay. */
  cursorTime: number | null;

  armPicking: () => void;
  cancelPicking: () => void;
  startReplay: (startTime: number) => void;
  exitReplay: () => void;
  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBack: () => void;
  setCursorTime: (t: number) => void;
  setSpeed: (speed: ReplaySpeed) => void;
}

export const useReplayStore = create<ReplayState>((set) => ({
  isPicking: false,
  isActive: false,
  isPlaying: false,
  speed: 1,
  cursorTime: null,

  armPicking: () => set({ isPicking: true }),
  cancelPicking: () => set({ isPicking: false }),

  startReplay: (startTime) =>
    set({ isActive: true, isPicking: false, isPlaying: false, cursorTime: startTime }),

  exitReplay: () =>
    set({ isActive: false, isPicking: false, isPlaying: false, cursorTime: null }),

  play: () => set((state) => (state.isActive ? { isPlaying: true } : {})),
  pause: () => set({ isPlaying: false }),

  // Manual stepping always pauses playback so it doesn't fight the play interval.
  stepForward: () =>
    set((state) => {
      if (!state.isActive || state.cursorTime == null) return {};
      const candles = useMarketStore.getState().candles;
      const idx = candles.findIndex((c) => c.t === state.cursorTime);
      if (idx === -1 || idx >= candles.length - 1) return { isPlaying: false };
      return { cursorTime: candles[idx + 1].t, isPlaying: false };
    }),

  stepBack: () =>
    set((state) => {
      if (!state.isActive || state.cursorTime == null) return {};
      const candles = useMarketStore.getState().candles;
      const idx = candles.findIndex((c) => c.t === state.cursorTime);
      if (idx <= 0) return { isPlaying: false };
      return { cursorTime: candles[idx - 1].t, isPlaying: false };
    }),

  setCursorTime: (t) => set({ cursorTime: t }),
  setSpeed: (speed) => set({ speed }),
}));
