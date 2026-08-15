import { create } from 'zustand';

/**
 * Mirrors the strongest imbalance/stack signal on the most recent footprint
 * bar, so other components (the Execution Dashboard) can read it without
 * opening a second /ws/footprint/{symbol}/{interval} connection — the ratio/
 * stack-run detection FootprintCanvas already computes for its own drawing
 * is reused as-is, just also written here after each WS message.
 * FootprintCanvas is the sole writer.
 */
interface FootprintSignalState {
  side: 'buy' | 'sell' | null;
  isStack: boolean;
  barTime: number | null;

  setSignal: (side: 'buy' | 'sell' | null, isStack: boolean, barTime: number | null) => void;
}

export const useFootprintSignalStore = create<FootprintSignalState>((set) => ({
  side: null,
  isStack: false,
  barTime: null,

  setSignal: (side, isStack, barTime) => set({ side, isStack, barTime }),
}));
