// Pure fib level tables + math, shared by DrawingCanvas (render/hitTest), the
// Fib settings modal and tests. No React/store runtime imports — types only.
import type { FibTool, FibLevelConfig, FibDisplayOptions, FibLikeDrawing } from '../../store/drawingStore';

// ── Legacy ratio tables ──────────────────────────────────────────────────────
// A drawing WITHOUT a `levels` array renders its type's table below. These are
// frozen: changing them would change how every such saved drawing looks.

export const FIB_LEVELS = [
  { pct: 0,     color: '#787B86', label: '0' },
  { pct: 0.236, color: '#F23645', label: '0.236' },
  { pct: 0.382, color: '#FF9800', label: '0.382' },
  { pct: 0.500, color: '#4CAF50', label: '0.5' },
  { pct: 0.618, color: '#2196F3', label: '0.618' },
  { pct: 0.786, color: '#9C27B0', label: '0.786' },
  { pct: 1.618, color: '#00BCD4', label: '1.618' },
] as const;

// Fib Extension's ratio table — the render loop iterates whichever level
// array `fibLevelsFor` resolves to with no clamping, so these extension
// ratios (beyond the 0..1 retracement range) just work.
export const FIB_EXTENSION_LEVELS = [
  { pct: 0,     color: '#787B86', label: '0' },
  { pct: 0.618, color: '#2196F3', label: '0.618' },
  { pct: 1.0,   color: '#787B86', label: '1.0' },
  { pct: 1.272, color: '#FF9800', label: '1.272' },
  { pct: 1.618, color: '#00BCD4', label: '1.618' },
  { pct: 2.0,   color: '#F23645', label: '2.0' },
  { pct: 2.618, color: '#9C27B0', label: '2.618' },
] as const;

// Trend-based Fib Extension's ratio table — projected forward from the
// origin (click C) by the A->B move, see the 'trendFibExtension' render
// branch in DrawingCanvas.tsx.
export const FIB_TREND_EXT_LEVELS = [
  { pct: 0,     color: '#787B86', label: '0' },
  { pct: 0.382, color: '#FF9800', label: '0.382' },
  { pct: 0.618, color: '#2196F3', label: '0.618' },
  { pct: 1.0,   color: '#787B86', label: '1.0' },
  { pct: 1.272, color: '#FF9800', label: '1.272' },
  { pct: 1.618, color: '#00BCD4', label: '1.618' },
  { pct: 2.618, color: '#9C27B0', label: '2.618' },
] as const;

// Fib Channel's ratio table — 0 is the baseline, 1 is the fully-offset
// parallel line, and every ratio in between is the baseline shifted by that
// fraction of the channel width (see the 'fibChannel' render branch).
export const FIB_CHANNEL_LEVELS = [
  { pct: 0,     color: '#787B86', label: '0' },
  { pct: 0.236, color: '#F23645', label: '0.236' },
  { pct: 0.382, color: '#FF9800', label: '0.382' },
  { pct: 0.500, color: '#4CAF50', label: '0.5' },
  { pct: 0.618, color: '#2196F3', label: '0.618' },
  { pct: 0.786, color: '#9C27B0', label: '0.786' },
  { pct: 1.0,   color: '#787B86', label: '1.0' },
] as const;

// Every fib-family tool shares one drawing/render/hitTest pattern per shape —
// only which ratio table they read differs. This is each type's LEGACY table:
// what a drawing without its own `levels` array renders.
export function fibLevelsFor(type: FibTool) {
  switch (type) {
    case 'fibExtension': return FIB_EXTENSION_LEVELS;
    case 'trendFibExtension': return FIB_TREND_EXT_LEVELS;
    case 'fibChannel': return FIB_CHANNEL_LEVELS;
    default: return FIB_LEVELS;
  }
}

