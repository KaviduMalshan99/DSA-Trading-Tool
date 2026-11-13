import { create } from 'zustand';
import { saveLocal } from '../services/persist';

interface AlertBase {
  id: string;
  symbol: string;
  enabled: boolean;
  // false (default) = one-shot: fires once, then auto-disables (enabled -> false).
  // true = re-arm: stays enabled and can fire again once the condition
  // resets (price crosses back, then re-crosses).
  rearm: boolean;
  triggered: boolean;
  lastFiredAt: number | null;
  createdAt: number;
}

export interface PriceAlert extends AlertBase {
  type: 'price';
  direction: 'above' | 'below';
  targetPrice: number;
}

export type Alert = PriceAlert;

// Everything the caller supplies: the type-specific fields, plus rearm (the
// caller's choice) — id/symbol/enabled/triggered/lastFiredAt/createdAt are
// always generated here.
type Generated = 'id' | 'symbol' | 'enabled' | 'triggered' | 'lastFiredAt' | 'createdAt';
export type NewAlertInput = Omit<PriceAlert, Generated>;

interface Persisted {
  alerts: Alert[];
  soundEnabled: boolean;
}

const STORAGE_KEY = 'dsa-alerts';

function isPriceAlert(a: unknown): a is PriceAlert {
  return !!a && typeof a === 'object' && (a as { type?: unknown }).type === 'price';
}

function loadInitial(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Only price alerts exist now. Older saves (and account-sync data, which
      // lands in localStorage before a reload) may still hold whale / delta /
      // absorption / level alerts — drop them here.
      const alerts: Alert[] = Array.isArray(parsed.alerts)
        ? parsed.alerts.filter((a: unknown) => isPriceAlert(a))
        : [];
      return { alerts, soundEnabled: !!parsed.soundEnabled };
    }
  } catch { /* ignore malformed/blocked storage */ }
  return { alerts: [], soundEnabled: false };
}

function persist(state: Persisted) {
  saveLocal(STORAGE_KEY, JSON.stringify(state));
}

interface AlertsState extends Persisted {
  addAlert: (symbol: string, input: NewAlertInput) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  /** Called by the engine after a one-shot alert fires: auto-disables it. */
  disableAfterFire: (id: string) => void;
  /** Called by the engine after any alert fires: records lastFiredAt/triggered for display. */
  markFired: (id: string) => void;
  setSoundEnabled: (v: boolean) => void;
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  ...loadInitial(),

  addAlert: (symbol, input) => {
    const base: AlertBase = {
      id: crypto.randomUUID(),
      symbol,
      enabled: true,
      rearm: input.rearm,
      triggered: false,
      lastFiredAt: null,
      createdAt: Date.now(),
    };
    const alert = { ...base, ...input } as Alert;
    const alerts = [alert, ...get().alerts];
    set({ alerts });
    persist({ alerts, soundEnabled: get().soundEnabled });
  },

  removeAlert: (id) => {
    const alerts = get().alerts.filter((a) => a.id !== id);
    set({ alerts });
    persist({ alerts, soundEnabled: get().soundEnabled });
  },

  toggleAlert: (id) => {
    const alerts = get().alerts.map((a) => {
      if (a.id !== id) return a;
      const nextEnabled = !a.enabled;
      // Turning an alert back on is a fresh start — clears its "already fired" state.
      return { ...a, enabled: nextEnabled, triggered: nextEnabled ? false : a.triggered };
    });
    set({ alerts });
    persist({ alerts, soundEnabled: get().soundEnabled });
  },

  disableAfterFire: (id) => {
    const alerts = get().alerts.map((a) =>
      a.id === id ? { ...a, enabled: false, triggered: true, lastFiredAt: Date.now() } : a
    );
    set({ alerts });
    persist({ alerts, soundEnabled: get().soundEnabled });
  },

  markFired: (id) => {
    const alerts = get().alerts.map((a) =>
      a.id === id ? { ...a, triggered: true, lastFiredAt: Date.now() } : a
    );
    set({ alerts });
    persist({ alerts, soundEnabled: get().soundEnabled });
  },

  setSoundEnabled: (v) => {
    set({ soundEnabled: v });
    persist({ alerts: get().alerts, soundEnabled: v });
  },
}));
