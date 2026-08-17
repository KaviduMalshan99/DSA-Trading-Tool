import { create } from 'zustand';

// Only balance/risk% persist across sessions (they rarely change trade-to-trade).
// Entry/stop/target/direction are always per-trade and reset each time the
// calculator opens, so they intentionally live in component state instead.

interface PositionCalcPersisted {
  accountBalance: number;
  riskPercent: number;
}

const DEFAULTS: PositionCalcPersisted = {
  accountBalance: 10000,
  riskPercent: 1,
};

const STORAGE_KEY = 'dsa-position-calc';

function loadInitial(): PositionCalcPersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore malformed/blocked storage */ }
  return DEFAULTS;
}

interface PositionCalcState extends PositionCalcPersisted {
  setPersisted: (patch: Partial<PositionCalcPersisted>) => void;
}

export const usePositionCalcStore = create<PositionCalcState>((set, get) => ({
  ...loadInitial(),

  setPersisted: (patch) => {
    set(patch);
    const { accountBalance, riskPercent } = get();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ accountBalance, riskPercent })); } catch { /* ignore */ }
  },
}));