// ── TradingView level table (new drawings) ───────────────────────────────────
// Written onto every NEW Fib Retracement / Trend-Based Fib Extension as an
// explicit `levels` array at creation, so this table can change later without
// touching saved drawings. Values that already had a color keep it; the rest
// are mid-tone hues that read on both the light and dark chart backgrounds.
export const FIB_TV_LEVELS: readonly FibLevelConfig[] = [
  { pct: 0,     enabled: true,  color: '#787B86' },
  { pct: 0.236, enabled: true,  color: '#F23645' },
  { pct: 0.382, enabled: true,  color: '#FF9800' },
  { pct: 0.5,   enabled: true,  color: '#4CAF50' },
  { pct: 0.618, enabled: true,  color: '#2196F3' },
  { pct: 0.786, enabled: true,  color: '#9C27B0' },
  { pct: 1,     enabled: true,  color: '#607D8B' },
  { pct: 1.618, enabled: true,  color: '#00BCD4' },
  { pct: 2.618, enabled: true,  color: '#E91E63' },
  { pct: 3.618, enabled: true,  color: '#C2185B' },
  { pct: 4.236, enabled: true,  color: '#FFA000' },
  { pct: 1.272, enabled: false, color: '#FF5722' },
  { pct: 1.414, enabled: false, color: '#8D6E63' },
  { pct: 2,     enabled: false, color: '#3F51B5' },
  { pct: 2.272, enabled: false, color: '#009688' },
  { pct: 2.414, enabled: false, color: '#689F38' },
  { pct: 3,     enabled: false, color: '#673AB7' },
  { pct: 3.272, enabled: false, color: '#AFB42B' },
  { pct: 3.414, enabled: false, color: '#F06292' },
  { pct: 4,     enabled: false, color: '#26A69A' },
  { pct: 4.272, enabled: false, color: '#7E57C2' },
  { pct: 4.414, enabled: false, color: '#A1887F' },
  { pct: 4.618, enabled: false, color: '#EF5350' },
  { pct: 4.764, enabled: false, color: '#29B6F6' },
];

/** A fresh copy of the TradingView table for a new drawing's `levels`. */
export function newFibLevels(): FibLevelConfig[] {
  return FIB_TV_LEVELS.map((l) => ({ ...l }));
}

/** The level rows a drawing renders: its own `levels` array as-is (it is
 * self-describing — never aligned to a default table by index), else a copy
 * of its type's legacy table. The modal's ensureLevels writes this back on
 * first edit, so an old drawing keeps exactly the rows it showed before. */
export function resolveFibLevels(d: Pick<FibLikeDrawing, 'type' | 'levels'>): FibLevelConfig[] {
  if (d.levels) return d.levels.map((l) => ({ ...l }));
  return fibLevelsFor(d.type).map((l) => ({ enabled: true, pct: l.pct, color: l.color }));
}

export interface FibLevelPoint {
  /** the configured ratio (what the label shows) */
  pct: number;
  color: string;
  /** where the line sits, after `reverse` */
  price: number;
}

/** Enabled levels with their positioned prices. `priceAt` maps a positioning
 * ratio to a price (retracement: high - r*range, trend-based: C + r*move);
 * `reverse` positions at 1 - pct while the label keeps pct. */
export function fibLevelPoints(
  d: Pick<FibLikeDrawing, 'type' | 'levels'> & Pick<FibDisplayOptions, 'reverse'>,
  priceAt: (r: number) => number,
): FibLevelPoint[] {
  const reverse = d.reverse ?? false;
  const out: FibLevelPoint[] = [];
  for (const l of resolveFibLevels(d)) {
    if (l.enabled === false || !Number.isFinite(l.pct)) continue;
    out.push({ pct: l.pct, color: l.color ?? '#787B86', price: priceAt(reverse ? 1 - l.pct : l.pct) });
  }
  return out;
}

/** Decimals for level prices: the series' own price-format precision when it
 * has one (else derived from its minMove), otherwise sized off the price
 * magnitude so sub-cent coins don't collapse to "0.00". */
export function fibPriceDecimals(
  priceFormat: { precision?: number; minMove?: number } | undefined,
  samplePrice: number,
): number {
  const p = priceFormat?.precision;
  if (p != null && Number.isInteger(p) && p >= 0 && p <= 15) return p;
  const mm = priceFormat?.minMove;
  if (mm != null && mm > 0 && mm < 1) return Math.min(15, Math.max(0, Math.ceil(-Math.log10(mm) - 1e-9)));
  const abs = Math.abs(samplePrice);
  if (!Number.isFinite(abs) || abs === 0 || abs >= 1) return 2;
  return Math.max(2, -Math.floor(Math.log10(abs)) + 2);
}

/** TradingView-style label: "0.618 (86,190.00)", "61.8% (86,190.00)",
 * "0.618", "86,190.00", or "" when both parts are off. */
export function fibLabelText(
  d: Pick<FibDisplayOptions, 'showLevels' | 'showPrices' | 'levelsAs'>,
  pct: number,
  price: number,
  decimals: number,
): string {
  const showLevels = d.showLevels ?? true;
  const showPrices = d.showPrices ?? true;
  const level = (d.levelsAs ?? 'values') === 'percent'
    ? `${parseFloat((pct * 100).toFixed(4))}%`
    : `${pct}`;
  const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (showLevels && showPrices) return `${level} (${priceStr})`;
  if (showLevels) return level;
  if (showPrices) return priceStr;
  return '';
}
