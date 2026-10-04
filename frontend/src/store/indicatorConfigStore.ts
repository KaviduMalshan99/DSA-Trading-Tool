import { create } from 'zustand';
import type { IndicatorKey } from './indicatorStore';
import { saveLocal } from '../services/persist';

/**
 * Per-indicator user settings (inputs + per-line style), persisted to
 * localStorage. Each indicator's slice is replaced (never mutated) on edit and
 * the others keep their identity, so a selector like `s => s.configs.ema`
 * only re-renders EMA when EMA's own settings change.
 */

export interface LineStyle {
  color: string;
  width: number;
  visible: boolean;
}

export interface IndicatorConfigs {
  ema:       { periods: number[]; lines: LineStyle[] };              // 4 lines
  bollinger: { period: number; mult: number; lines: LineStyle[] };   // middle, upper, lower
  rsi:       { period: number; maPeriod: number; lines: LineStyle[] }; // rsi, rsi-ma
  stochRsi:  { rsiLength: number; stochLength: number; kSmooth: number; dSmooth: number; lines: LineStyle[] }; // %K, %D
  macd:      { fast: number; slow: number; signal: number; lines: LineStyle[] }; // macd, signal
}

export type IndicatorConfigKey = keyof IndicatorConfigs & IndicatorKey;
/** Everything in a config except its line styles — what the Inputs tab edits. */
export type IndicatorParams<K extends IndicatorConfigKey> = Omit<IndicatorConfigs[K], 'lines'>;

const line = (color: string, width: number): LineStyle => ({ color, width, visible: true });

// Widths are integers to fit the 1-4px width picker (EMA 100 was 1.5, the
// oscillator lines 1.5 — rounded up to 2).
export const DEFAULT_CONFIGS: IndicatorConfigs = {
  ema: {
    periods: [20, 50, 100, 200],
    lines: [line('#f5c542', 1), line('#ff7043', 1), line('#26c6da', 2), line('#ec407a', 2)],
  },
  bollinger: {
    period: 20,
    mult: 2,
    lines: [line('#f5c542', 1), line('#26c6da', 1), line('#26c6da', 1)],
  },
  rsi: {
    period: 14,
    maPeriod: 14,
    lines: [line('#7e57c2', 2), line('#e3b341', 1)],
  },
  stochRsi: {
    rsiLength: 14,
    stochLength: 14,
    kSmooth: 3,
    dSmooth: 3,
    lines: [line('#2962ff', 2), line('#ff6d00', 2)],
  },
  macd: {
    fast: 12,
    slow: 26,
    signal: 9,
    lines: [line('#2962ff', 2), line('#ff6d00', 2)],
  },
};

const STORAGE_KEY = 'dsa-indicator-config';
const STORAGE_VERSION = 1;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function mergeLine(stored: unknown, def: LineStyle): LineStyle {
  if (!stored || typeof stored !== 'object') return def;
  const s = stored as Partial<Record<keyof LineStyle, unknown>>;
  return {
    color:   typeof s.color === 'string' ? s.color : def.color,
    width:   isNum(s.width) && s.width > 0 ? s.width : def.width,
    visible: typeof s.visible === 'boolean' ? s.visible : def.visible,
  };
}

/**
 * Overlays one stored indicator config on its default, field by field, using
 * the default's shape as the schema: numbers must be finite, number arrays and
 * `lines` must match the default's length. Anything else falls back to default.
 */
function mergeConfig<T extends object>(stored: unknown, def: T): T {
  if (!stored || typeof stored !== 'object') return def;
  const s = stored as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [field, defVal] of Object.entries(def)) {
    const v = s[field];
    if (field === 'lines') {
      const defLines = defVal as LineStyle[];
      out.lines = Array.isArray(v) && v.length === defLines.length
        ? defLines.map((d, i) => mergeLine(v[i], d))
        : defLines;
    } else if (Array.isArray(defVal)) {
      out[field] = Array.isArray(v) && v.length === defVal.length && v.every(isNum) ? v : defVal;
    } else if (typeof defVal === 'number') {
      out[field] = isNum(v) ? v : defVal;
    } else {
      out[field] = defVal;
    }
  }
  return out as T;
}

function loadInitial(): IndicatorConfigs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { v?: unknown; configs?: Record<string, unknown> } | null;
      if (parsed && parsed.v === STORAGE_VERSION && parsed.configs && typeof parsed.configs === 'object') {
        const stored = parsed.configs;
        return {
          ema:       mergeConfig(stored.ema,       DEFAULT_CONFIGS.ema),
          bollinger: mergeConfig(stored.bollinger, DEFAULT_CONFIGS.bollinger),
          rsi:       mergeConfig(stored.rsi,       DEFAULT_CONFIGS.rsi),
          stochRsi:  mergeConfig(stored.stochRsi,  DEFAULT_CONFIGS.stochRsi),
          macd:      mergeConfig(stored.macd,      DEFAULT_CONFIGS.macd),
        };
      }
    }
  } catch { /* ignore malformed/blocked storage */ }
  return DEFAULT_CONFIGS;
}

function persist(configs: IndicatorConfigs) {
  saveLocal(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, configs }));
}

interface IndicatorConfigState {
  configs: IndicatorConfigs;
  setParams: <K extends IndicatorConfigKey>(key: K, patch: Partial<IndicatorParams<K>>) => void;
  setLine: (key: IndicatorConfigKey, index: number, patch: Partial<LineStyle>) => void;
  resetIndicator: (key: IndicatorConfigKey) => void;
  /** Replaces one indicator's whole config — used by Cancel to restore a snapshot. */
  setConfig: <K extends IndicatorConfigKey>(key: K, cfg: IndicatorConfigs[K]) => void;
}

export const useIndicatorConfigStore = create<IndicatorConfigState>((set, get) => {
  // Swap in a new slice for `key`; every other slice keeps its identity.
  const update = <K extends IndicatorConfigKey>(key: K, next: IndicatorConfigs[K]) => {
    const configs = { ...get().configs, [key]: next };
    set({ configs });
    persist(configs);
  };

  return {
    configs: loadInitial(),

    setParams: (key, patch) => update(key, { ...get().configs[key], ...patch }),

    setLine: (key, index, patch) => {
      const cfg = get().configs[key];
      if (index < 0 || index >= cfg.lines.length) return;
      const lines = cfg.lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
      update(key, { ...cfg, lines });
    },

    resetIndicator: (key) => update(key, DEFAULT_CONFIGS[key]),

    setConfig: (key, cfg) => update(key, cfg),
  };
});
