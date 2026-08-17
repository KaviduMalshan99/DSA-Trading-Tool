import { create } from 'zustand';

export type ScannerEventType = 'whale' | 'absorption' | 'stack' | 'delta';
export type ScannerSide = 'buy' | 'sell';

export interface ScannerEvent {
  id: string;
  time: number;    // epoch ms — see ClusterScanner.tsx header comment for what "time" means per event type
  symbol: string;
  eventType: ScannerEventType;
  side: ScannerSide;
  label: string;    // e.g. "Whale BUY $1.2M", "Buy absorption", "Stacked buy imbalance", "Large +delta (412.30)"
}

const MAX_EVENTS = 100;

// Live feed only — deliberately not persisted (unlike candleStyleStore/
// positionCalcStore/tradeChecklistStore). A scanner event log surviving a
// page reload as stale history would be misleading for a panel whose whole
// point is "what's happening right now."
interface ClusterScannerState {
  events: ScannerEvent[];
  addEvent: (e: Omit<ScannerEvent, 'id'>) => void;
  clearEvents: () => void;
}

export const useClusterScannerStore = create<ClusterScannerState>((set) => ({
  events: [],

  addEvent: (e) =>
    set((state) => ({
      events: [{ ...e, id: crypto.randomUUID() }, ...state.events].slice(0, MAX_EVENTS),
    })),

  clearEvents: () => set({ events: [] }),
}));
