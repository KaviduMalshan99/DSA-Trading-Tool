import { create } from 'zustand';

// Manual items the trader ticks themselves — the platform has no data source
// for any of these, so they're plain persisted checkboxes.
export const MANUAL_ITEMS = [
  { id: 'higher_tf',    label: 'Checked higher timeframe' },
  { id: 'news_clear',   label: 'Key news / events clear' },
  { id: 'trading_plan', label: 'Following my trading plan' },
  { id: 'risk_set',     label: 'Risk / position size set' },
] as const;

export type ManualItemId = (typeof MANUAL_ITEMS)[number]['id'];

type ManualChecks = Record<ManualItemId, boolean>;

const EMPTY_CHECKS: ManualChecks = {
  higher_tf: false,
  news_clear: false,
  trading_plan: false,
  risk_set: false,
};

interface Persisted {
  manualChecks: ManualChecks;
  // Symbol the current manualChecks were ticked for — a new symbol means a
  // new trade idea, so switching clears the checklist rather than carrying
  // stale ticks from a different setup over to it.
  lastSymbol: string | null;
}

const STORAGE_KEY = 'dsa-trade-checklist';

function loadInitial(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        manualChecks: { ...EMPTY_CHECKS, ...parsed.manualChecks },
        lastSymbol: parsed.lastSymbol ?? null,
      };
    }
  } catch { /* ignore malformed/blocked storage */ }
  return { manualChecks: { ...EMPTY_CHECKS }, lastSymbol: null };
}

function persist(state: Persisted) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

interface TradeChecklistState extends Persisted {
  setCheck: (id: ManualItemId, value: boolean) => void;
  /** Call with the active symbol on every render — no-ops unless the symbol
      actually changed, in which case it wipes all manual ticks. */
  syncSymbol: (symbol: string) => void;
}

export const useTradeChecklistStore = create<TradeChecklistState>((set, get) => ({
  ...loadInitial(),

  setCheck: (id, value) => {
    const manualChecks = { ...get().manualChecks, [id]: value };
    set({ manualChecks });
    persist({ manualChecks, lastSymbol: get().lastSymbol });
  },

  syncSymbol: (symbol) => {
    if (get().lastSymbol === symbol) return;
    const next: Persisted = { manualChecks: { ...EMPTY_CHECKS }, lastSymbol: symbol };
    set(next);
    persist(next);
  },
}));
