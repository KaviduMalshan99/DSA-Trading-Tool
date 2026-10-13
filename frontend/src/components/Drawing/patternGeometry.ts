// Pure math for the XABCD / ABCD harmonic patterns: dashed-diagonal ratios
// and peak/trough letter placement. No chart/series access here, so the
// geometry stays unit-testable. Points are indexed by their position in the
// stored points[] (X=0, A=1, ... for XABCD; A=0, B=1, ... for ABCD).

import type { PatternType } from '../../store/drawingStore';

export interface PatternDiagonal {
  /** diagonal endpoints (point indices) */
  from: number;
  to: number;
  /** ratio = |price[num[1]] - price[num[0]]| / |price[den[1]] - price[den[0]]| */
  num: [number, number];
  den: [number, number];
}

// TradingView-style dashed diagonals with their ratio labels.
export const PATTERN_DIAGONALS: Partial<Record<PatternType, PatternDiagonal[]>> = {
  xabcd: [
    { from: 0, to: 2, num: [1, 2], den: [0, 1] }, // X-B: AB/XA
    { from: 1, to: 3, num: [2, 3], den: [1, 2] }, // A-C: BC/AB
    { from: 2, to: 4, num: [3, 4], den: [2, 3] }, // B-D: CD/BC
    { from: 0, to: 4, num: [1, 4], den: [0, 1] }, // X-D: AD/XA
  ],
  abcd: [
    { from: 0, to: 2, num: [1, 2], den: [0, 1] }, // A-C: BC/AB
    { from: 1, to: 3, num: [2, 3], den: [1, 2] }, // B-D: CD/BC
  ],
};

// Filled triangles (xabcd only): X-A-B and B-C-D.
export const PATTERN_FILL_TRIANGLES: Partial<Record<PatternType, [number, number, number][]>> = {
  xabcd: [[0, 1, 2], [2, 3, 4]],
};

/** Price-space ratio for a diagonal, or null when a point is missing or the
 *  denominator leg is zero (never NaN/Infinity). */
export function diagonalRatio(prices: readonly number[], diag: PatternDiagonal): number | null {
  const idx = [...diag.num, ...diag.den];
  if (idx.some((i) => i >= prices.length || !Number.isFinite(prices[i]))) return null;
  const den = Math.abs(prices[diag.den[1]] - prices[diag.den[0]]);
  if (den === 0) return null;
  const r = Math.abs(prices[diag.num[1]] - prices[diag.num[0]]) / den;
  return Number.isFinite(r) ? r : null;
}

export function formatRatio(r: number): string {
  return r.toFixed(3);
}

/** 'above' when point i is a peak (price higher than every existing
 *  neighbor — the only neighbor for end points), otherwise 'below'. */
export function letterSide(prices: readonly number[], i: number): 'above' | 'below' {
  const p = prices[i];
  const neighbors: number[] = [];
  if (i > 0) neighbors.push(prices[i - 1]);
  if (i < prices.length - 1) neighbors.push(prices[i + 1]);
  if (neighbors.length === 0) return 'above';
  return neighbors.every((n) => p > n) ? 'above' : 'below';
}
