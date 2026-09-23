import { useEffect, useRef, useCallback, useState, memo } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useDrawingStore, type Drawing, type DrawingTool, type FibTool, type PatternType } from '../../store/drawingStore';
import { useMarketStore } from '../../store/marketStore';
import { toChartTimeSeconds } from '../../utils/chartTime';
import { computeSessionVWAPFromCandles } from '../../utils/klineAnalytics';
import { decimalsForPrice } from '../../utils/priceFormat';
import type { Candle } from '../../types/market';

// Tools that should own mouse events on the overlay canvas (blocking chart
// pan/zoom underneath). Cursor-group tools (cross/dot/arrow/demonstration/eraser)
// deliberately do NOT capture, so the chart stays pannable by default.
const CAPTURE_TOOLS = new Set<DrawingTool>([
  'trendline', 'ray', 'extendedLine', 'infoLine', 'trendAngle',
  'hline', 'hray', 'vline', 'crossline', 'rectangle', 'fibonacci', 'fibExtension',
  'trendFibExtension', 'fibChannel', 'channel', 'regression',
  'flatChannel', 'disjointChannel', 'eraser',
  'rotatedRectangle', 'circle', 'ellipse', 'path', 'polyline',
  'triangle', 'arc', 'curve', 'doubleCurve',
  'arrowMarker', 'arrowTool', 'arrowMarkUp', 'arrowMarkDown', 'brush', 'highlighter',
  'text', 'priceNote', 'pin', 'flagMark', 'priceLabel', 'signpost', 'note', 'callout', 'comment', 'measure', 'zoomIn',
  'longPosition', 'shortPosition', 'anchoredVwap', 'priceRange', 'dateRange', 'datePriceRange', 'sector',
  'positionForecast',
  'gannFan', 'gannBox', 'gannSquare',
  'abcd', 'xabcd', 'cypher', 'threeDrives', 'headShoulders',
  'cyclicLines', 'timeCycles', 'sineLine', 'fibTimeZone', 'fibSpeedFan', 'fibCircles', 'fibSpeedArcs',
  'fibWedge',
]);

// Number of clicks each drawing tool needs before it's finalized. Horizontal
// Line/Ray and Vertical Line only need one point; Parallel Channel and Rotated
// Rectangle need a third click. Path and Brush aren't listed here — they use a
// variable-length point list instead (see freeformRef) rather than a fixed count.
// Text/Price Note place on a single click (then open for inline editing);
// Measure/Zoom In are two-click drags like Trend Line, but neither persists a
// Drawing — Measure just shows a stats readout, Zoom In zooms and reverts.
const CLICKS_REQUIRED: Partial<Record<DrawingTool, number>> = {
  trendline: 2,
  ray: 2,
  extendedLine: 2,
  infoLine: 2,
  trendAngle: 2,
  hline: 1,
  hray: 1,
  vline: 1,
  crossline: 1,
  rectangle: 2,
  fibonacci: 2,
  fibExtension: 2,
  trendFibExtension: 3,
  fibChannel: 3,
  channel: 3,
  regression: 2,
  flatChannel: 3,
  disjointChannel: 4,
  rotatedRectangle: 3,
  circle: 2,
  ellipse: 2,
  triangle: 3,
  sector: 3,
  fibWedge: 3,
  positionForecast: 3,
  arc: 3,
  curve: 3,
  doubleCurve: 3,
  arrowTool: 2,
  arrowMarker: 2,
  arrowMarkUp: 1,
  arrowMarkDown: 1,
  text: 1,
  priceNote: 2,
  pin: 1,
  flagMark: 1,
  priceLabel: 1,
  signpost: 1,
  note: 1,
  callout: 1,
  comment: 1,
  measure: 2,
  zoomIn: 2,
  longPosition: 1,
  shortPosition: 1,
  anchoredVwap: 1,
  priceRange: 2,
  dateRange: 2,
  datePriceRange: 2,
  gannFan: 2,
  gannBox: 2,
  gannSquare: 2,
  abcd: 4,
  xabcd: 5,
  cypher: 5,
  headShoulders: 5,
  threeDrives: 6,
  cyclicLines: 2,
  timeCycles: 2,
  sineLine: 2,
  fibTimeZone: 2,
  fibSpeedFan: 2,
  fibCircles: 2,
  fibSpeedArcs: 2,
};

// Point-count and per-point letter labels for the Patterns group's connected-
// line tools — resolves both CLICKS_REQUIRED's count and the render branch's
// label set from one place. Head & Shoulders' troughs (indices 1/3) are
// labeled lightly (see the render branch) so they're left as '' here rather
// than given a letter.
const PATTERN_POINT_LABELS: Record<PatternType, string[]> = {
  abcd: ['A', 'B', 'C', 'D'],
  xabcd: ['X', 'A', 'B', 'C', 'D'],
  cypher: ['X', 'A', 'B', 'C', 'D'],
  threeDrives: ['1', '2', '3', '4', '5', '6'],
  headShoulders: ['LS', '', 'H', '', 'RS'],
};

const DOT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#111827"/><circle cx="12" cy="12" r="2.5" fill="#ffffff"/></svg>')}" ) 12 12, pointer`;

const CURSOR_STYLE: Record<string, string> = {
  cross: 'crosshair',
  dot: DOT_CURSOR,
  arrow: 'default',
  demonstration: 'default',
  eraser: 'not-allowed',
};

type LWTime = import('lightweight-charts').Time;

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
// branch below.
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
// fraction of the channel width (see the 'fibChannel' render branch below).
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
// only which ratio table they read differs. Every FIB_LEVELS read that must
// also serve the other fib tools goes through this helper instead of a
// constant directly, so Fib Retracement/Extension's own resolution never changes.
export function fibLevelsFor(type: FibTool) {
  switch (type) {
    case 'fibExtension': return FIB_EXTENSION_LEVELS;
    case 'trendFibExtension': return FIB_TREND_EXT_LEVELS;
    case 'fibChannel': return FIB_CHANNEL_LEVELS;
    default: return FIB_LEVELS;
  }
}

// Draws one fib level: a horizontal line from spanLeft to spanRight at `y`,
// plus its "${label} ${price}" text label — factored out of the Fib
// Retracement/Extension render loop below so Trend-based Fib Extension's
// projected levels can draw with the exact same line+label code.
function drawFibLevelLine(
  ctx: CanvasRenderingContext2D,
  color: string,
  y: number,
  spanLeft: number,
  spanRight: number,
  width: number,
  dash: number[],
  alpha: number,
  label: string,
  labelX: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(spanLeft, y);
  ctx.lineTo(spanRight, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = color;
  ctx.font = '10px monospace';
  ctx.fillText(label, labelX, y - 3);
}

// Fib Speed/Resistance Fan's ray ratios — shared by the render branch and
// hitTest so the two can't drift. Deliberately NOT a fibLevelsFor table:
// the fan has no `levels`/settings modal, each ratio is just a ray. Each
// ratio's label is String(r) ("0", "0.382", "0.5", "0.618", "1").
const FIB_FAN_RATIOS = [0, 0.382, 0.5, 0.618, 1];

// Fib Circles' ring ratios (multiples of the center→edge base radius) —
// shared by the render branch and hitTest so the two can't drift.
// Deliberately NOT a fibLevelsFor table: like the fan, there's no
// `levels`/settings modal, each ratio is just a ring labeled String(r).
const FIB_CIRCLE_RATIOS = [0.236, 0.382, 0.5, 0.618, 1, 1.618, 2.618];

// Fib Speed/Resistance Arcs' semicircle ratios (multiples of the
// origin→end base radius) — shared by the render branch and hitTest so the
// two can't drift. NOT a fibLevelsFor table, and deliberately not
// FIB_CIRCLE_RATIOS (its 1.618/2.618 arcs would dominate the drawing).
const FIB_ARC_RATIOS = [0.382, 0.5, 0.618, 1];

// Fib Wedge's arc ratios (multiples of the apex→edge-A base radius) — shared
// by the render branch and hitTest so the two can't drift. NOT a fibLevelsFor
// table, and deliberately not FIB_CIRCLE_RATIOS (arcs past r=1 would overrun
// the wedge's edges).
const FIB_WEDGE_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786, 1];

// Shared ratio set for Gann Box/Square grid divisions.
const GANN_GRID_RATIOS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1.0];

// Strokes an arbitrary line from (x1,y1) to (x2,y2) with an optional label —
// the Gann Box/Square counterpart to drawFibLevelLine above, generalized to
// non-horizontal lines (vertical grid divisions, diagonal fans) since a fixed
// y/spanLeft/spanRight signature can't express those.
function drawGannGridLine(
  ctx: CanvasRenderingContext2D,
  color: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  dash: number[],
  alpha: number,
  label?: string,
  labelX?: number,
  labelY?: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (label != null && labelX != null && labelY != null) {
    ctx.fillStyle = color;
    ctx.font = '9px monospace';
    ctx.fillText(label, labelX, labelY);
  }
}

interface Props {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

// ── coordinate helpers ────────────────────────────────────────────────────────

type LWLogical = import('lightweight-charts').Logical;

// Mirrors the latest candle list at module scope (kept in sync by the main
// component alongside candlesRef) purely so timeToX/xToTime below can
// extrapolate without every one of their ~70 call sites having to thread a
// `candles` argument through.
let latestCandlesForExtrapolation: Candle[] = [];

// Bar spacing in seconds, inferred from the last two loaded candles.
function estimateBarIntervalSec(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const interval = toChartTimeSeconds(last.t) - toChartTimeSeconds(prev.t);
  return interval > 0 ? interval : null;
}

// Long/Short Position default box placed on a single click — 20 bars wide,
// target/stop offset by a fixed *pixel* distance from the entry (2:1
// reward:risk), not a percentage of price. A %-of-price offset (e.g. "2% of
// entry") can land hundreds of pixels off-screen once you account for how
// tightly the chart is zoomed (a narrow visible price range makes even a
// small % swing span many chart-heights) — pixels stay sane at any zoom level
// or asset price. Both are adjustable afterward by dragging the target/stop
// lines or the right edge.
function defaultPositionBox(
  tool: 'longPosition' | 'shortPosition',
  entryPrice: number, entryTime: number, entryY: number,
  series: ISeriesApi<'Candlestick'>,
  candles: Candle[],
): { entryPrice: number; targetPrice: number; stopPrice: number; time1: number; time2: number } | null {
  const barSec = estimateBarIntervalSec(candles) ?? 60;
  const time2 = entryTime + barSec * 20;
  const profitPx = 80, lossPx = 40;
  const targetY = tool === 'longPosition' ? entryY - profitPx : entryY + profitPx;
  const stopY   = tool === 'longPosition' ? entryY + lossPx   : entryY - lossPx;
  const targetPrice = yToPrice(series, targetY);
  const stopPrice   = yToPrice(series, stopY);
  if (targetPrice == null || stopPrice == null) return null;
  return { entryPrice, targetPrice, stopPrice, time1: entryTime, time2 };
}

export function priceToY(series: ISeriesApi<'Candlestick'>, price: number): number | null {
  const c = series.priceToCoordinate(price);
  return c == null ? null : (c as unknown as number);
}

// `coordinateToTime`/`timeToCoordinate` only resolve points that overlap an
// actual plotted bar — a click (or a stored anchor) in the empty margin past
// the last candle, or before the first, returns null even though TradingView
// happily lets you anchor tools (Text, Price Note, price lines, …) there. Both
// helpers fall back to extrapolating from the nearest edge bar using the
// inferred bar interval, via the logical (bar-index) coordinate space, which
// stays well-defined outside the plotted range.
export function timeToX(chart: IChartApi, t: number): number | null {
  const c = chart.timeScale().timeToCoordinate(t as unknown as LWTime);
  if (c != null) return c as unknown as number;

  const candles = latestCandlesForExtrapolation;
  const interval = estimateBarIntervalSec(candles);
  if (interval == null) return null;
  const lastIdx = candles.length - 1;
  const lastTime = toChartTimeSeconds(candles[lastIdx].t);
  const firstTime = toChartTimeSeconds(candles[0].t);
  const anchorIdx  = t > lastTime ? lastIdx : 0;
  const anchorTime = t > lastTime ? lastTime : firstTime;
  const logical = anchorIdx + (t - anchorTime) / interval;
  const lc = chart.timeScale().logicalToCoordinate(logical as unknown as LWLogical);
  return lc == null ? null : (lc as unknown as number);
}

// `opacityPct` is 0–100 (matches the style toolbar's slider), not the 0–1 canvas alpha.
function hexToRgba(hex: string, opacityPct: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, opacityPct)) / 100})`;
}

function yToPrice(series: ISeriesApi<'Candlestick'>, y: number): number | null {
  const p = series.coordinateToPrice(y);
  return p == null ? null : (p as unknown as number);
}

function xToTime(chart: IChartApi, x: number): number | null {
  const t = chart.timeScale().coordinateToTime(x);
  if (t != null) return t as unknown as number;

  const candles = latestCandlesForExtrapolation;
  const logical = chart.timeScale().coordinateToLogical(x);
  const interval = estimateBarIntervalSec(candles);
  if (logical == null || interval == null) return null;
  const lastIdx = candles.length - 1;
  const anchorIdx = logical > lastIdx ? lastIdx : 0;
  const anchorTime = toChartTimeSeconds(candles[anchorIdx].t);
  return Math.round(anchorTime + (logical - anchorIdx) * interval);
}

function fmtTime(timeSec: number): string {
  const d = new Date(timeSec * 1000);
  return d.toLocaleString('en-US', {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// ── linear regression (least squares over bar index, not raw timestamp, so
// weekend/session gaps don't skew the slope) + a ±2σ deviation channel ───────

interface RegressionResult {
  startTime: number; endTime: number;
  midStart: number; midEnd: number;
  upperStart: number; upperEnd: number;
  lowerStart: number; lowerEnd: number;
}

function computeRegression(candles: Candle[], time1: number, time2: number): RegressionResult | null {
  const lo = Math.min(time1, time2), hi = Math.max(time1, time2);
  const subset = candles
    .map((c) => ({ t: toChartTimeSeconds(c.t), c: c.c }))
    .filter((c) => c.t >= lo && c.t <= hi)
    .sort((a, b) => a.t - b.t);
  if (subset.length < 2) return null;

  const n = subset.length;
  const meanX = (n - 1) / 2;
  const meanY = subset.reduce((sum, c) => sum + c.c, 0) / n;

  let num = 0, den = 0;
  subset.forEach((c, i) => { num += (i - meanX) * (c.c - meanY); den += (i - meanX) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const regAt = (i: number) => intercept + slope * i;

  const sumSq = subset.reduce((sum, c, i) => sum + (c.c - regAt(i)) ** 2, 0);
  const stddev = Math.sqrt(sumSq / n);

  const midStart = regAt(0), midEnd = regAt(n - 1);
  return {
    startTime: subset[0].t, endTime: subset[n - 1].t,
    midStart, midEnd,
    upperStart: midStart + 2 * stddev, upperEnd: midEnd + 2 * stddev,
    lowerStart: midStart - 2 * stddev, lowerEnd: midEnd - 2 * stddev,
  };
}

// ── Anchored VWAP: derived from live candle data at render time (like
// Regression above), not stored — so it auto-extends as new candles stream
// in. `d.time` is chart-time seconds (shifted, see toChartTimeSeconds), but
// computeSessionVWAPFromCandles compares its sessionStart directly against
// each candle's own RAW epoch-ms `c.t` — so the anchor is resolved to the
// nearest candle's raw `c.t` first, rather than passing d.time through
// directly (which would silently compare shifted seconds against raw ms).
function computeAnchoredVwapData(d: Extract<Drawing, { type: 'anchoredVwap' }>, candles: Candle[]) {
  if (candles.length === 0) return null;
  let nearest = candles[0];
  let bestDiff = Math.abs(toChartTimeSeconds(nearest.t) - d.time);
  for (const c of candles) {
    const diff = Math.abs(toChartTimeSeconds(c.t) - d.time);
    if (diff < bestDiff) { bestDiff = diff; nearest = c; }
  }
  const decimals = decimalsForPrice(candles[candles.length - 1].c);
  return computeSessionVWAPFromCandles(candles, decimals, nearest.t);
}

// ── Measure tool: a transient (non-persisted) stats readout between two
// clicked anchor points — price change, % change, elapsed time, bar count ────

interface MeasureStats { priceDiff: number; pricePct: number; timeDiffSec: number; bars: number }

function computeMeasureStats(price1: number, time1: number, price2: number, time2: number, candles: Candle[]): MeasureStats {
  const priceDiff = price2 - price1;
  const pricePct = price1 !== 0 ? (priceDiff / price1) * 100 : 0;
  const timeDiffSec = Math.abs(time2 - time1);
  const lo = Math.min(time1, time2), hi = Math.max(time1, time2);
  const bars = candles.filter((c) => { const t = toChartTimeSeconds(c.t); return t >= lo && t <= hi; }).length;
  return { priceDiff, pricePct, timeDiffSec, bars };
}

// Rounded dark label bubble shared by Price Range / Date Range — `y` is the
// bubble's top edge, horizontally centered on `cx`.
function drawRangeLabel(ctx: CanvasRenderingContext2D, cx: number, y: number, text: string | string[]) {
  const lines = Array.isArray(text) ? text : [text];
  ctx.font = 'bold 12px sans-serif';
  const padX = 8, lineH = 16;
  const h = lines.length > 1 ? lines.length * lineH + 6 : 22;
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const w = textW + padX * 2;
  const x = cx - w / 2;
  const r = 4;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = '#131722';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#d1d4dc';
  ctx.textBaseline = 'middle';
  if (lines.length > 1) {
    lines.forEach((line, i) => {
      ctx.fillText(line, x + padX, y + 3 + lineH * (i + 0.5) + 1);
    });
  } else {
    ctx.fillText(lines[0], x + padX, y + h / 2 + 1);
  }
  ctx.textBaseline = 'alphabetic';
}

// Solid arrowhead triangle at (tipX, tipY), pointing along `angle` (radians).
function drawArrowhead(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, angle: number, size = 8) {
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - size * Math.cos(angle - Math.PI / 6), tipY - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(tipX - size * Math.cos(angle + Math.PI / 6), tipY - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function renderMeasureBox(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  x1: number, y1: number, x2: number, y2: number,
  price1: number, time1: number, price2: number, time2: number,
  candles: Candle[],
) {
  const stats = computeMeasureStats(price1, time1, price2, time2, candles);
  const up = stats.priceDiff >= 0;
  const boxColor = up ? '#089981' : '#F23645';

  ctx.save();
  const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
  ctx.fillStyle = hexToRgba(boxColor, 12);
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeStyle = hexToRgba(boxColor, 60);
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.setLineDash([]);

  ctx.strokeStyle = boxColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const priceStr = `${up ? '+' : ''}${stats.priceDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}  (${up ? '+' : ''}${stats.pricePct.toFixed(2)}%)`;
  const days = stats.timeDiffSec / 86400;
  const timeStr = days >= 1 ? `${days.toFixed(1)}d` : `${Math.round(stats.timeDiffSec / 60)}m`;
  const barsStr = `${stats.bars} bar${stats.bars === 1 ? '' : 's'}, ${timeStr}`;
  const lines = [priceStr, barsStr];

  ctx.font = 'bold 12px sans-serif';
  const widths = lines.map((l) => ctx.measureText(l).width);
  const boxW = Math.max(...widths) + 16;
  const boxH = lines.length * 16 + 10;
  const bx = Math.min(x2 + 12, W - boxW - 4);
  const by = Math.max(4, Math.min(y2 - boxH / 2, H - boxH - 4));

  ctx.fillStyle = boxColor;
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, bx + 8, by + 6 + i * 16));
  ctx.restore();
}

// Extends the infinite line through (x1,y1)-(x2,y2) to the canvas rect's
// edges. Returns both boundary crossings as (ax,ay) [the one behind p1, i.e.
// smaller parametric t] and (bx,by) [the one beyond p2, i.e. larger t] — Ray
// uses only the (bx,by) forward point (starting from p1 itself); Extended
// Line uses both. Returns null for a degenerate (zero-length) input.
function extendLineToRect(
  x1: number, y1: number, x2: number, y2: number, W: number, H: number,
): { ax: number; ay: number; bx: number; by: number } | null {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return null;

  const candidates: number[] = [];
  if (dx !== 0) candidates.push((0 - x1) / dx, (W - x1) / dx);
  if (dy !== 0) candidates.push((0 - y1) / dy, (H - y1) / dy);

  const EPS = 0.5;
  const valid = candidates.filter((t) => {
    const px = x1 + t * dx, py = y1 + t * dy;
    return px >= -EPS && px <= W + EPS && py >= -EPS && py <= H + EPS;
  });
  if (valid.length === 0) return null;

  const tMin = Math.min(...valid);
  const tMax = Math.max(...valid);
  return {
    ax: x1 + tMin * dx, ay: y1 + tMin * dy,
    bx: x1 + tMax * dx, by: y1 + tMax * dy,
  };
}

// Cyclic Lines/Time Cycles: pixel-x positions of the repeating vertical lines
// from anchor x1, stepping by `spacing` in both directions until off the
// visible canvas width W. `k` is the cycle index (0 = anchor, signed in the
// direction of `spacing`) — Time Cycles uses it to label each line. Shared by
// the render branches and hitTest below so the two stay in sync. A near-zero
// spacing (degenerate/same-x clicks) collapses to just the anchor line rather
// than looping forever.
function computeCyclicLineXs(x1: number, spacing: number, W: number): { x: number; k: number }[] {
  if (Math.abs(spacing) < 1) return [{ x: x1, k: 0 }];
  const pts: { x: number; k: number }[] = [{ x: x1, k: 0 }];
  const MAX_LINES = 2000; // safety cap — far more than any realistic canvas width needs
  for (let k = 1; pts.length < MAX_LINES; k++) {
    const xf = x1 + k * spacing;
    const xb = x1 - k * spacing;
    const fIn = xf >= 0 && xf <= W;
    const bIn = xb >= 0 && xb <= W;
    if (fIn) pts.push({ x: xf, k });
    if (bIn) pts.push({ x: xb, k: -k });
    if (!fIn && !bIn) break;
  }
  return pts;
}

// Fib Time Zone: the fixed Fibonacci-sequence bar-offset multipliers vertical
// lines are drawn at (1,2,3,5,8,13,21,34,55 units of `spacing` from the
// anchor). Unlike computeCyclicLineXs this set is small and fixed — no
// loop/cap, and no mirrored negative-k side — so it's just mapped directly.
const FIB_TIME_OFFSETS = [1, 2, 3, 5, 8, 13, 21, 34, 55] as const;

// pixel-x positions of the Fib Time Zone vertical lines, off-screen ones
// skipped (not clamped) — same visibility rule as computeCyclicLineXs. Shared
// by the render branch and hitTest below so the two stay in sync.
function computeFibTimeZoneXs(x1: number, spacing: number, W: number): { x: number; k: number }[] {
  if (Math.abs(spacing) < 1) return [{ x: x1, k: 0 }];
  const pts: { x: number; k: number }[] = [{ x: x1, k: 0 }];
  for (const fibK of FIB_TIME_OFFSETS) {
    const x = x1 + fibK * spacing;
    if (x >= 0 && x <= W) pts.push({ x, k: fibK });
  }
  return pts;
}

// ── draw one completed/preview drawing ───────────────────────────────────────

function renderDrawing(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  d: Drawing,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  candles: Candle[],
  selected: boolean,
  eraserHover = false,
) {
  ctx.save();

  // eraser hover overrides every drawing's color to signal "click to delete"
  const pick = (normal: string, whenSelected: string) =>
    eraserHover ? '#f85149' : selected ? whenSelected : normal;

  if (d.type === 'trendline') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    // TradingView's "Trend Line" is a plain segment between the two anchor
    // points — it does not extend to the chart edges (that's the separate
    // "Extended Line" tool). Rendering only the segment also keeps this in
    // sync with hitTest, which only tests the segment.
    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] =
      d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // price labels
    const fmt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = '11px monospace';
    ctx.fillText(fmt(d.price1), Math.min(x1 + 4, W - 70), y1 - 4);
    ctx.fillText(fmt(d.price2), Math.min(x2 + 4, W - 70), y2 - 4);

  } else if (d.type === 'ray') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    // Ray starts at p1 and is extended past p2 to the chart edge — (bx,by) is
    // always the forward (larger-t) boundary crossing, i.e. beyond p2.
    const ext = extendLineToRect(x1, y1, x2, y2, W, H);
    const fx = ext ? ext.bx : x2;
    const fy = ext ? ext.by : y2;

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const fmtRay = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = '11px monospace';
    ctx.fillText(fmtRay(d.price1), Math.min(x1 + 4, W - 70), y1 - 4);
    ctx.fillText(fmtRay(d.price2), Math.min(x2 + 4, W - 70), y2 - 4);

  } else if (d.type === 'gannFan') {
    // Anchor (apex) and the point that sets the 1x1 ray's direction.
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1 = timeToX(chart, d.time2);
    const y1 = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1 == null || y1 == null) { ctx.restore(); return; }

    const dx = x1 - x0, dy = y1 - y0;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1.5;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    // The 7 classic Gann angles, each sharing the 1x1 vector's dx and only
    // scaling dy — a proper angle fan pivoting from the anchor. 1x1 (the
    // actual anchor->direction vector) is drawn emphasized; the rest lighter.
    const GANN_RAYS: { label: string; yScale: number; emphasize: boolean }[] = [
      { label: '1x1', yScale: 1,     emphasize: true },
      { label: '2x1', yScale: 0.5,   emphasize: false },
      { label: '3x1', yScale: 1 / 3, emphasize: false },
      { label: '4x1', yScale: 0.25,  emphasize: false },
      { label: '1x2', yScale: 2,     emphasize: false },
      { label: '1x3', yScale: 3,     emphasize: false },
      { label: '1x4', yScale: 4,     emphasize: false },
    ];

    for (const ray of GANN_RAYS) {
      const rdx = dx, rdy = dy * ray.yScale;
      const ext = extendLineToRect(x0, y0, x0 + rdx, y0 + rdy, W, H);
      const fx = ext ? ext.bx : x0 + rdx;
      const fy = ext ? ext.by : y0 + rdy;

      const lineColor = hexToRgba(baseColor, ray.emphasize ? baseOpacity : Math.max(baseOpacity * 0.5, 15));
      ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
      ctx.lineWidth = (ray.emphasize ? baseWidth + 0.5 : Math.max(baseWidth - 0.5, 1)) + (selected ? 1 : 0);
      ctx.setLineDash(dashPattern);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, ray.emphasize ? baseOpacity : Math.max(baseOpacity * 0.7, 30));
      ctx.font = '10px monospace';
      ctx.fillText(ray.label, Math.min(Math.max(fx - 12, 2), W - 24), Math.min(Math.max(fy, 10), H - 4));
    }

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (d.type === 'fibSpeedFan') {
    // Own branch modeled on gannFan — NOT routed through fibLevelsFor. Apex
    // (base start) and base end; each fib ray shares the base vector's dx and
    // scales dy by (1 - r) — the retracement convention measured back from
    // p2, so r=0 is the base line itself (through p2) and r=1 is the
    // horizontal through the apex.
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1p = timeToX(chart, d.time2);
    const y1p = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1p == null || y1p == null) { ctx.restore(); return; }

    const dx = x1p - x0, dy = y1p - y0;

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1.5;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
      // degenerate (no time or no price range) — every ray would collapse
      // onto one line, so fall back to just the base segment
      ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, baseOpacity);
      ctx.lineWidth = baseWidth + (selected ? 1 : 0);
      ctx.setLineDash(dashPattern);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1p, y1p);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      for (const r of FIB_FAN_RATIOS) {
        // emphasize the base line (r=0), same as gannFan's 1x1
        const emphasize = r === 0;
        const rdx = dx, rdy = dy * (1 - r);
        const ext = extendLineToRect(x0, y0, x0 + rdx, y0 + rdy, W, H);
        const fx = ext ? ext.bx : x0 + rdx;
        const fy = ext ? ext.by : y0 + rdy;

        const lineColor = hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.5, 15));
        ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
        ctx.lineWidth = (emphasize ? baseWidth + 0.5 : Math.max(baseWidth - 0.5, 1)) + (selected ? 1 : 0);
        ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.7, 30));
        ctx.font = '10px monospace';
        ctx.fillText(String(r), Math.min(Math.max(fx - 12, 2), W - 36), Math.min(Math.max(fy, 10), H - 4));
      }
    }

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.beginPath();
      ctx.arc(x1p, y1p, 4, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (d.type === 'fibCircles') {
    // Own branch — NOT routed through fibLevelsFor, and NOT the Circle/Ellipse
    // bounding-box geometry. p1 is the center, p2 an edge point; the base
    // radius is their pixel distance (recomputed every frame), so the r=1
    // ring always passes through p2 and every ring stays a true circle.
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1p = timeToX(chart, d.time2);
    const y1p = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1p == null || y1p == null) { ctx.restore(); return; }

    const baseR = Math.hypot(x1p - x0, y1p - y0);

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1.5;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    // degenerate (p1 == p2) — no rings, just the center dot below
    if (baseR >= 1) {
      for (const r of FIB_CIRCLE_RATIOS) {
        // emphasize the base ring (r=1, through p2), same as the fan's base line
        const emphasize = r === 1;
        const ringR = baseR * r;

        const lineColor = hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.5, 15));
        ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
        ctx.lineWidth = (emphasize ? baseWidth + 0.5 : Math.max(baseWidth - 0.5, 1)) + (selected ? 1 : 0);
        ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.arc(x0, y0, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.7, 30));
        ctx.font = '10px monospace';
        ctx.fillText(String(r), Math.min(Math.max(x0, 2), W - 24), Math.min(Math.max(y0 - ringR - 3, 10), H - 4));
      }
    }

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.beginPath();
      ctx.arc(x1p, y1p, 4, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (d.type === 'fibSpeedArcs') {
    // Own branch — NOT routed through fibLevelsFor. The half-circle cousin of
    // Fib Circles: p1 is the origin, p2 the end; the base radius is their
    // pixel distance, and each fib-ratio arc is a fixed semicircle around p1
    // opening toward whichever side (above/below) p2 is on.
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1p = timeToX(chart, d.time2);
    const y1p = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1p == null || y1p == null) { ctx.restore(); return; }

    const baseR = Math.hypot(x1p - x0, y1p - y0);
    // p2 above (or level with) p1 → upper half; below → lower half
    const up = y1p <= y0;
    const a0 = up ? Math.PI : 0;
    const a1 = up ? Math.PI * 2 : Math.PI;

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1.5;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    // degenerate (p1 == p2) — no arcs, just the center dot below
    if (baseR >= 1) {
      for (const r of FIB_ARC_RATIOS) {
        // emphasize the base arc (r=1, through p2's radius)
        const emphasize = r === 1;
        const ringR = baseR * r;

        const lineColor = hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.5, 15));
        ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
        ctx.lineWidth = (emphasize ? baseWidth + 0.5 : Math.max(baseWidth - 0.5, 1)) + (selected ? 1 : 0);
        ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.arc(x0, y0, ringR, a0, a1);
        ctx.stroke();
        ctx.setLineDash([]);

        // label at the arc's apex
        const ly = up ? y0 - ringR - 3 : y0 + ringR + 11;
        ctx.fillStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.7, 30));
        ctx.font = '10px monospace';
        ctx.fillText(String(r), Math.min(Math.max(x0, 2), W - 24), Math.min(Math.max(ly, 10), H - 4));
      }
    }

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.beginPath();
      ctx.arc(x1p, y1p, 4, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (d.type === 'cyclicLines' || d.type === 'timeCycles') {
    // Both tools share identical repeating-vertical-line geometry — the two
    // anchors set the pixel interval (spacing = x2 - x1), repeated in both
    // directions across the canvas. Time Cycles' only difference is the
    // forward cycle-number label drawn near the top of each line.
    const x1 = timeToX(chart, d.time1);
    const x2 = timeToX(chart, d.time2);
    if (x1 == null || x2 == null) { ctx.restore(); return; }
    const spacing = x2 - x1;

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1.5;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    const xs = computeCyclicLineXs(x1, spacing, W);
    for (const { x, k } of xs) {
      // emphasize the two anchor lines (k=0 and k=1) so the baseline interval reads clearly
      const emphasize = k === 0 || k === 1;
      const lineColor = hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.6, 20));
      ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
      ctx.lineWidth = (emphasize ? baseWidth + 0.5 : Math.max(baseWidth - 0.5, 1)) + (selected ? 1 : 0);
      ctx.setLineDash(dashPattern);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);

      if (d.type === 'timeCycles' && k > 0) {
        ctx.fillStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, Math.max(baseOpacity * 0.8, 40));
        ctx.font = '10px monospace';
        ctx.fillText(String(k), Math.min(Math.max(x + 3, 2), W - 16), 12);
      }
    }

  } else if (d.type === 'sineLine') {
    // The two anchors set wavelength (horizontal distance) and amplitude
    // (vertical distance); the wave is sampled across the full canvas width
    // and stroked as one polyline, same pattern as the Anchored VWAP branch.
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);

    const wavelength = Math.abs(x2 - x1);
    ctx.beginPath();
    if (wavelength < 1) {
      // degenerate (same-x clicks) — fall back to a plain segment
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else {
      const amplitude = Math.abs(y2 - y1);
      const midY = (y1 + y2) / 2;
      const STEP = 2;
      for (let x = 0; x <= W; x += STEP) {
        const y = midY + amplitude * Math.sin((2 * Math.PI * (x - x1)) / wavelength);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(x1, y1, selected ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y2, selected ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();

  } else if (d.type === 'fibTimeZone') {
    // Own branch — NOT merged with cyclicLines (different, fixed offset set)
    // or the fib-level family (fibLevelsFor is never called here). The two
    // anchors set the pixel spacing (spacing = x2 - x1); vertical lines are
    // drawn at Fibonacci-sequence multiples of that spacing from the anchor,
    // each labeled with its Fibonacci number — same pattern as Time Cycles'
    // numbered labels, but a fixed offset set instead of every k.
    const x1 = timeToX(chart, d.time1);
    const x2 = timeToX(chart, d.time2);
    if (x1 == null || x2 == null) { ctx.restore(); return; }
    const spacing = x2 - x1;

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1.5;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    const xs = computeFibTimeZoneXs(x1, spacing, W);
    for (const { x, k } of xs) {
      // emphasize the anchor (k=0) so the baseline unit reads clearly
      const emphasize = k === 0;
      const lineColor = hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.6, 20));
      ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
      ctx.lineWidth = (emphasize ? baseWidth + 0.5 : Math.max(baseWidth - 0.5, 1)) + (selected ? 1 : 0);
      ctx.setLineDash(dashPattern);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);

      if (k > 0) {
        ctx.fillStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, Math.max(baseOpacity * 0.8, 40));
        ctx.font = '10px monospace';
        ctx.fillText(String(k), Math.min(Math.max(x + 3, 2), W - 16), 12);
      }
    }

    if (selected) {
      const y1 = priceToY(series, d.price1);
      const y2 = priceToY(series, d.price2);
      if (y1 != null) { ctx.fillStyle = eraserHover ? '#f85149' : baseColor; ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.fill(); }
      if (y2 != null) { ctx.fillStyle = eraserHover ? '#f85149' : baseColor; ctx.beginPath(); ctx.arc(x2, y2, 4, 0, Math.PI * 2); ctx.fill(); }
    }

  } else if (d.type === 'gannBox' || d.type === 'gannSquare') {
    // Same 2-corner box shape as Rectangle (see the 'rectangle' branch below)
    // — a proportional grid (and, for Gann Square, a diagonal fan) drawn
    // inside instead of a filled rectangle.
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const xLeft   = Math.min(x1, x2);
    const xRight  = Math.max(x1, x2);
    const yTop    = Math.min(y1, y2);
    const yBottom = Math.max(y1, y2);

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    const strokeColor = eraserHover ? '#f85149' : hexToRgba(baseColor, baseOpacity);
    const gridColor = eraserHover ? '#f85149' : hexToRgba(baseColor, Math.max(baseOpacity * 0.45, 12));

    // outer border
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = baseWidth + (selected ? 0.5 : 0);
    ctx.setLineDash(dashPattern);
    ctx.strokeRect(xLeft, yTop, xRight - xLeft, yBottom - yTop);
    ctx.setLineDash([]);

    // internal grid — horizontal + vertical divisions at the shared Gann
    // ratio set; the 0/1 ratios coincide with the border already drawn above.
    for (const r of GANN_GRID_RATIOS) {
      if (r <= 0 || r >= 1) continue;
      const y = yTop + r * (yBottom - yTop);
      drawGannGridLine(
        ctx, gridColor, xLeft, y, xRight, y,
        Math.max(baseWidth - 0.5, 0.75), [], 1,
        selected ? r.toString() : undefined, xLeft + 2, y - 2,
      );
      const x = xLeft + r * (xRight - xLeft);
      drawGannGridLine(
        ctx, gridColor, x, yTop, x, yBottom,
        Math.max(baseWidth - 0.5, 0.75), [], 1,
        selected ? r.toString() : undefined, x + 2, yTop + 10,
      );
    }

    if (d.type === 'gannSquare') {
      const fanColor = eraserHover ? '#f85149' : hexToRgba(baseColor, Math.max(baseOpacity * 0.3, 10));
      const fanWidth = Math.max(baseWidth - 0.5, 0.75);

      // main corner-to-corner diagonals
      drawGannGridLine(ctx, gridColor, xLeft, yTop, xRight, yBottom, fanWidth, [], 1);
      drawGannGridLine(ctx, gridColor, xRight, yTop, xLeft, yBottom, fanWidth, [], 1);

      // fan from the top-left corner to each ratio point along the right
      // and bottom edges — the classic Gann Square angle-fan look.
      for (const r of GANN_GRID_RATIOS) {
        if (r <= 0) continue;
        const yRight = yTop + r * (yBottom - yTop);
        drawGannGridLine(ctx, fanColor, xLeft, yTop, xRight, yRight, fanWidth, [], 1);
        const xBottom = xLeft + r * (xRight - xLeft);
        drawGannGridLine(ctx, fanColor, xLeft, yTop, xBottom, yBottom, fanWidth, [], 1);
      }
    }

    if (selected) {
      ctx.fillStyle = strokeColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2], [x1, y2], [x2, y1]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'extendedLine') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    const ext = extendLineToRect(x1, y1, x2, y2, W, H);
    const ax = ext ? ext.ax : x1, ay = ext ? ext.ay : y1;
    const bx = ext ? ext.bx : x2, by = ext ? ext.by : y2;

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const fmtExt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = '11px monospace';
    ctx.fillText(fmtExt(d.price1), Math.min(x1 + 4, W - 70), y1 - 4);
    ctx.fillText(fmtExt(d.price2), Math.min(x2 + 4, W - 70), y2 - 4);

  } else if (d.type === 'infoLine') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // label near the midpoint: price change, % change, bar count
    const priceDiff = d.price2 - d.price1;
    const pricePct = d.price1 !== 0 ? (priceDiff / d.price1) * 100 : 0;
    const intervalSec = estimateBarIntervalSec(candles) ?? 60;
    const bars = Math.round((d.time2 - d.time1) / intervalSec);
    const sign = priceDiff >= 0 ? '+' : '';
    const infoLabel = `${sign}${priceDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sign}${pricePct.toFixed(2)}%)  ${Math.abs(bars)} bar${Math.abs(bars) === 1 ? '' : 's'}`;

    ctx.font = 'bold 11px sans-serif';
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
    const textW = ctx.measureText(infoLabel).width;
    const boxW = textW + 12, boxH = 18;
    const bx2 = Math.min(Math.max(midX - boxW / 2, 4), W - boxW - 4);
    const by2 = midY - boxH - 6;
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.fillRect(bx2, by2, boxW, boxH);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(infoLabel, bx2 + 6, by2 + boxH / 2 + 1);
    ctx.textBaseline = 'alphabetic';

  } else if (d.type === 'trendAngle') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // short horizontal reference line at p1, so the angle reads visually
    // against the horizontal
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (x2 >= x1 ? 30 : -30), y1);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // angle from horizontal, in pixel space (y grows downward, so y1-y2 flips
    // it back to the usual "up is positive" convention)
    const deg = Math.atan2(y1 - y2, x2 - x1) * 180 / Math.PI;
    const angleLabel = `${deg.toFixed(1)}°`;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
    ctx.fillText(angleLabel, Math.min(midX + 4, W - 50), midY - 8);

  } else if (d.type === 'hline') {
    const y = priceToY(series, d.price);
    if (y == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = '11px monospace';
    ctx.fillText(label, W - 90, y - 4);

  } else if (d.type === 'hray') {
    const y  = priceToY(series, d.price);
    const x0 = timeToX(chart, d.time);
    if (y == null || x0 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x0, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const label = d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = '11px monospace';
    ctx.fillText(label, W - 90, y - 4);

  } else if (d.type === 'vline') {
    const x = timeToX(chart, d.time);
    if (x == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // The whole point of a Vertical Line is marking a moment in time, so
    // always show its date/time — like TradingView's tag on the time axis.
    const label = fmtTime(d.time);
    ctx.font = '11px monospace';
    const textW = ctx.measureText(label).width;
    const tagW = textW + 12;
    const tagX = Math.max(2, Math.min(x - tagW / 2, W - tagW - 2));
    const tagY = H - 22;
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.fillRect(tagX, tagY, tagW, 18);
    ctx.fillStyle = '#0d1117';
    ctx.fillText(label, tagX + 6, tagY + 13);

  } else if (d.type === 'crossline') {
    const y = priceToY(series, d.price);
    const x = timeToX(chart, d.time);
    if (y == null || x == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const label = d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = '11px monospace';
    ctx.fillText(label, W - 90, y - 4);

  } else if (d.type === 'channel') {
    const lines = getChannelLines(d, chart, series);
    if (!lines) { ctx.restore(); return; }
    const { x1, y1, x2, y2, y1b, y2b } = lines;

    ctx.strokeStyle = pick('#2196F3', '#64B5F6');
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1b);
    ctx.lineTo(x2, y2b);
    ctx.stroke();

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.08)' : 'rgba(33,150,243,0.08)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2b);
    ctx.lineTo(x1, y1b);
    ctx.closePath();
    ctx.fill();

    // median line, like TradingView's parallel channel
    ctx.strokeStyle = pick('#2196F3', '#64B5F6');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, (y1 + y1b) / 2);
    ctx.lineTo(x2, (y2 + y2b) / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      const handleColor = eraserHover ? '#f85149' : '#2196F3';
      ctx.fillStyle = handleColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // width handle — drag to widen/narrow the channel
      const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;
      ctx.fillRect(wx - 4, wy - 4, 8, 8);
    }

  } else if (d.type === 'flatChannel') {
    const lines = getFlatChannelLines(d, chart, series);
    if (!lines) { ctx.restore(); return; }
    const { x1, y1, x2, y2, y1b, y2b } = lines;

    ctx.strokeStyle = pick('#2196F3', '#64B5F6');
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1b);
    ctx.lineTo(x2, y2b);
    ctx.stroke();

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.08)' : 'rgba(33,150,243,0.08)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2b);
    ctx.lineTo(x1, y1b);
    ctx.closePath();
    ctx.fill();

    // median line, like Parallel Channel
    ctx.strokeStyle = pick('#2196F3', '#64B5F6');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, (y1 + y1b) / 2);
    ctx.lineTo(x2, (y2 + y2b) / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      const handleColor = eraserHover ? '#f85149' : '#2196F3';
      ctx.fillStyle = handleColor;
      // p1 (top price), p2 (right time edge)
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // p3 width handle — drag to change the bottom price
      const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;
      ctx.fillRect(wx - 4, wy - 4, 8, 8);
    }

  } else if (d.type === 'disjointChannel') {
    const xA1 = timeToX(chart, d.timeA1), yA1 = priceToY(series, d.priceA1);
    const xA2 = timeToX(chart, d.timeA2), yA2 = priceToY(series, d.priceA2);
    const xB1 = timeToX(chart, d.timeB1), yB1 = priceToY(series, d.priceB1);
    const xB2 = timeToX(chart, d.timeB2), yB2 = priceToY(series, d.priceB2);
    if (xA1 == null || yA1 == null || xA2 == null || yA2 == null ||
        xB1 == null || yB1 == null || xB2 == null || yB2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.08)' : hexToRgba(baseColor, 8);
    ctx.beginPath();
    ctx.moveTo(xA1, yA1);
    ctx.lineTo(xA2, yA2);
    ctx.lineTo(xB2, yB2);
    ctx.lineTo(xB1, yB1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(xA1, yA1);
    ctx.lineTo(xA2, yA2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xB1, yB1);
    ctx.lineTo(xB2, yB2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[xA1, yA1], [xA2, yA2], [xB1, yB1], [xB2, yB2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'regression') {
    const reg = computeRegression(candles, d.time1, d.time2);
    if (!reg) { ctx.restore(); return; }

    const xS = timeToX(chart, reg.startTime);
    const xE = timeToX(chart, reg.endTime);
    const yMidS = priceToY(series, reg.midStart), yMidE = priceToY(series, reg.midEnd);
    const yUpS  = priceToY(series, reg.upperStart), yUpE  = priceToY(series, reg.upperEnd);
    const yLoS  = priceToY(series, reg.lowerStart), yLoE  = priceToY(series, reg.lowerEnd);
    if (xS == null || xE == null || yMidS == null || yMidE == null ||
        yUpS == null || yUpE == null || yLoS == null || yLoE == null) { ctx.restore(); return; }

    // TradingView-style regression channel: blue upper deviation band, red
    // lower deviation band, neutral median line.
    const upColor  = eraserHover ? '#f85149' : '#2196F3';
    const loColor  = eraserHover ? '#f85149' : '#F23645';
    const midColor = eraserHover ? '#f85149' : '#d1d4dc';

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.06)' : 'rgba(33,150,243,0.08)';
    ctx.beginPath();
    ctx.moveTo(xS, yUpS);
    ctx.lineTo(xE, yUpE);
    ctx.lineTo(xE, yMidE);
    ctx.lineTo(xS, yMidS);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.06)' : 'rgba(242,54,69,0.08)';
    ctx.beginPath();
    ctx.moveTo(xS, yMidS);
    ctx.lineTo(xE, yMidE);
    ctx.lineTo(xE, yLoE);
    ctx.lineTo(xS, yLoS);
    ctx.closePath();
    ctx.fill();

    ctx.setLineDash([]);
    ctx.strokeStyle = midColor;
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(xS, yMidS);
    ctx.lineTo(xE, yMidE);
    ctx.stroke();

    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = upColor;
    ctx.beginPath();
    ctx.moveTo(xS, yUpS);
    ctx.lineTo(xE, yUpE);
    ctx.stroke();
    ctx.strokeStyle = loColor;
    ctx.beginPath();
    ctx.moveTo(xS, yLoS);
    ctx.lineTo(xE, yLoE);
    ctx.stroke();
    ctx.setLineDash([]);

  } else if (d.type === 'rectangle') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);

    const baseColor = d.color ?? '#2196F3';
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    if (d.filled !== false) {
      ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.1)' : hexToRgba(d.fillColor ?? baseColor, d.fillOpacity ?? 20);
      ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? 1) + (selected ? 0.5 : 0);
    ctx.setLineDash(dashPattern);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    const topP    = Math.max(d.price1, d.price2);
    const bottomP = Math.min(d.price1, d.price2);
    const range   = (topP - bottomP).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = '10px monospace';
    ctx.fillText(`Δ${range}`, rx + 4, ry + 14);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2], [x1, y2], [x2, y1]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'rotatedRectangle') {
    const lines = computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!lines) { ctx.restore(); return; }
    const { x1, y1, x2, y2, y1b, y2b } = lines;

    const baseColor = d.color ?? '#2196F3';
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    if (d.filled !== false) {
      ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.1)' : hexToRgba(d.fillColor ?? baseColor, d.fillOpacity ?? 20);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2b); ctx.lineTo(x1, y1b);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? 1) + (selected ? 0.5 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2b); ctx.lineTo(x1, y1b);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;
      ctx.fillRect(wx - 4, wy - 4, 8, 8);
    }

  } else if (d.type === 'circle' || d.type === 'ellipse') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    const baseColor = d.color ?? '#2196F3';
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    if (d.filled !== false) {
      ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.1)' : hexToRgba(d.fillColor ?? baseColor, d.fillOpacity ?? 20);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? 1) + (selected ? 0.5 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2], [x1, y2], [x2, y1]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'triangle') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) { ctx.restore(); return; }
    const { x1, y1, x2, y2, x3, y3 } = pts3;

    const baseColor = d.color ?? '#2196F3';
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    if (d.filled !== false) {
      ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.1)' : hexToRgba(d.fillColor ?? baseColor, d.fillOpacity ?? 20);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? 1) + (selected ? 0.5 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2], [x3, y3]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'sector') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) { ctx.restore(); return; }
    const { x1, y1, x2, y2, x3, y3 } = pts3;

    const baseColor = d.color ?? '#2196F3';
    const lineColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];
    const geo = sectorGeometry(x1, y1, x2, y2, x3, y3);

    // Apex -> through (px,py) -> chart edge, like Gann Fan's rays. Falls back
    // to the anchor itself when the edge crossing isn't ahead of the apex
    // (apex scrolled off-canvas with the ray pointing away from the view).
    const strokeRay = (px: number, py: number) => {
      const ext = extendLineToRect(x1, y1, px, py, W, H);
      const edge = ext && (ext.bx - x1) * (px - x1) + (ext.by - y1) * (py - y1) > 0 ? ext : null;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(edge ? edge.bx : px, edge ? edge.by : py);
      ctx.stroke();
    };

    if (geo.kind === 'wedge') {
      if (d.filled !== false) {
        // Radius reaching the farthest canvas corner from the apex, so the
        // wedge always covers the visible area; the canvas clips the rest.
        const R = Math.max(
          Math.hypot(x1, y1), Math.hypot(W - x1, y1),
          Math.hypot(x1, H - y1), Math.hypot(W - x1, H - y1),
        );
        ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.1)' : hexToRgba(d.fillColor ?? baseColor, d.fillOpacity ?? 20);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.arc(x1, y1, R, geo.aA, geo.aB, geo.ccw);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = (d.width ?? 1) + (selected ? 0.5 : 0);
    ctx.setLineDash(dashPattern);
    if (geo.kind === 'wedge' || geo.kind === 'collinear' || geo.kind === 'rayA') strokeRay(x2, y2);
    if (geo.kind === 'wedge' || geo.kind === 'collinear' || geo.kind === 'rayB') strokeRay(x3, y3);
    ctx.setLineDash([]);

    if (geo.kind === 'wedge') {
      // angle arc near the apex + interior-angle label on the bisector
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x1, y1, 40, geo.aA, geo.aB, geo.ccw);
      ctx.stroke();

      const deg = Math.abs(geo.diff) * 180 / Math.PI;
      const mid = geo.aA + geo.diff / 2;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${deg.toFixed(1)}°`, Math.min(x1 + 52 * Math.cos(mid), W - 50), y1 + 52 * Math.sin(mid));
    }

    if (selected || geo.kind === 'apex') {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      const handles = selected ? [[x1, y1], [x2, y2], [x3, y3]] as const : [[x1, y1]] as const;
      for (const [hx, hy] of handles) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'fibWedge') {
    // Own branch — NOT routed through fibLevelsFor. Fib Circles clipped to a
    // Sector's sweep: sectorGeometry gives the edge angles, the base radius is
    // the apex→p2 pixel distance, and each fib-ratio arc runs from edge A to
    // edge B. p3 only sets edge B's angle, so edge B stops at the r=1 arc.
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) { ctx.restore(); return; }
    const { x1, y1, x2, y2, x3, y3 } = pts3;

    const geo = sectorGeometry(x1, y1, x2, y2, x3, y3);
    const baseR = Math.hypot(x2 - x1, y2 - y1);

    const baseColor = d.color ?? '#2196F3';
    const baseOpacity = d.opacity ?? 100;
    const baseWidth = d.width ?? 1.5;
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    const strokeEdge = (ex: number, ey: number) => {
      ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, baseOpacity);
      ctx.lineWidth = baseWidth + (selected ? 1 : 0);
      ctx.setLineDash(dashPattern);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (geo.kind === 'wedge' && baseR >= 1) {
      // label position: each arc's midpoint, on the wedge's bisector
      const mid = geo.aA + geo.diff / 2;
      for (const r of FIB_WEDGE_RATIOS) {
        // emphasize the base arc (r=1, through p2), same as Fib Circles
        const emphasize = r === 1;
        const arcR = baseR * r;

        const lineColor = hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.5, 15));
        ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
        ctx.lineWidth = (emphasize ? baseWidth + 0.5 : Math.max(baseWidth - 0.5, 1)) + (selected ? 1 : 0);
        ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.arc(x1, y1, arcR, geo.aA, geo.aB, geo.ccw);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, emphasize ? baseOpacity : Math.max(baseOpacity * 0.7, 30));
        ctx.font = '10px monospace';
        ctx.fillText(String(r),
          Math.min(Math.max(x1 + Math.cos(mid) * arcR, 2), W - 24),
          Math.min(Math.max(y1 + Math.sin(mid) * arcR, 10), H - 4));
      }

      strokeEdge(x2, y2);
      strokeEdge(x1 + Math.cos(geo.aB) * baseR, y1 + Math.sin(geo.aB) * baseR);
    } else if (geo.kind === 'rayA' || geo.kind === 'collinear') {
      // collinear is the preview state between clicks 2 and 3 (p3 = p2)
      strokeEdge(x2, y2);
    } else if (geo.kind === 'rayB') {
      strokeEdge(x3, y3);
    }

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      for (const [hx, hy] of [[x2, y2], [x3, y3]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'positionForecast') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) { ctx.restore(); return; }
    const { x1, y1, x2, y2, x3, y3 } = pts3;

    const baseColor = d.color ?? '#2196F3';
    const lineColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];
    const geo = forecastGeometry(x1, y1, x2, y2, x3, y3);

    // Direction of the overall start->target move drives the zone/label tint
    // (Long/Short Position's profit/loss greens and reds); flat falls back to
    // the line color.
    const move = d.price3 - d.price1;
    const dirColor = move > 0 ? '#089981' : move < 0 ? '#F23645' : baseColor;

    if (geo.kind === 'full' && geo.zone && d.filled !== false) {
      const z = geo.zone;
      ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.1)' : hexToRgba(d.fillColor ?? dirColor, d.fillOpacity ?? 20);
      ctx.fillRect(z.lx, z.ty, z.rx - z.lx, z.by - z.ty);
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = (d.width ?? 1) + (selected ? 0.5 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (geo.kind === 'full') ctx.lineTo(x3, y3);
    ctx.stroke();
    ctx.setLineDash([]);

    if (geo.kind === 'full') {
      // "+3.42% (+12.30) · 18 bars" — the % part is dropped when the start
      // price is 0, the bars part when the bar interval can't be inferred.
      const fmt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sign = move >= 0 ? '+' : '-';
      const parts: string[] = [];
      if (d.price1 !== 0) {
        const pct = move / d.price1 * 100;
        parts.push(`${sign}${Math.abs(pct).toFixed(2)}% (${sign}${fmt(Math.abs(move))})`);
      } else {
        parts.push(`${sign}${fmt(Math.abs(move))}`);
      }
      const barSec = estimateBarIntervalSec(candles);
      if (barSec != null) parts.push(`${Math.round((d.time3 - d.time1) / barSec)} bars`);
      const label = parts.join(' · ');

      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = eraserHover ? '#f85149' : dirColor;
      const tw = ctx.measureText(label).width;
      // above the target on an up-move, below it on a down-move — i.e. just
      // outside the shaded zone
      const ly = move >= 0 ? y3 - 12 : y3 + 12;
      ctx.fillText(label, Math.max(4, Math.min(x3 + 8, W - tw - 4)), ly);
    }

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2], [x3, y3]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'arc' || d.type === 'curve') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) { ctx.restore(); return; }
    const { x1, y1, x2, y2, x3: cx, y3: cy } = pts3;

    const baseColor = d.color ?? '#2196F3';
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // control-point handle, drawn hollow to distinguish it from the two anchors
      ctx.strokeStyle = eraserHover ? '#f85149' : baseColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.stroke();
    }

  } else if (d.type === 'doubleCurve') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) { ctx.restore(); return; }
    const { x1, y1, x2, y2, x3, y3 } = pts3;
    const { c1, c2 } = doubleCurveControls(x1, y1, x2, y2, x3, y3);

    const baseColor = d.color ?? '#2196F3';
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(c1.x, c1.y, x2, y2);
    ctx.quadraticCurveTo(c2.x, c2.y, x3, y3);
    ctx.stroke();
    ctx.setLineDash([]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2], [x3, y3]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'path' || d.type === 'polyline' || d.type === 'brush' || d.type === 'highlighter') {
    const pts = d.points
      .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    if (pts.length < 2) { ctx.restore(); return; }

    // Path/Polyline share dash + a thinner default width + vertex handling;
    // Brush/Highlighter are always solid with a thicker default width.
    const isPathLike = d.type === 'path' || d.type === 'polyline';
    const baseColor = d.color ?? '#2196F3';
    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? (isPathLike ? 1.5 : 2)) + (selected ? 0.5 : 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (isPathLike) ctx.setLineDash(d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : []);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Only Path ends in an arrowhead — Polyline is Path minus this, using the
    // direction of its last segment. Brush/Highlighter never had one either.
    if (d.type === 'path') {
      const tip = pts[pts.length - 1], prev = pts[pts.length - 2];
      const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
      const headLen = 6 + ctx.lineWidth * 2;
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - headLen * Math.cos(angle - Math.PI / 6), tip.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tip.x - headLen * Math.cos(angle + Math.PI / 6), tip.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    if (selected && isPathLike) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'abcd' || d.type === 'xabcd' || d.type === 'cypher' ||
      d.type === 'threeDrives' || d.type === 'headShoulders') {
    // Pattern tools (ABCD/XABCD/Cypher/Three Drives/Head & Shoulders): same
    // points[] -> screen -> moveTo/lineTo connected-line approach as
    // Path/Polyline above (see that branch), plus per-point letter labels and
    // leg-ratio labels. Kept as its own branch (not folded into the Path
    // branch above) so it never picks up Path's arrowhead and so the label/
    // ratio/neckline extras stay scoped to these 5 types only.
    const pts = d.points
      .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    if (pts.length < 2) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    // Head & Shoulders' neckline: derived at render time from the two trough
    // points (index 1 and 3), never stored — same "derive, don't store"
    // approach Gann Fan's secondary rays and Double Curve's control points use.
    if (d.type === 'headShoulders' && pts.length >= 4) {
      const ext = extendLineToRect(pts[1].x, pts[1].y, pts[3].x, pts[3].y, W, H);
      if (ext) {
        ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, (d.opacity ?? 100) * 0.7);
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(ext.ax, ext.ay);
        ctx.lineTo(ext.bx, ext.by);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.strokeStyle = eraserHover ? '#f85149' : lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 0.5 : 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // point dots + letter labels (A/B/C/D, X/A/B/C/D, 1..6, or LS/H/RS)
    const letters = PATTERN_POINT_LABELS[d.type];
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.font = 'bold 11px sans-serif';
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, selected ? 3.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      const letter = letters[i];
      if (letter) {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 3;
        ctx.strokeText(letter, pts[i].x + 6, pts[i].y - 8);
        ctx.fillText(letter, pts[i].x + 6, pts[i].y - 8);
      }
    }

    // leg-ratio labels (BC/AB, CD/BC, ...) at each segment's midpoint, computed
    // in PRICE space (same abs-price-diff approach Info Line's label uses) —
    // the first leg has no previous leg to ratio against, so it's skipped.
    if (d.type !== 'headShoulders') {
      ctx.font = 'bold 11px sans-serif';
      for (let i = 1; i < d.points.length - 1; i++) {
        const prevLeg = Math.abs(d.points[i].price - d.points[i - 1].price);
        const leg = Math.abs(d.points[i + 1].price - d.points[i].price);
        if (prevLeg === 0) continue;
        const ratio = leg / prevLeg;
        const label = ratio.toFixed(3);

        const midX = (pts[i].x + pts[i + 1].x) / 2, midY = (pts[i].y + pts[i + 1].y) / 2;
        const textW = ctx.measureText(label).width;
        const boxW = textW + 10, boxH = 16;
        const bx = Math.min(Math.max(midX - boxW / 2, 4), W - boxW - 4);
        const by = midY - boxH - 6;
        ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 5, by + boxH / 2 + 1);
        ctx.textBaseline = 'alphabetic';
      }
    }

  } else if (d.type === 'arrow') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const fillColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);

    if (d.variant === 'marker') {
      // Arrow Marker is a solid tapered dart — thin/pointed at the tail,
      // flaring out to a pair of "wings" partway along, then sweeping back to
      // a sharp point at the head. Its proportions scale with the segment
      // length, so dragging either endpoint further apart grows the whole
      // shape (the only "resize" this tool needs).
      const points = arrowMarkerDartPoints(x1, y1, x2, y2);
      ctx.fillStyle = fillColor;
      if (points) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
        ctx.fill();
      }

      if (selected) {
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // plain Arrow: a thin line with a separate arrowhead triangle at the head
      const lineColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
      const width = (d.width ?? 2) + (selected ? 0.5 : 0);

      ctx.strokeStyle = lineColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = width;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 8 + width * 2;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      if (selected) {
        ctx.beginPath();
        ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'arrowMark') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // A single-click, chunky "block arrow" icon (shaft + triangular head) —
    // not a 2-point line. The anchor point is the arrow's tip: Up points up
    // with its tip at the anchor, Down points down with its tip at the anchor,
    // matching TradingView's marker placement right against the price point.
    const defaultColor = d.variant === 'up' ? '#089981' : '#F23645';
    const baseColor = d.color ?? defaultColor;
    const s = d.size ?? 20;
    // canvas y grows downward; an up-arrow's tip sits at the anchor (top) with
    // its body extending down (+offset), a down-arrow's tip sits at the anchor
    // (bottom) with its body extending up (-offset).
    const dir = d.variant === 'up' ? 1 : -1;

    const headH  = s * 0.55;
    const shaftH = s * 0.55;
    const headW  = s * 0.85;
    const shaftW = s * 0.32;

    const pts: [number, number][] = [
      [0, 0],
      [-headW / 2, dir * headH],
      [-shaftW / 2, dir * headH],
      [-shaftW / 2, dir * (headH + shaftH)],
      [shaftW / 2, dir * (headH + shaftH)],
      [shaftW / 2, dir * headH],
      [headW / 2, dir * headH],
    ];

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.moveTo(x + pts[0][0], y + pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(x + pts[i][0], y + pts[i][1]);
    ctx.closePath();
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      const bodyEnd = y + dir * (headH + shaftH);
      const top = Math.min(y, bodyEnd);
      const bottom = Math.max(y, bodyEnd);
      ctx.strokeRect(x - headW / 2 - 3, top - 3, headW + 6, bottom - top + 6);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'pin') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // Map-pin/teardrop: tip at the anchor, rounded head above (a triangular
    // tail plus a circle, like ArrowMark's single-anchor icon shapes).
    const baseColor = d.color ?? '#F23645';
    const s = d.size ?? 20;
    const r = s * 0.35;
    const headCy = y - s * 0.65;

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - r * 0.55, headCy + r * 0.6);
    ctx.lineTo(x + r * 0.55, headCy + r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, headCy, r, 0, Math.PI * 2);
    ctx.fill();

    // hollow center for the classic pin look
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, headCy, r * 0.4, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      const top = headCy - r;
      ctx.strokeRect(x - r - 3, top - 3, r * 2 + 6, y - top + 6);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'flagMark') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // Vertical pole from the anchor up, triangular flag at the top.
    const baseColor = d.color ?? '#2196F3';
    const s = d.size ?? 20;
    const poleTop = y - s;
    const flagW = s * 0.7, flagH = s * 0.45;

    ctx.strokeStyle = eraserHover ? '#f85149' : baseColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, poleTop);
    ctx.stroke();

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.moveTo(x, poleTop);
    ctx.lineTo(x + flagW, poleTop + flagH * 0.4);
    ctx.lineTo(x, poleTop + flagH);
    ctx.closePath();
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x - 3, poleTop - 3, flagW + 6, y - poleTop + 6);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'priceLabel') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // Same rounded-pill tag as Price Note's price tag, just centered on a
    // single anchor instead of hanging off a line's endpoint, and always
    // showing the anchor's own price (never user-typed).
    const baseColor = d.color ?? '#2196F3';
    const priceText = d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.font = 'bold 12px sans-serif';
    const textW = ctx.measureText(priceText).width;
    const tagH = 22;
    const tagW = textW + 16;
    const tagX = x - tagW / 2;
    const tagY = y - tagH / 2;
    const r = tagH / 2;

    ctx.beginPath();
    ctx.moveTo(tagX + r, tagY);
    ctx.arcTo(tagX + tagW, tagY, tagX + tagW, tagY + tagH, r);
    ctx.arcTo(tagX + tagW, tagY + tagH, tagX, tagY + tagH, r);
    ctx.arcTo(tagX, tagY + tagH, tagX, tagY, r);
    ctx.arcTo(tagX, tagY, tagX + tagW, tagY, r);
    ctx.closePath();
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceText, tagX + 8, tagY + tagH / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (d.type === 'signpost') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // Marker on a stick: pole from the anchor up to a small rectangular sign,
    // with the user-typed label drawn inside it (see the generalized
    // text-editing handlers — Signpost reuses Text's editing machinery).
    const baseColor = d.color ?? '#2196F3';
    const text = d.text ?? '';
    ctx.font = '12px sans-serif';
    const textW = text.length > 0 ? ctx.measureText(text).width : 0;
    const padX = 8;
    const signH = 22;
    const signW = Math.max(30, textW + padX * 2);
    const poleH = 26;
    const signY = y - poleH - signH;

    ctx.strokeStyle = eraserHover ? '#f85149' : baseColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, signY + signH);
    ctx.stroke();

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.fillRect(x, signY, signW, signH);

    if (text.length > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + padX, signY + signH / 2 + 1);
      ctx.textBaseline = 'alphabetic';
    }

    if (selected) {
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x - 3, signY - 3, signW + 6, y - signY + 6);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'note') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // Sticky-note icon (filled rounded-ish square with a folded top-right
    // corner) marking the anchor, with the user-typed text drawn beside it.
    const baseColor = d.color ?? '#F4B400';
    const text = d.text ?? '';
    const iconSize = 16;
    const iconX = x - iconSize / 2;
    const iconY = y - iconSize / 2;
    const fold = 5;

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.moveTo(iconX, iconY);
    ctx.lineTo(iconX + iconSize - fold, iconY);
    ctx.lineTo(iconX + iconSize, iconY + fold);
    ctx.lineTo(iconX + iconSize, iconY + iconSize);
    ctx.lineTo(iconX, iconY + iconSize);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(iconX + iconSize - fold, iconY);
    ctx.lineTo(iconX + iconSize, iconY + fold);
    ctx.lineTo(iconX + iconSize - fold, iconY + fold);
    ctx.closePath();
    ctx.fill();

    ctx.font = '12px sans-serif';
    const textW = text.length > 0 ? ctx.measureText(text).width : 0;
    if (text.length > 0) {
      ctx.fillStyle = eraserHover ? '#f85149' : '#d1d4dc';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + iconSize / 2 + 6, y + 1);
      ctx.textBaseline = 'alphabetic';
    }

    if (selected) {
      const totalW = iconSize + (text.length > 0 ? 6 + textW : 0);
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(iconX - 3, iconY - 3, totalW + 6, iconSize + 6);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'callout') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // Text box offset up-and-right from the anchor, plus a leader line back
    // to the anchor point.
    const baseColor = d.color ?? '#2196F3';
    const text = d.text ?? '';
    ctx.font = '12px sans-serif';
    const lines = text.length > 0 ? text.split('\n') : [''];
    const padX = 8, padY = 6, lineH = 16;
    const textW = Math.max(10, ...lines.map((l) => ctx.measureText(l).width));
    const boxW = textW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const boxLeft = x + 24;
    const boxBottom = y - 40;
    const boxTop = boxBottom - boxH;

    ctx.strokeStyle = eraserHover ? '#f85149' : baseColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(boxLeft, boxBottom);
    ctx.stroke();

    const r = 4;
    ctx.beginPath();
    ctx.moveTo(boxLeft + r, boxTop);
    ctx.arcTo(boxLeft + boxW, boxTop, boxLeft + boxW, boxTop + boxH, r);
    ctx.arcTo(boxLeft + boxW, boxTop + boxH, boxLeft, boxTop + boxH, r);
    ctx.arcTo(boxLeft, boxTop + boxH, boxLeft, boxTop, r);
    ctx.arcTo(boxLeft, boxTop, boxLeft + boxW, boxTop, r);
    ctx.closePath();
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.fill();

    if (text.length > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => ctx.fillText(line, boxLeft + padX, boxTop + padY + i * lineH));
      ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(boxLeft - 3, boxTop - 3, boxW + 6, boxH + 6);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'comment') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    // Speech bubble — rounded-rect body plus a small triangular tail
    // pointing down at the anchor point.
    const baseColor = d.color ?? '#2196F3';
    const text = d.text ?? '';
    ctx.font = '12px sans-serif';
    const lines = text.length > 0 ? text.split('\n') : [''];
    const padX = 8, padY = 6, lineH = 16;
    const textW = Math.max(10, ...lines.map((l) => ctx.measureText(l).width));
    const boxW = textW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const tailH = 8, tailW = 10;
    const boxBottom = y - tailH;
    const boxTop = boxBottom - boxH;
    const boxLeft = x - boxW / 2;
    const r = 4;

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.moveTo(boxLeft + r, boxTop);
    ctx.arcTo(boxLeft + boxW, boxTop, boxLeft + boxW, boxTop + boxH, r);
    ctx.arcTo(boxLeft + boxW, boxTop + boxH, boxLeft, boxTop + boxH, r);
    ctx.arcTo(boxLeft, boxTop + boxH, boxLeft, boxTop, r);
    ctx.arcTo(boxLeft, boxTop, boxLeft + boxW, boxTop, r);
    ctx.closePath();
    ctx.moveTo(x - tailW / 2, boxBottom);
    ctx.lineTo(x, boxBottom + tailH);
    ctx.lineTo(x + tailW / 2, boxBottom);
    ctx.closePath();
    ctx.fill();

    if (text.length > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => ctx.fillText(line, boxLeft + padX, boxTop + padY + i * lineH));
      ctx.textBaseline = 'alphabetic';
    }

    if (selected) {
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(boxLeft - 3, boxTop - 3, boxW + 6, boxH + tailH + 6);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'text') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#d1d4dc';
    const fontSize = d.fontSize ?? 14;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    const lines = d.text.length > 0 ? d.text.split('\n') : [''];
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * (fontSize + 4)));

    if (selected) {
      const widths = lines.map((l) => ctx.measureText(l).width);
      const w = Math.max(10, ...widths);
      const h = lines.length * (fontSize + 4);
      ctx.strokeStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x - 4, y - 2, w + 8, h + 4);
      ctx.setLineDash([]);
    }

  } else if (d.type === 'priceNote') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    const lineColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    const dashPattern: number[] = d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : [];

    // line runs from the hollow start marker's edge (not its center) so the
    // marker reads as an open ring rather than a filled dot with a line through it
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const markerR = 5;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 1 : 0);
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    ctx.moveTo(x1 + ux * markerR, y1 + uy * markerR);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // hollow ring at the start point
    ctx.beginPath();
    ctx.arc(x1, y1, markerR, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = eraserHover ? '#f85149' : baseColor;
    ctx.stroke();

    // price tag at the end point
    const priceLabel = d.price2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.font = 'bold 12px sans-serif';
    const textW = ctx.measureText(priceLabel).width;
    const tagH = 22;
    const tagW = textW + 16;
    const tagX = Math.min(x2 + 8, W - tagW - 4);
    const tagY = y2 - tagH / 2;
    const r = tagH / 2;

    ctx.beginPath();
    ctx.moveTo(tagX + r, tagY);
    ctx.arcTo(tagX + tagW, tagY, tagX + tagW, tagY + tagH, r);
    ctx.arcTo(tagX + tagW, tagY + tagH, tagX, tagY + tagH, r);
    ctx.arcTo(tagX, tagY + tagH, tagX, tagY, r);
    ctx.arcTo(tagX, tagY, tagX + tagW, tagY, r);
    ctx.closePath();
    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceLabel, tagX + 8, tagY + tagH / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(x1, y1, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (d.type === 'priceRange') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const topY = Math.min(y1, y2), botY = Math.max(y1, y2);
    const baseColor = d.color ?? '#2196F3';
    const lineColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.12)' : hexToRgba(baseColor, 15);
    ctx.fillRect(lx, topY, rx - lx, botY - topY);

    // solid border on left/right/bottom, dashed on top (the box "continues" upward)
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 0.5 : 0);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(lx, topY); ctx.lineTo(lx, botY); ctx.lineTo(rx, botY); ctx.lineTo(rx, topY);
    ctx.stroke();
    ctx.setLineDash(d.dash === 'dotted' ? [2, 3] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(lx, topY); ctx.lineTo(rx, topY);
    ctx.stroke();
    ctx.setLineDash([]);

    // vertical arrow along the drag direction (point1 -> point2)
    const midX = (lx + rx) / 2;
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.stroke();
    drawArrowhead(ctx, midX, y2, y2 >= y1 ? Math.PI / 2 : -Math.PI / 2, 8);

    const priceDiff = d.price2 - d.price1;
    const pct = d.price1 !== 0 ? (priceDiff / d.price1) * 100 : 0;
    const ticks = Math.round(Math.abs(priceDiff) / 0.01);
    const label = `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) ${ticks}`;
    drawRangeLabel(ctx, midX, topY - 30, label);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'dateRange') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const topY = Math.min(y1, y2), botY = Math.max(y1, y2);
    const baseColor = d.color ?? '#2196F3';
    const lineColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.12)' : hexToRgba(baseColor, 15);
    ctx.fillRect(lx, topY, rx - lx, botY - topY);

    // solid border on left/right/top, dashed on bottom (the box "continues" downward)
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 0.5 : 0);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(lx, botY); ctx.lineTo(lx, topY); ctx.lineTo(rx, topY); ctx.lineTo(rx, botY);
    ctx.stroke();
    ctx.setLineDash(d.dash === 'dotted' ? [2, 3] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(lx, botY); ctx.lineTo(rx, botY);
    ctx.stroke();
    ctx.setLineDash([]);

    // horizontal arrow along the drag direction (point1 -> point2)
    const midY = (topY + botY) / 2;
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, midY);
    ctx.lineTo(x2, midY);
    ctx.stroke();
    drawArrowhead(ctx, x2, midY, x2 >= x1 ? 0 : Math.PI, 8);

    const lo = Math.min(d.time1, d.time2), hi = Math.max(d.time1, d.time2);
    const bars = candles.filter((c) => { const t = toChartTimeSeconds(c.t); return t >= lo && t <= hi; }).length;
    const totalSec = hi - lo;
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const timeStr = days > 0 ? `${days}d ${hours}h` : `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`;
    const label = `${bars} bar${bars === 1 ? '' : 's'}, ${timeStr}`;
    drawRangeLabel(ctx, (lx + rx) / 2, topY - 30, label);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'datePriceRange') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) { ctx.restore(); return; }

    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const topY = Math.min(y1, y2), botY = Math.max(y1, y2);
    const baseColor = d.color ?? '#2196F3';
    const lineColor = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.12)' : hexToRgba(baseColor, 15);
    ctx.fillRect(lx, topY, rx - lx, botY - topY);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = (d.width ?? 1.5) + (selected ? 0.5 : 0);
    ctx.setLineDash(d.dash === 'dotted' ? [2, 3] : d.dash === 'dashed' ? [6, 4] : []);
    ctx.strokeRect(lx, topY, rx - lx, botY - topY);
    ctx.setLineDash([]);

    // both readouts get an arrow: vertical (price) through the midpoint of
    // the drag direction, horizontal (date) through the box's vertical center
    const midX = (lx + rx) / 2;
    const midY = (topY + botY) / 2;
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.stroke();
    drawArrowhead(ctx, midX, y2, y2 >= y1 ? Math.PI / 2 : -Math.PI / 2, 8);
    ctx.beginPath();
    ctx.moveTo(x1, midY);
    ctx.lineTo(x2, midY);
    ctx.stroke();
    drawArrowhead(ctx, x2, midY, x2 >= x1 ? 0 : Math.PI, 8);

    const priceDiff = d.price2 - d.price1;
    const pct = d.price1 !== 0 ? (priceDiff / d.price1) * 100 : 0;
    const ticks = Math.round(Math.abs(priceDiff) / 0.01);
    const priceLabel = `${priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) ${ticks} ticks`;

    const lo = Math.min(d.time1, d.time2), hi = Math.max(d.time1, d.time2);
    const bars = candles.filter((c) => { const t = toChartTimeSeconds(c.t); return t >= lo && t <= hi; }).length;
    const totalSec = hi - lo;
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const timeStr = days > 0 ? `${days}d ${hours}h` : `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`;
    const dateLabel = `${bars} bar${bars === 1 ? '' : 's'}, ${timeStr}`;

    drawRangeLabel(ctx, midX, topY - 42, [priceLabel, dateLabel]);

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'longPosition' || d.type === 'shortPosition') {
    const x1 = timeToX(chart, d.time1);
    const x2 = timeToX(chart, d.time2);
    const yEntry  = priceToY(series, d.entryPrice);
    const yTarget = priceToY(series, d.targetPrice);
    const yStop   = priceToY(series, d.stopPrice);
    if (x1 == null || x2 == null || yEntry == null || yTarget == null || yStop == null) { ctx.restore(); return; }

    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const profitColor = d.profitColor ?? '#089981';
    const lossColor = d.lossColor ?? '#F23645';

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.15)' : hexToRgba(profitColor, 20);
    ctx.fillRect(lx, Math.min(yEntry, yTarget), rx - lx, Math.abs(yEntry - yTarget));
    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.15)' : hexToRgba(lossColor, 20);
    ctx.fillRect(lx, Math.min(yEntry, yStop), rx - lx, Math.abs(yEntry - yStop));

    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = eraserHover ? '#f85149' : profitColor;
    ctx.beginPath(); ctx.moveTo(lx, yTarget); ctx.lineTo(rx, yTarget); ctx.stroke();
    ctx.strokeStyle = eraserHover ? '#f85149' : lossColor;
    ctx.beginPath(); ctx.moveTo(lx, yStop); ctx.lineTo(rx, yStop); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = eraserHover ? '#f85149' : '#787B86';
    ctx.lineWidth = 1.5 + (selected ? 0.5 : 0);
    ctx.beginPath(); ctx.moveTo(lx, yEntry); ctx.lineTo(rx, yEntry); ctx.stroke();

    const fmt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const profitPct = Math.abs((d.targetPrice - d.entryPrice) / d.entryPrice * 100);
    const lossPct   = Math.abs((d.stopPrice - d.entryPrice) / d.entryPrice * 100);
    const rr = lossPct > 0 ? profitPct / lossPct : 0;

    // Labels sit *inside* their zone (offset toward the entry line) rather than
    // outside the box's top/bottom edges — the floating style toolbar renders
    // right above the box's top edge and would otherwise hide them.
    ctx.font = '10px monospace';
    ctx.fillStyle = eraserHover ? '#f85149' : profitColor;
    ctx.fillText(`Target ${fmt(d.targetPrice)}  +${profitPct.toFixed(2)}%`, lx + 6, yTarget < yEntry ? yTarget + 14 : yTarget - 6);
    ctx.fillStyle = eraserHover ? '#f85149' : lossColor;
    ctx.fillText(`Stop ${fmt(d.stopPrice)}  -${lossPct.toFixed(2)}%`, lx + 6, yStop < yEntry ? yStop + 14 : yStop - 6);
    ctx.fillStyle = eraserHover ? '#f85149' : '#d1d4dc';
    ctx.fillText(`Entry ${fmt(d.entryPrice)}`, lx + 6, yEntry - 6);

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = eraserHover ? '#f85149' : '#d1d4dc';
    ctx.fillText(`Risk/Reward 1:${rr.toFixed(2)}`, lx + 6, yEntry + 14);

    if (selected) {
      const midX = (lx + rx) / 2;
      ctx.fillStyle = eraserHover ? '#f85149' : profitColor;
      ctx.fillRect(midX - 4, yTarget - 4, 8, 8);
      ctx.fillStyle = eraserHover ? '#f85149' : lossColor;
      ctx.fillRect(midX - 4, yStop - 4, 8, 8);
      ctx.fillStyle = eraserHover ? '#f85149' : '#787B86';
      ctx.fillRect(rx - 4, yEntry - 4, 8, 8);
    }

  } else if (d.type === 'fibonacci' || d.type === 'fibExtension') {
    const xH = timeToX(chart, d.timeHigh);
    const yH = priceToY(series, d.priceHigh);
    const xL = timeToX(chart, d.timeLow);
    const yL = priceToY(series, d.priceLow);
    if (xH == null || yH == null || xL == null || yL == null) { ctx.restore(); return; }

    const xLeft  = Math.min(xH, xL);
    const xRight = Math.max(xH, xL);
    const range  = d.priceHigh - d.priceLow;

    // "Don't extend" (default) keeps level lines between the two anchors, like
    // TradingView's Extend dropdown — Left/Right/Both stretch to the chart edge.
    const extend = d.extend ?? 'none';
    const spanLeft  = extend === 'left'  || extend === 'both' ? 0 : xLeft;
    const spanRight = extend === 'right' || extend === 'both' ? W : xRight;

    const levelDash: number[] = d.levelDash === 'dashed' ? [8, 4] : d.levelDash === 'solid' ? [] : [4, 3];

    fibLevelsFor(d.type).forEach(({ pct: defaultPct, color: defaultColor }, i) => {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) return;
      const pct = cfg?.pct ?? defaultPct;
      const price = d.priceHigh - pct * range;
      const y = priceToY(series, price);
      if (y == null) return;

      const lineColor = eraserHover ? '#f85149' : (cfg?.color ?? defaultColor);
      const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      drawFibLevelLine(
        ctx, lineColor, y, spanLeft, spanRight,
        d.levelWidth ?? (pct === 0.618 ? 1.5 : 1), levelDash, selected ? 1 : 0.85,
        `${pct}  ${priceStr}`, Math.min(xRight + 4, W - 120),
      );
    });

    // shaded region
    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.06)' : 'rgba(33,150,243,0.04)';
    ctx.fillRect(xLeft, Math.min(yH, yL), xRight - xLeft, Math.abs(yH - yL));

    // diagonal line connecting the two anchor points — TradingView calls this
    // the "Trend line"; thin dotted by default, toggleable in the settings panel
    if (d.lineVisible !== false) {
      const connColor = eraserHover ? '#f85149' : hexToRgba(d.lineColor ?? '#787B86', 100);
      const connDash: number[] =
        d.lineDash === 'dashed' ? [8, 4] : d.lineDash === 'solid' ? [] : [2, 3];
      ctx.strokeStyle = connColor;
      ctx.lineWidth = d.lineWidth ?? 1;
      ctx.setLineDash(connDash);
      ctx.beginPath();
      ctx.moveTo(xH, yH);
      ctx.lineTo(xL, yL);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : '#2196F3';
      ctx.beginPath();
      ctx.arc(xH, yH, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(xL, yL, 4, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (d.type === 'trendFibExtension') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) { ctx.restore(); return; }
    const { x1: xA, y1: yA, x2: xB, y2: yB, x3: xC, y3: yC } = pts3;

    const xLeft  = Math.min(xA, xB, xC);
    const xRight = Math.max(xA, xB, xC);
    // the A->B move, projected forward from origin C
    const move = d.price2 - d.price1;

    const levelDash: number[] = d.levelDash === 'dashed' ? [8, 4] : d.levelDash === 'solid' ? [] : [4, 3];

    fibLevelsFor(d.type).forEach(({ pct: defaultPct, color: defaultColor }, i) => {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) return;
      const pct = cfg?.pct ?? defaultPct;
      const price = d.price3 + move * pct;
      const y = priceToY(series, price);
      if (y == null) return;

      const lineColor = eraserHover ? '#f85149' : (cfg?.color ?? defaultColor);
      const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      drawFibLevelLine(
        ctx, lineColor, y, xLeft, xRight,
        d.levelWidth ?? (pct === 0.618 ? 1.5 : 1), levelDash, selected ? 1 : 0.85,
        `${pct}  ${priceStr}`, Math.min(xRight + 4, W - 120),
      );
    });

    // A->B->C connecting lines so the projection structure stays visible
    if (d.lineVisible !== false) {
      const connColor = eraserHover ? '#f85149' : hexToRgba(d.lineColor ?? '#787B86', 100);
      const connDash: number[] =
        d.lineDash === 'dashed' ? [8, 4] : d.lineDash === 'solid' ? [] : [2, 3];
      ctx.strokeStyle = connColor;
      ctx.lineWidth = d.lineWidth ?? 1;
      ctx.setLineDash(connDash);
      ctx.beginPath();
      ctx.moveTo(xA, yA);
      ctx.lineTo(xB, yB);
      ctx.lineTo(xC, yC);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (selected) {
      ctx.fillStyle = eraserHover ? '#f85149' : '#2196F3';
      for (const [hx, hy] of [[xA, yA], [xB, yB], [xC, yC]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (d.type === 'fibChannel') {
    const lines = computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!lines) { ctx.restore(); return; }
    const { x1, y1, x2, y2, y1b, y2b } = lines;

    const levelDash: number[] = d.levelDash === 'dashed' ? [8, 4] : d.levelDash === 'solid' ? [] : [4, 3];

    fibLevelsFor(d.type).forEach(({ pct: defaultPct, color: defaultColor }, i) => {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) return;
      const pct = cfg?.pct ?? defaultPct;
      // each level is the baseline shifted toward the offset line by `pct`
      // of the channel width — parallel to the baseline, not horizontal.
      const ly1 = y1 + (y1b - y1) * pct;
      const ly2 = y2 + (y2b - y2) * pct;

      const lineColor = eraserHover ? '#f85149' : (cfg?.color ?? defaultColor);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = d.levelWidth ?? (pct === 0.618 ? 1.5 : 1);
      ctx.setLineDash(levelDash);
      ctx.globalAlpha = selected ? 1 : 0.85;
      ctx.beginPath();
      ctx.moveTo(x1, ly1);
      ctx.lineTo(x2, ly2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = lineColor;
      ctx.font = '10px monospace';
      ctx.fillText(`${pct}`, Math.min(x2 + 4, W - 60), ly2 - 3);
    });

    if (selected) {
      const handleColor = eraserHover ? '#f85149' : '#2196F3';
      ctx.fillStyle = handleColor;
      for (const [hx, hy] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;
      ctx.fillRect(wx - 4, wy - 4, 8, 8);
    }

  } else if (d.type === 'anchoredVwap') {
    const baseColor = d.color ?? '#f0b90b';
    const anchorX = timeToX(chart, d.time);
    const anchorY = priceToY(series, d.price);
    if (anchorX == null || anchorY == null) { ctx.restore(); return; }

    const data = computeAnchoredVwapData(d, candles);
    const pts = (data?.points ?? [])
      .map((p) => ({ x: timeToX(chart, toChartTimeSeconds(p.time)), y: priceToY(series, p.vwap) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);

    if (pts.length < 2) {
      // not enough candle data at the anchor yet — just show the anchor dot
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.strokeStyle = eraserHover ? '#f85149' : baseColor;
    ctx.lineWidth = (d.width ?? 2) + (selected ? 0.5 : 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, 4, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      ctx.fillText('Anchored VWAP', anchorX + 8, anchorY - 8);
    }
  }

  ctx.restore();
}

// Shared by Parallel Channel and Rotated Rectangle: a baseline (price1/time1 →
// price2/time2) plus a third point whose PRICE offset from the baseline is
// applied uniformly to get a second, parallel line. (This is a vertical/price
// offset, not a true screen-perpendicular one — price and time axes have
// independent scales, so "perpendicular in pixels" doesn't correspond to
// anything meaningful in price/time space. This approximation is what makes
// the shape stay anchored correctly across pan/zoom.)
export function computeParallelOffset(
  price1: number, time1: number, price2: number, time2: number, price3: number, time3: number,
  chart: IChartApi, series: ISeriesApi<'Candlestick'>,
): { x1: number; y1: number; x2: number; y2: number; y1b: number; y2b: number } | null {
  const x1 = timeToX(chart, time1);
  const y1 = priceToY(series, price1);
  const x2 = timeToX(chart, time2);
  const y2 = priceToY(series, price2);
  if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
  const priceAt = (t: number) =>
    time2 === time1 ? price1 : price1 + (price2 - price1) * (t - time1) / (time2 - time1);
  const offset = price3 - priceAt(time3);
  const y1b = priceToY(series, price1 + offset);
  const y2b = priceToY(series, price2 + offset);
  if (y1b == null || y2b == null) return null;
  return { x1, y1, x2, y2, y1b, y2b };
}

function getChannelLines(
  d: Extract<Drawing, { type: 'channel' }>,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
): { x1: number; y1: number; x2: number; y2: number; y1b: number; y2b: number } | null {
  return computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
}

// Flat Top/Bottom: unlike Parallel Channel's offset baseline, both lines are
// flat — Line A at price1, Line B at price3, both spanning [time1, time2].
// Returns the same {x1,y1,x2,y2,y1b,y2b} shape as computeParallelOffset (with
// y2===y1 and y2b===y1b) so rendering/hitTest can share the same fill/stroke
// code path as Parallel Channel.
function getFlatChannelLines(
  d: Extract<Drawing, { type: 'flatChannel' }>,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
): { x1: number; y1: number; x2: number; y2: number; y1b: number; y2b: number } | null {
  const x1 = timeToX(chart, d.time1);
  const x2 = timeToX(chart, d.time2);
  const y1 = priceToY(series, d.price1);
  const y1b = priceToY(series, d.price3);
  if (x1 == null || x2 == null || y1 == null || y1b == null) return null;
  return { x1, y1, x2, y2: y1, y1b, y2b: y1b };
}

// Arrow Marker's solid shape: a thin tapered shaft from the tail (a sharp
// point) up to a "shoulder" ~70% of the way to the head, where it flares
// abruptly out to a wide arrowhead base, then sweeps back in to a sharp point
// at the head — the flare is what makes the tip actually read as an
// arrowhead rather than just a tapered sliver. Both the shaft width and the
// head width scale with the segment length (clamped), so dragging either
// endpoint further apart grows the whole icon proportionally — that's the
// tool's "resize."
function arrowMarkerDartPoints(
  x1: number, y1: number, x2: number, y2: number,
): { x: number; y: number }[] | null {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;

  const headBaseFrac   = 0.7;
  const shaftHalfWidth = Math.max(2, Math.min(9, len * 0.035));
  const headHalfWidth  = Math.max(9, Math.min(32, len * 0.16));
  const bx = x1 + dx * headBaseFrac;
  const by = y1 + dy * headBaseFrac;

  return [
    { x: x1, y: y1 },                                             // tail (point)
    { x: bx + px * shaftHalfWidth, y: by + py * shaftHalfWidth }, // shoulder, left
    { x: bx + px * headHalfWidth,  y: by + py * headHalfWidth },  // arrowhead flare, left
    { x: x2, y: y2 },                                             // head (point)
    { x: bx - px * headHalfWidth,  y: by - py * headHalfWidth },  // arrowhead flare, right
    { x: bx - px * shaftHalfWidth, y: by - py * shaftHalfWidth }, // shoulder, right
  ];
}

function pointInPolygon(mx: number, my: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    const intersects = yi > my !== yj > my && mx < ((xj - xi) * (my - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Shared by Triangle/Arc/Curve/Double Curve — all four store exactly 3
// independent anchor points (price/time each), unlike Parallel Channel's
// baseline+offset shape, so they share one screen-space projection helper.
function get3PointScreen(
  price1: number, time1: number, price2: number, time2: number, price3: number, time3: number,
  chart: IChartApi, series: ISeriesApi<'Candlestick'>,
): { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number } | null {
  const x1 = timeToX(chart, time1), y1 = priceToY(series, price1);
  const x2 = timeToX(chart, time2), y2 = priceToY(series, price2);
  const x3 = timeToX(chart, time3), y3 = priceToY(series, price3);
  if (x1 == null || y1 == null || x2 == null || y2 == null || x3 == null || y3 == null) return null;
  return { x1, y1, x2, y2, x3, y3 };
}

// Sector: pixel-space wedge geometry from apex (x1,y1) toward ray-A end
// (x2,y2) and ray-B end (x3,y3). Shared by the render branch and hitTest so
// the two agree on the degenerate cases — which occur on every preview frame
// between clicks 2 and 3, since the preview sets p3 = p2. `diff` is the signed
// sweep from ray A to ray B normalized into (-PI, PI]; `ccw` is the matching
// ctx.arc anticlockwise flag (canvas angles grow clockwise, y down).
type SectorGeometry =
  | { kind: 'apex' }                  // both rays < 1px — nothing but the apex
  | { kind: 'rayA' } | { kind: 'rayB' } // only that ray has length
  | { kind: 'collinear' }             // rays nearly collinear — no wedge/arc/label
  | { kind: 'wedge'; aA: number; aB: number; diff: number; ccw: boolean };

function sectorGeometry(
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
): SectorGeometry {
  const lenA = Math.hypot(x2 - x1, y2 - y1);
  const lenB = Math.hypot(x3 - x1, y3 - y1);
  if (lenA < 1 && lenB < 1) return { kind: 'apex' };
  if (lenB < 1) return { kind: 'rayA' };
  if (lenA < 1) return { kind: 'rayB' };
  const cross = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  if (Math.abs(cross) / (lenA * lenB) < 0.01) return { kind: 'collinear' };
  const aA = Math.atan2(y2 - y1, x2 - x1);
  const aB = Math.atan2(y3 - y1, x3 - x1);
  let diff = aB - aA;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return { kind: 'wedge', aA, aB, diff, ccw: diff < 0 };
}

// Position Forecast: pixel-space path/zone geometry from start (x1,y1) via
// pullback (x2,y2) to target (x3,y3). Shared by the render branch and hitTest
// so the two agree on the degenerate cases — 'leg1' occurs on every preview
// frame between clicks 2 and 3, since the preview sets p3 = p2. `zone` is the
// start->target move rect, null when it has no width (p3 straight above/below p1).
type ForecastGeometry =
  | { kind: 'leg1' } // p3 within 1px of p2 — only the p1->p2 segment exists
  | { kind: 'full'; zone: { lx: number; rx: number; ty: number; by: number } | null };

function forecastGeometry(
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
): ForecastGeometry {
  if (Math.hypot(x3 - x2, y3 - y2) < 1) return { kind: 'leg1' };
  const zone = Math.abs(x3 - x1) < 1 ? null : {
    lx: Math.min(x1, x3), rx: Math.max(x1, x3),
    ty: Math.min(y1, y3), by: Math.max(y1, y3),
  };
  return { kind: 'full', zone };
}

// Shared by Arc/Curve (identical math — start p1, end p2, control p3) and by
// Double Curve's two segments. `t` in [0,1].
function quadraticPoint(
  x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  };
}

function sampleQuadratic(
  x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, steps = 20,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) pts.push(quadraticPoint(x1, y1, cx, cy, x2, y2, i / steps));
  return pts;
}

// Hit-test a quadratic curve by sampling it into short segments and testing
// distance to each one — used by both Arc and Curve (and twice by Double Curve).
function hitTestQuadratic(
  mx: number, my: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, tol: number,
): boolean {
  const pts = sampleQuadratic(x1, y1, cx, cy, x2, y2);
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(mx, my, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < tol) return true;
  }
  return false;
}

// Double Curve's S-shape: two quadratic segments (p1->p2, p2->p3) whose
// control points aren't stored — they're derived here as perpendicular
// offsets from each segment's midpoint, in OPPOSITE directions, so the curve
// bulges one way then the other instead of bowing symmetrically like a single
// arc. Recomputed from the current p1/p2/p3 screen positions on every call,
// so dragging any anchor updates the S-shape live without extra state.
function doubleCurveControls(
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
): { c1: { x: number; y: number }; c2: { x: number; y: number } } {
  const perpOffset = (ax: number, ay: number, bx: number, by: number, magnitude: number) => {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    return { x: (ax + bx) / 2 + px * magnitude, y: (ay + by) / 2 + py * magnitude };
  };
  const len1 = Math.hypot(x2 - x1, y2 - y1);
  const len2 = Math.hypot(x3 - x2, y3 - y2);
  return {
    c1: perpOffset(x1, y1, x2, y2, len1 * 0.25),
    c2: perpOffset(x2, y2, x3, y3, -(len2 * 0.25)),
  };
}

// ── hit-test a drawing (returns true if mouse is close enough to select) ─────

function hitTest(
  d: Drawing,
  mx: number,
  my: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  candles: Candle[],
): boolean {
  const TOL = 8;

  if (d.type === 'hline') {
    const y = priceToY(series, d.price);
    return y != null && Math.abs(my - y) < TOL;
  }

  if (d.type === 'hray') {
    const y  = priceToY(series, d.price);
    const x0 = timeToX(chart, d.time);
    if (y == null || x0 == null) return false;
    return mx >= x0 - TOL && Math.abs(my - y) < TOL;
  }

  if (d.type === 'vline') {
    const x = timeToX(chart, d.time);
    return x != null && Math.abs(mx - x) < TOL;
  }

  if (d.type === 'crossline') {
    const y = priceToY(series, d.price);
    const x = timeToX(chart, d.time);
    if (y == null || x == null) return false;
    return Math.abs(my - y) < TOL || Math.abs(mx - x) < TOL;
  }

  if (d.type === 'gannFan') {
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1 = timeToX(chart, d.time2);
    const y1 = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1 == null || y1 == null) return false;
    if (Math.hypot(mx - x0, my - y0) < TOL || Math.hypot(mx - x1, my - y1) < TOL) return true;

    const dx = x1 - x0, dy = y1 - y0;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return false;

    // Same 7 ray dy-scalings as the render branch — test the mouse against
    // each one's on-screen segment (extended far past the visible area; mx/my
    // are always within the canvas, so this matches the exact edge-crossing
    // segment the renderer draws, without needing W/H here).
    const yScales = [1, 0.5, 1 / 3, 0.25, 2, 3, 4];
    const FAR = 1e6;
    for (const yScale of yScales) {
      const rdx = dx, rdy = dy * yScale;
      const len = Math.hypot(rdx, rdy) || 1;
      const fx = x0 + (rdx / len) * FAR;
      const fy = y0 + (rdy / len) * FAR;
      if (distToSegment(mx, my, x0, y0, fx, fy) < TOL) return true;
    }
    return false;
  }

  if (d.type === 'fibSpeedFan') {
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1 = timeToX(chart, d.time2);
    const y1 = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1 == null || y1 == null) return false;
    if (Math.hypot(mx - x0, my - y0) < TOL || Math.hypot(mx - x1, my - y1) < TOL) return true;

    const dx = x1 - x0, dy = y1 - y0;
    // degenerate — same base-segment-only fallback as the render branch
    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return distToSegment(mx, my, x0, y0, x1, y1) < TOL;

    // Same FIB_FAN_RATIOS (1 - r) dy-scalings as the render branch, each ray
    // extended far past the visible area (same trick as gannFan's hitTest).
    const FAR = 1e6;
    for (const r of FIB_FAN_RATIOS) {
      const rdx = dx, rdy = dy * (1 - r);
      const len = Math.hypot(rdx, rdy) || 1;
      const fx = x0 + (rdx / len) * FAR;
      const fy = y0 + (rdy / len) * FAR;
      if (distToSegment(mx, my, x0, y0, fx, fy) < TOL) return true;
    }
    return false;
  }

  if (d.type === 'fibCircles') {
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1 = timeToX(chart, d.time2);
    const y1 = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1 == null || y1 == null) return false;
    if (Math.hypot(mx - x0, my - y0) < TOL || Math.hypot(mx - x1, my - y1) < TOL) return true;

    const baseR = Math.hypot(x1 - x0, y1 - y0);
    // degenerate — no rings rendered, so only the anchors are hittable
    if (baseR < 1) return false;

    // Same FIB_CIRCLE_RATIOS rings as the render branch: an exact ring-distance
    // test, since every ring is a true circle around the center.
    const dist = Math.hypot(mx - x0, my - y0);
    return FIB_CIRCLE_RATIOS.some((r) => Math.abs(dist - baseR * r) < TOL);
  }

  if (d.type === 'fibSpeedArcs') {
    const x0 = timeToX(chart, d.time1);
    const y0 = priceToY(series, d.price1);
    const x1 = timeToX(chart, d.time2);
    const y1 = priceToY(series, d.price2);
    if (x0 == null || y0 == null || x1 == null || y1 == null) return false;
    if (Math.hypot(mx - x0, my - y0) < TOL || Math.hypot(mx - x1, my - y1) < TOL) return true;

    const baseR = Math.hypot(x1 - x0, y1 - y0);
    // degenerate — no arcs rendered, so only the anchors are hittable
    if (baseR < 1) return false;

    // Same FIB_ARC_RATIOS semicircles as the render branch: a ring-distance
    // test restricted to the half the arcs are drawn on (with TOL slack at
    // the baseline so the arc endpoints stay grabbable).
    const up = y1 <= y0;
    const dist = Math.hypot(mx - x0, my - y0);
    const onSide = up ? my <= y0 + TOL : my >= y0 - TOL;
    return onSide && FIB_ARC_RATIOS.some((r) => Math.abs(dist - baseR * r) < TOL);
  }

  if (d.type === 'cyclicLines' || d.type === 'timeCycles') {
    // Same repeating-vertical-line spacing as the render branch (spacing =
    // x2 - x1), but tested in O(1): round to the nearest cycle index k
    // instead of walking every line across the canvas — hitTest doesn't have
    // the canvas width W available, and this needs it, so it doesn't loop.
    const x1 = timeToX(chart, d.time1);
    const x2 = timeToX(chart, d.time2);
    if (x1 == null || x2 == null) return false;
    const spacing = x2 - x1;
    if (Math.abs(spacing) < 1) return Math.abs(mx - x1) < TOL;
    const k = Math.round((mx - x1) / spacing);
    const nearestX = x1 + k * spacing;
    return Math.abs(mx - nearestX) < TOL;
  }

  if (d.type === 'fibTimeZone') {
    // Own branch — fixed 9-element Fibonacci offset set, so just check each
    // candidate x directly (same set the render branch computes) rather than
    // cyclicLines' O(1) rounding trick, which assumes an infinite repeat.
    const x1 = timeToX(chart, d.time1);
    const x2 = timeToX(chart, d.time2);
    if (x1 == null || x2 == null) return false;
    const spacing = x2 - x1;
    if (Math.abs(spacing) < 1) return Math.abs(mx - x1) < TOL;
    if (Math.abs(mx - x1) < TOL) return true;
    for (const fibK of FIB_TIME_OFFSETS) {
      const x = x1 + fibK * spacing;
      if (Math.abs(mx - x) < TOL) return true;
    }
    return false;
  }

  if (d.type === 'sineLine') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;

    const wavelength = Math.abs(x2 - x1);
    if (wavelength < 1) return distToSegment(mx, my, x1, y1, x2, y2) < TOL;

    // The sine wave is an explicit function of x (unlike the arc/curve's
    // parametric Bezier), so its y at the mouse's own x is exact — no need to
    // sample into segments the way hitTestQuadratic does for curves.
    const amplitude = Math.abs(y2 - y1);
    const midY = (y1 + y2) / 2;
    const y = midY + amplitude * Math.sin((2 * Math.PI * (mx - x1)) / wavelength);
    return Math.abs(my - y) < TOL;
  }

  if (d.type === 'trendline' || d.type === 'ray' || d.type === 'extendedLine' ||
      d.type === 'infoLine' || d.type === 'trendAngle') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    // Testing the core p1-p2 segment (not the extended portion) is enough for
    // selection/erase — matches Trend Line's own hit-test.
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL;
  }

  if (d.type === 'channel') {
    const lines = getChannelLines(d, chart, series);
    if (!lines) return false;
    const { x1, y1, x2, y2, y1b, y2b } = lines;
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL || distToSegment(mx, my, x1, y1b, x2, y2b) < TOL;
  }

  if (d.type === 'flatChannel') {
    const lines = getFlatChannelLines(d, chart, series);
    if (!lines) return false;
    const { x1, y1, x2, y2, y1b, y2b } = lines;
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL || distToSegment(mx, my, x1, y1b, x2, y2b) < TOL;
  }

  if (d.type === 'disjointChannel') {
    const xA1 = timeToX(chart, d.timeA1), yA1 = priceToY(series, d.priceA1);
    const xA2 = timeToX(chart, d.timeA2), yA2 = priceToY(series, d.priceA2);
    const xB1 = timeToX(chart, d.timeB1), yB1 = priceToY(series, d.priceB1);
    const xB2 = timeToX(chart, d.timeB2), yB2 = priceToY(series, d.priceB2);
    if (xA1 == null || yA1 == null || xA2 == null || yA2 == null ||
        xB1 == null || yB1 == null || xB2 == null || yB2 == null) return false;
    return distToSegment(mx, my, xA1, yA1, xA2, yA2) < TOL || distToSegment(mx, my, xB1, yB1, xB2, yB2) < TOL;
  }

  if (d.type === 'regression') {
    const reg = computeRegression(candles, d.time1, d.time2);
    if (!reg) return false;
    const xS = timeToX(chart, reg.startTime);
    const xE = timeToX(chart, reg.endTime);
    const yS = priceToY(series, reg.midStart);
    const yE = priceToY(series, reg.midEnd);
    if (xS == null || xE == null || yS == null || yE == null) return false;
    return distToSegment(mx, my, xS, yS, xE, yE) < TOL;
  }

  if (d.type === 'rectangle' || d.type === 'gannBox' || d.type === 'gannSquare') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const ty = Math.min(y1, y2), by = Math.max(y1, y2);
    // near any edge (outer box edges are enough for selection/erase — the
    // internal grid/fan lines don't need their own hit-test)
    const nearLeft   = Math.abs(mx - lx) < TOL && my >= ty - TOL && my <= by + TOL;
    const nearRight  = Math.abs(mx - rx) < TOL && my >= ty - TOL && my <= by + TOL;
    const nearTop    = Math.abs(my - ty) < TOL && mx >= lx - TOL && mx <= rx + TOL;
    const nearBottom = Math.abs(my - by) < TOL && mx >= lx - TOL && mx <= rx + TOL;
    return nearLeft || nearRight || nearTop || nearBottom;
  }

  if (d.type === 'rotatedRectangle') {
    const lines = computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!lines) return false;
    const { x1, y1, x2, y2, y1b, y2b } = lines;
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL ||
      distToSegment(mx, my, x2, y2, x2, y2b) < TOL ||
      distToSegment(mx, my, x2, y2b, x1, y1b) < TOL ||
      distToSegment(mx, my, x1, y1b, x1, y1) < TOL;
  }

  if (d.type === 'circle' || d.type === 'ellipse') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    if (rx < 2 || ry < 2) return false;
    // nearest point on the ellipse boundary along the ray from center to the click
    const theta = Math.atan2(my - cy, mx - cx);
    const bx = cx + rx * Math.cos(theta), by = cy + ry * Math.sin(theta);
    return Math.hypot(mx - bx, my - by) < TOL;
  }

  if (d.type === 'triangle') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) return false;
    const { x1, y1, x2, y2, x3, y3 } = pts3;
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL ||
      distToSegment(mx, my, x2, y2, x3, y3) < TOL ||
      distToSegment(mx, my, x3, y3, x1, y1) < TOL ||
      pointInPolygon(mx, my, [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }]);
  }

  if (d.type === 'sector') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) return false;
    const { x1, y1, x2, y2, x3, y3 } = pts3;
    const geo = sectorGeometry(x1, y1, x2, y2, x3, y3);
    if (geo.kind === 'apex') return Math.hypot(mx - x1, my - y1) < TOL;

    // Rays render out to the chart edge; hitTest has no canvas size, so test
    // against a segment long enough to outrun any realistic canvas instead.
    const FAR = 1e5;
    const nearRay = (px: number, py: number) => {
      const len = Math.hypot(px - x1, py - y1);
      return distToSegment(mx, my, x1, y1, x1 + (px - x1) / len * FAR, y1 + (py - y1) / len * FAR) < TOL;
    };
    const nearA = geo.kind !== 'rayB' && nearRay(x2, y2);
    const nearB = geo.kind !== 'rayA' && nearRay(x3, y3);
    if (nearA || nearB) return true;
    if (geo.kind !== 'wedge') return false;

    // Inside the wedge: the mouse's angle from the apex lies within the sweep
    // from ray A toward ray B. The fill's radius always reaches past the
    // canvas, so any on-canvas point within the sweep is inside.
    let rel = Math.atan2(my - y1, mx - x1) - geo.aA;
    while (rel <= -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    return geo.diff > 0 ? rel >= 0 && rel <= geo.diff : rel <= 0 && rel >= geo.diff;
  }

  if (d.type === 'fibWedge') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) return false;
    const { x1, y1, x2, y2, x3, y3 } = pts3;
    if (Math.hypot(mx - x1, my - y1) < TOL || Math.hypot(mx - x2, my - y2) < TOL ||
        Math.hypot(mx - x3, my - y3) < TOL) return true;

    const geo = sectorGeometry(x1, y1, x2, y2, x3, y3);
    const baseR = Math.hypot(x2 - x1, y2 - y1);
    // Same edge segments as the render branch: edge A to p2; in the wedge
    // state edge B stops at the r=1 arc, while the rayB state strokes to p3.
    if (geo.kind === 'apex') return false;
    if (geo.kind === 'rayB') return distToSegment(mx, my, x1, y1, x3, y3) < TOL;
    if (distToSegment(mx, my, x1, y1, x2, y2) < TOL) return true;
    if (geo.kind !== 'wedge' || baseR < 1) return false;
    if (distToSegment(mx, my, x1, y1, x1 + Math.cos(geo.aB) * baseR, y1 + Math.sin(geo.aB) * baseR) < TOL) return true;

    // Same FIB_WEDGE_RATIOS arcs as the render branch: a ring-distance test
    // restricted to the wedge's sweep (Sector's angle-in-sweep test). No
    // "inside the wedge" hit — nothing is filled.
    let rel = Math.atan2(my - y1, mx - x1) - geo.aA;
    while (rel <= -Math.PI) rel += Math.PI * 2;
    while (rel > Math.PI) rel -= Math.PI * 2;
    const inSweep = geo.diff > 0 ? rel >= 0 && rel <= geo.diff : rel <= 0 && rel >= geo.diff;
    const dist = Math.hypot(mx - x1, my - y1);
    return inSweep && FIB_WEDGE_RATIOS.some((r) => Math.abs(dist - baseR * r) < TOL);
  }

  if (d.type === 'positionForecast') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) return false;
    const { x1, y1, x2, y2, x3, y3 } = pts3;
    const geo = forecastGeometry(x1, y1, x2, y2, x3, y3);
    if (distToSegment(mx, my, x1, y1, x2, y2) < TOL) return true;
    if (geo.kind === 'leg1') return false;
    if (distToSegment(mx, my, x2, y2, x3, y3) < TOL) return true;
    const z = geo.zone;
    return z != null && mx >= z.lx && mx <= z.rx && my >= z.ty && my <= z.by;
  }

  if (d.type === 'arc' || d.type === 'curve') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) return false;
    const { x1, y1, x2, y2, x3: cx, y3: cy } = pts3;
    return hitTestQuadratic(mx, my, x1, y1, cx, cy, x2, y2, TOL);
  }

  if (d.type === 'doubleCurve') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) return false;
    const { x1, y1, x2, y2, x3, y3 } = pts3;
    const { c1, c2 } = doubleCurveControls(x1, y1, x2, y2, x3, y3);
    return hitTestQuadratic(mx, my, x1, y1, c1.x, c1.y, x2, y2, TOL) ||
      hitTestQuadratic(mx, my, x2, y2, c2.x, c2.y, x3, y3, TOL);
  }

  if (d.type === 'path' || d.type === 'polyline' || d.type === 'brush' || d.type === 'highlighter' ||
      d.type === 'abcd' || d.type === 'xabcd' || d.type === 'cypher' || d.type === 'threeDrives' || d.type === 'headShoulders') {
    const pts = d.points
      .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(mx, my, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < TOL) return true;
    }
    return false;
  }

  if (d.type === 'anchoredVwap') {
    const anchorX = timeToX(chart, d.time);
    const anchorY = priceToY(series, d.price);
    if (anchorX != null && anchorY != null && Math.hypot(mx - anchorX, my - anchorY) < TOL + 4) return true;

    const data = computeAnchoredVwapData(d, candles);
    const pts = (data?.points ?? [])
      .map((p) => ({ x: timeToX(chart, toChartTimeSeconds(p.time)), y: priceToY(series, p.vwap) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(mx, my, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < TOL) return true;
    }
    return false;
  }

  if (d.type === 'arrow') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    if (d.variant === 'marker') {
      const dart = arrowMarkerDartPoints(x1, y1, x2, y2);
      return dart != null && pointInPolygon(mx, my, dart);
    }
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL;
  }

  if (d.type === 'arrowMark') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const s = d.size ?? 20;
    const dir = d.variant === 'up' ? 1 : -1;
    const bodyEnd = y + dir * s;
    const top = Math.min(y, bodyEnd), bottom = Math.max(y, bodyEnd);
    return mx >= x - s / 2 - TOL && mx <= x + s / 2 + TOL && my >= top - TOL && my <= bottom + TOL;
  }

  if (d.type === 'pin') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const s = d.size ?? 20;
    return mx >= x - s / 2 - TOL && mx <= x + s / 2 + TOL && my >= y - s - TOL && my <= y + TOL;
  }

  if (d.type === 'flagMark') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const s = d.size ?? 20;
    const flagW = s * 0.7;
    return mx >= x - TOL && mx <= x + flagW + TOL && my >= y - s - TOL && my <= y + TOL;
  }

  if (d.type === 'priceLabel') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    // Estimated pill width — no canvas context threaded through hitTest, so
    // this mirrors renderDrawing's `bold 12px sans-serif` measurement with a
    // char-width heuristic (same approach Text's hitTest below uses).
    const priceText = d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tagW = priceText.length * 7.5 + 16;
    const tagH = 22;
    return mx >= x - tagW / 2 - TOL && mx <= x + tagW / 2 + TOL && my >= y - tagH / 2 - TOL && my <= y + tagH / 2 + TOL;
  }

  if (d.type === 'signpost') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const text = d.text ?? '';
    const signW = Math.max(30, text.length * 6.5 + 16);
    const signH = 22;
    const poleH = 26;
    const signY = y - poleH - signH;
    return mx >= x - TOL && mx <= x + signW + TOL && my >= signY - TOL && my <= y + TOL;
  }

  // Note/Callout/Comment's box bounds are estimated with the same
  // char-width heuristic Text/Price Label's hitTest use below (no canvas
  // context is threaded through hitTest to measureText for real).
  if (d.type === 'note') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const text = d.text ?? '';
    const iconSize = 16;
    const textW = text.length > 0 ? text.length * 6.5 : 0;
    const totalW = iconSize + (text.length > 0 ? 6 + textW : 0);
    return mx >= x - iconSize / 2 - TOL && mx <= x - iconSize / 2 + totalW + TOL &&
      my >= y - iconSize / 2 - TOL && my <= y + iconSize / 2 + TOL;
  }

  if (d.type === 'callout') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const text = d.text ?? '';
    const lines = text.length > 0 ? text.split('\n') : [''];
    const padX = 8, padY = 6, lineH = 16;
    const textW = Math.max(10, ...lines.map((l) => l.length * 6.5));
    const boxW = textW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const boxLeft = x + 24;
    const boxBottom = y - 40;
    const boxTop = boxBottom - boxH;
    return mx >= boxLeft - TOL && mx <= boxLeft + boxW + TOL && my >= boxTop - TOL && my <= boxTop + boxH + TOL;
  }

  if (d.type === 'comment') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const text = d.text ?? '';
    const lines = text.length > 0 ? text.split('\n') : [''];
    const padX = 8, padY = 6, lineH = 16;
    const textW = Math.max(10, ...lines.map((l) => l.length * 6.5));
    const boxW = textW + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const tailH = 8;
    const boxBottom = y - tailH;
    const boxTop = boxBottom - boxH;
    const boxLeft = x - boxW / 2;
    return mx >= boxLeft - TOL && mx <= boxLeft + boxW + TOL && my >= boxTop - TOL && my <= y + TOL;
  }

  // Text's bounding box is estimated (no canvas context is threaded through
  // hitTest), using an average-char-width heuristic that mirrors the geometry
  // renderDrawing actually draws — close enough for hit testing given the
  // generous TOL.
  if (d.type === 'text') {
    const x = timeToX(chart, d.time);
    const y = priceToY(series, d.price);
    if (x == null || y == null) return false;
    const fontSize = d.fontSize ?? 14;
    const lines = d.text.length > 0 ? d.text.split('\n') : [''];
    const w = Math.max(10, ...lines.map((l) => l.length * fontSize * 0.55));
    const h = lines.length * (fontSize + 4);
    return mx >= x - TOL && mx <= x + w + TOL && my >= y - TOL && my <= y + h + TOL;
  }

  if (d.type === 'priceNote') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL;
  }

  if (d.type === 'priceRange' || d.type === 'dateRange' || d.type === 'datePriceRange') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const ty = Math.min(y1, y2), by = Math.max(y1, y2);
    return mx >= lx - TOL && mx <= rx + TOL && my >= ty - TOL && my <= by + TOL;
  }

  if (d.type === 'longPosition' || d.type === 'shortPosition') {
    const x1 = timeToX(chart, d.time1);
    const x2 = timeToX(chart, d.time2);
    const yTarget = priceToY(series, d.targetPrice);
    const yStop = priceToY(series, d.stopPrice);
    if (x1 == null || x2 == null || yTarget == null || yStop == null) return false;
    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const ty = Math.min(yTarget, yStop), by = Math.max(yTarget, yStop);
    return mx >= lx - TOL && mx <= rx + TOL && my >= ty - TOL && my <= by + TOL;
  }

  if (d.type === 'fibonacci' || d.type === 'fibExtension') {
    const range = d.priceHigh - d.priceLow;
    const fibLevels = fibLevelsFor(d.type);
    for (let i = 0; i < fibLevels.length; i++) {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) continue;
      const pct = cfg?.pct ?? fibLevels[i].pct;
      const price = d.priceHigh - pct * range;
      const y = priceToY(series, price);
      if (y != null && Math.abs(my - y) < TOL) return true;
    }
    if (d.lineVisible !== false) {
      const xH = timeToX(chart, d.timeHigh), yH = priceToY(series, d.priceHigh);
      const xL = timeToX(chart, d.timeLow),  yL = priceToY(series, d.priceLow);
      if (xH != null && yH != null && xL != null && yL != null) {
        return distToSegment(mx, my, xH, yH, xL, yL) < TOL;
      }
    }
  }

  if (d.type === 'trendFibExtension') {
    const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!pts3) return false;
    const { x1: xA, y1: yA, x2: xB, y2: yB, x3: xC, y3: yC } = pts3;
    const move = d.price2 - d.price1;
    const fibLevels = fibLevelsFor(d.type);
    for (let i = 0; i < fibLevels.length; i++) {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) continue;
      const pct = cfg?.pct ?? fibLevels[i].pct;
      const price = d.price3 + move * pct;
      const y = priceToY(series, price);
      if (y != null && Math.abs(my - y) < TOL) return true;
    }
    if (d.lineVisible !== false) {
      return distToSegment(mx, my, xA, yA, xB, yB) < TOL || distToSegment(mx, my, xB, yB, xC, yC) < TOL;
    }
    return false;
  }

  if (d.type === 'fibChannel') {
    const lines = computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
    if (!lines) return false;
    const { x1, y1, x2, y2, y1b, y2b } = lines;
    const fibLevels = fibLevelsFor(d.type);
    for (let i = 0; i < fibLevels.length; i++) {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) continue;
      const pct = cfg?.pct ?? fibLevels[i].pct;
      const ly1 = y1 + (y1b - y1) * pct;
      const ly2 = y2 + (y2b - y2) * pct;
      if (distToSegment(mx, my, x1, ly1, x2, ly2) < TOL) return true;
    }
    return false;
  }

  return false;
}

// ── "Magic" cursor: snap a screen point to the nearest candle's OHLC price ───

interface MagnetSnap { x: number; y: number; price: number; time: number }

function computeMagnetSnap(
  x: number,
  y: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  candles: Candle[],
): MagnetSnap | null {
  if (candles.length === 0) return null;
  const timeSec = xToTime(chart, x);
  const price = yToPrice(series, y);
  if (timeSec == null || price == null) return null;

  let nearest = candles[0];
  let bestTimeDiff = Infinity;
  for (const c of candles) {
    const diff = Math.abs(toChartTimeSeconds(c.t) - timeSec);
    if (diff < bestTimeDiff) { bestTimeDiff = diff; nearest = c; }
  }

  const ohlc = [nearest.o, nearest.h, nearest.l, nearest.c];
  let snapPrice = ohlc[0];
  let bestPriceDiff = Infinity;
  for (const p of ohlc) {
    const diff = Math.abs(p - price);
    if (diff < bestPriceDiff) { bestPriceDiff = diff; snapPrice = p; }
  }

  const snapTime = toChartTimeSeconds(nearest.t);
  const sx = timeToX(chart, snapTime);
  const sy = priceToY(series, snapPrice);
  if (sx == null || sy == null) return null;
  return { x: sx, y: sy, price: snapPrice, time: snapTime };
}

function getNearestCandleTime(
  chart: IChartApi,
  x: number,
  candles: Candle[],
): number | null {
  if (candles.length === 0) return null;
  const hoveredTime = xToTime(chart, x);
  if (hoveredTime == null) return null;

  let nearestTime = toChartTimeSeconds(candles[0].t);
  let bestDiff = Infinity;
  for (const candle of candles) {
    const candleTime = toChartTimeSeconds(candle.t);
    const diff = Math.abs(candleTime - hoveredTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      nearestTime = candleTime;
    }
  }
  return nearestTime;
}

// ── main component ────────────────────────────────────────────────────────────

export const DrawingCanvas = memo(function DrawingCanvas({ sharedChartRef, sharedSeriesRef }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);

  // drawing-in-progress state stored in refs so we don't re-render mid-draw.
  // Up to 6 anchor points are tracked — most tools use 1-2, Parallel Channel/
  // Flat Top-Bottom use 3, Disjoint Channel uses 4, and the Patterns group's
  // XABCD/Cypher/Head & Shoulders use 5 and Three Drives uses all 6.
  const drawingRef = useRef<{
    active: boolean;
    step: number;
    x1: number; y1: number;
    x2: number; y2: number;
    x3: number; y3: number;
    x4: number; y4: number;
    x5: number; y5: number;
    x6: number; y6: number;
  }>({
    active: false, step: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0,
    x5: 0, y5: 0, x6: 0, y6: 0,
  });

  // Path/Brush use a variable-length point list instead of the fixed 1-3 point
  // scheme above. Path grows one point per click and finishes on double-click;
  // Brush grows continuously while the mouse is held down and finishes on release.
  // Polyline/Highlighter reuse this exact mechanism (Polyline = Path minus the
  // arrowhead, Highlighter = Brush with thicker/translucent creation defaults).
  const freeformRef = useRef<{
    active: boolean;
    tool: 'path' | 'polyline' | 'brush' | 'highlighter' | null;
    points: { x: number; y: number }[];
  }>({ active: false, tool: null, points: [] });

  const {
    activeTool, drawings, selectedId, magnetEnabled, lastCursorMode,
    keepToolActive, drawingsLocked, drawingsHidden,
    addDrawing, updateDrawing, deleteDrawing, selectDrawing, setTool, undo,
  } = useDrawingStore();
  const mousePosRef = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false });
  const hoverPriceRef = useRef<number | null>(null);

  // Inline text-edit overlay for the Text tool — a real <textarea> rendered
  // over the canvas at the anchor's screen position. `isNew` distinguishes a
  // freshly-placed (still-empty) drawing, which gets deleted on cancel, from
  // an existing one being re-edited via double-click, which just keeps its
  // prior text on cancel.
  interface EditingNote { id: string; x: number; y: number; value: string; isNew: boolean }
  const [editing, setEditingState] = useState<EditingNote | null>(null);
  const editingRef = useRef<EditingNote | null>(null);
  const setEditing = useCallback((v: EditingNote | null) => { editingRef.current = v; setEditingState(v); }, []);

  // Measure tool's transient stats readout — not a persisted Drawing, cleared
  // whenever the tool changes away from 'measure'.
  const measureResultRef = useRef<{
    x1: number; y1: number; x2: number; y2: number;
    price1: number; time1: number; price2: number; time2: number;
  } | null>(null);

  const applyCursorValue = useCallback((cursor: string) => {
    const doc = containerRef.current?.ownerDocument;
    const target = containerRef.current?.parentElement as HTMLElement | null;
    if (doc?.body) doc.body.style.cursor = cursor;
    if (target) target.style.cursor = cursor;
    if (canvasRef.current) canvasRef.current.style.cursor = cursor;
  }, []);

  const applyCursor = useCallback((tool: DrawingTool) => {
    applyCursorValue(CURSOR_STYLE[tool] ?? 'default');
  }, [applyCursorValue]);

  // Drag-to-edit for every drawing type once it's selected with a cursor-group
  // tool. `mode` is 'move' for a drag anywhere along the body, 'p1'/'p2' for a
  // 2-point shape's endpoint (trend line/arrow) or corner (rectangle/circle —
  // 'p1'/'p2' are the two *stored* corners; 'c2'/'c3' are the two *mixed*
  // corners made of one point's time and the other's price), 'p3' for a
  // channel/rotated-rectangle's width handle, and 'vertex' for a single Path
  // point (index in `vertexIndex`).
  // Kinds share a schema where possible: 'trendline' also covers Arrow (both
  // are price1/time1/price2/time2 with the same move/p1/p2 modes); 'channel'
  // also covers Rotated Rectangle (both are price1..3/time1..3 with the same
  // move/p1/p2/p3 modes) — the store doesn't care which literal `type` a patch
  // is applied to, so one drag implementation legitimately serves both pairs.
  const dragRef = useRef<{
    active: boolean;
    kind: 'trendline' | 'channel' | 'flatChannel' | 'disjointChannel' | 'fibonacci' | 'box' | 'path' | 'brush'
      | 'triangle' | 'arc' | 'curve' | 'doubleCurve' | 'trendFibExtension' | 'sector' | 'fibWedge' | 'positionForecast'
      | 'arrowMark' | 'note' | 'position' | 'hline' | 'vline' | 'hray';
    id: string;
    mode: 'move' | 'p1' | 'p2' | 'p3' | 'c2' | 'c3' | 'vertex' | 'target' | 'stop' | 'width'
      | 'a1' | 'a2' | 'b1' | 'b2';
    vertexIndex?: number;
    startX: number; startY: number;
    origX1: number; origY1: number;
    origX2: number; origY2: number;
    origX3: number; origY3: number;
    origPoints?: { x: number; y: number }[];
  } | null>(null);
  const dragPreviewRef = useRef<
    | { kind: 'trendline'; id: string; price1: number; time1: number; price2: number; time2: number }
    | { kind: 'channel'; id: string; price1: number; time1: number; price2: number; time2: number; price3: number; time3: number }
    | { kind: 'flatChannel'; id: string; price1: number; time1: number; time2: number; price3: number }
    | { kind: 'disjointChannel'; id: string;
        priceA1: number; timeA1: number; priceA2: number; timeA2: number;
        priceB1: number; timeB1: number; priceB2: number; timeB2: number }
    | { kind: 'fibonacci'; id: string; priceHigh: number; timeHigh: number; priceLow: number; timeLow: number }
    | { kind: 'box'; id: string; price1: number; time1: number; price2: number; time2: number }
    | { kind: 'triangle' | 'arc' | 'curve' | 'doubleCurve' | 'trendFibExtension' | 'sector' | 'fibWedge' | 'positionForecast'; id: string;
        price1: number; time1: number; price2: number; time2: number; price3: number; time3: number }
    | { kind: 'path' | 'brush'; id: string; points: { price: number; time: number }[] }
    | { kind: 'arrowMark'; id: string; price: number; time: number }
    | { kind: 'note'; id: string; price: number; time: number }
    | { kind: 'position'; id: string; entryPrice: number; targetPrice: number; stopPrice: number; time1: number; time2: number }
    | { kind: 'hline'; id: string; price: number }
    | { kind: 'vline'; id: string; time: number }
    | { kind: 'hray'; id: string; price: number; time: number }
    | null
  >(null);

  const { activeSymbol, activeInterval, candles } = useMarketStore();

  const activeToolRef     = useRef<DrawingTool>(activeTool);
  const drawingsRef       = useRef<Drawing[]>(drawings);
  const selectedIdRef     = useRef<string | null>(selectedId);
  const candlesRef        = useRef<Candle[]>(candles);
  const magnetEnabledRef  = useRef(magnetEnabled);
  const keepToolActiveRef   = useRef(keepToolActive);
  const drawingsLockedRef   = useRef(drawingsLocked);
  const drawingsHiddenRef   = useRef(drawingsHidden);
  const lastCursorModeRef   = useRef(lastCursorMode);

  // "Eraser" hover target (drawing highlighted red, ready to delete on click).
  const hoverEraseIdRef = useRef<string | null>(null);
  // "Magic" snap indicator — nearest candle OHLC point to the cursor.
  const magnetPointRef  = useRef<MagnetSnap | null>(null);
  activeToolRef.current     = activeTool;
  drawingsRef.current       = drawings;
  selectedIdRef.current     = selectedId;
  candlesRef.current        = candles;
  latestCandlesForExtrapolation = candles;
  magnetEnabledRef.current  = magnetEnabled;
  keepToolActiveRef.current = keepToolActive;
  drawingsLockedRef.current = drawingsLocked;
  drawingsHiddenRef.current = drawingsHidden;
  lastCursorModeRef.current = lastCursorMode;

  // ── localStorage persistence ──────────────────────────────────────────────
  const storageKey = `dsa_drawings_${activeSymbol}_${activeInterval}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) useDrawingStore.getState().loadDrawings(JSON.parse(raw) as Drawing[]);
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(drawings));
    } catch { /* ignore */ }
  }, [drawings, storageKey]);

  // ── render loop ───────────────────────────────────────────────────────────
  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas  = canvasRef.current;
      const chart   = sharedChartRef.current;
      const series  = sharedSeriesRef.current;
      if (!canvas || !chart || !series) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // completed drawings — skipped entirely while "Hide All Drawings" is on
      const eraserActive = activeToolRef.current === 'eraser';
      const drag = dragPreviewRef.current;
      for (const d of (drawingsHiddenRef.current ? [] : drawingsRef.current)) {
        let dd: Drawing = d;
        if (drag && drag.id === d.id) {
          if (drag.kind === 'trendline' && (d.type === 'trendline' || d.type === 'arrow' || d.type === 'priceNote' ||
              d.type === 'ray' || d.type === 'extendedLine' || d.type === 'infoLine' || d.type === 'trendAngle' ||
              d.type === 'gannFan' || d.type === 'cyclicLines' || d.type === 'timeCycles' || d.type === 'sineLine' ||
              d.type === 'fibTimeZone' || d.type === 'fibSpeedFan' || d.type === 'fibCircles' || d.type === 'fibSpeedArcs')) {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2 };
          } else if (drag.kind === 'channel' && (d.type === 'channel' || d.type === 'rotatedRectangle' || d.type === 'fibChannel')) {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2,
              price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'flatChannel' && d.type === 'flatChannel') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, time2: drag.time2, price3: drag.price3 };
          } else if (drag.kind === 'disjointChannel' && d.type === 'disjointChannel') {
            dd = {
              ...d,
              priceA1: drag.priceA1, timeA1: drag.timeA1, priceA2: drag.priceA2, timeA2: drag.timeA2,
              priceB1: drag.priceB1, timeB1: drag.timeB1, priceB2: drag.priceB2, timeB2: drag.timeB2,
            };
          } else if (drag.kind === 'fibonacci' && (d.type === 'fibonacci' || d.type === 'fibExtension')) {
            dd = { ...d, priceHigh: drag.priceHigh, timeHigh: drag.timeHigh, priceLow: drag.priceLow, timeLow: drag.timeLow };
          } else if (drag.kind === 'box' && (d.type === 'rectangle' || d.type === 'circle' || d.type === 'ellipse' || d.type === 'priceRange' || d.type === 'dateRange' || d.type === 'datePriceRange' || d.type === 'gannBox' || d.type === 'gannSquare')) {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2 };
          } else if (drag.kind === 'triangle' && d.type === 'triangle') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'sector' && d.type === 'sector') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'fibWedge' && d.type === 'fibWedge') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'positionForecast' && d.type === 'positionForecast') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'arc' && d.type === 'arc') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'curve' && d.type === 'curve') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'doubleCurve' && d.type === 'doubleCurve') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'trendFibExtension' && d.type === 'trendFibExtension') {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2, price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'path' && (d.type === 'path' || d.type === 'polyline' ||
              d.type === 'abcd' || d.type === 'xabcd' || d.type === 'cypher' || d.type === 'threeDrives' || d.type === 'headShoulders')) {
            dd = { ...d, points: drag.points };
          } else if (drag.kind === 'brush' && (d.type === 'brush' || d.type === 'highlighter')) {
            dd = { ...d, points: drag.points };
          } else if (drag.kind === 'arrowMark' && (d.type === 'arrowMark' || d.type === 'pin' ||
              d.type === 'flagMark' || d.type === 'priceLabel' || d.type === 'signpost' || d.type === 'anchoredVwap' ||
              d.type === 'note' || d.type === 'callout' || d.type === 'comment')) {
            dd = { ...d, price: drag.price, time: drag.time };
          } else if (drag.kind === 'note' && d.type === 'text') {
            dd = { ...d, price: drag.price, time: drag.time };
          } else if (drag.kind === 'position' && (d.type === 'longPosition' || d.type === 'shortPosition')) {
            dd = { ...d, entryPrice: drag.entryPrice, targetPrice: drag.targetPrice, stopPrice: drag.stopPrice, time1: drag.time1, time2: drag.time2 };
          } else if (drag.kind === 'hline' && d.type === 'hline') {
            dd = { ...d, price: drag.price };
          } else if (drag.kind === 'vline' && d.type === 'vline') {
            dd = { ...d, time: drag.time };
          } else if (drag.kind === 'hray' && (d.type === 'hray' || d.type === 'crossline')) {
            dd = { ...d, price: drag.price, time: drag.time };
          }
        }
        renderDrawing(
          ctx, W, H, dd, chart, series, candlesRef.current,
          d.id === selectedIdRef.current,
          eraserActive && d.id === hoverEraseIdRef.current,
        );
      }

      // live preview while placing a multi-click drawing (trend line, rectangle,
      // fibonacci, parallel channel, regression trend)
      const ds = drawingRef.current;
      if (ds.active && ds.step >= 1) {
        const tool = activeToolRef.current;
        const price1 = yToPrice(series, ds.y1);
        const time1  = xToTime(chart, ds.x1);
        const price2 = yToPrice(series, ds.y2);
        const time2  = xToTime(chart, ds.x2);
        const price3 = yToPrice(series, ds.y3);
        const time3  = xToTime(chart, ds.x3);
        const price4 = yToPrice(series, ds.y4);
        const time4  = xToTime(chart, ds.x4);
        const price5 = yToPrice(series, ds.y5);
        const time5  = xToTime(chart, ds.x5);
        const price6 = yToPrice(series, ds.y6);
        const time6  = xToTime(chart, ds.x6);
        if (price1 != null && time1 != null) {
          let preview: Drawing | null = null;
          if (tool === 'trendline' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'trendline', price1, time1, price2, time2 };
          else if (tool === 'ray' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'ray', price1, time1, price2, time2 };
          else if (tool === 'gannFan' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'gannFan', price1, time1, price2, time2 };
          else if (tool === 'cyclicLines' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'cyclicLines', price1, time1, price2, time2 };
          else if (tool === 'timeCycles' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'timeCycles', price1, time1, price2, time2 };
          else if (tool === 'sineLine' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'sineLine', price1, time1, price2, time2 };
          else if (tool === 'fibTimeZone' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibTimeZone', price1, time1, price2, time2 };
          else if (tool === 'fibSpeedFan' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibSpeedFan', price1, time1, price2, time2 };
          else if (tool === 'fibCircles' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibCircles', price1, time1, price2, time2 };
          else if (tool === 'fibSpeedArcs' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibSpeedArcs', price1, time1, price2, time2 };
          else if (tool === 'extendedLine' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'extendedLine', price1, time1, price2, time2 };
          else if (tool === 'infoLine' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'infoLine', price1, time1, price2, time2 };
          else if (tool === 'trendAngle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'trendAngle', price1, time1, price2, time2 };
          else if (tool === 'priceNote' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'priceNote', price1, time1, price2, time2 };
          else if (tool === 'priceRange' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'priceRange', price1, time1, price2, time2 };
          else if (tool === 'dateRange' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'dateRange', price1, time1, price2, time2 };
          else if (tool === 'datePriceRange' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'datePriceRange', price1, time1, price2, time2 };
          else if (tool === 'rectangle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'rectangle', price1, time1, price2, time2 };
          else if (tool === 'gannBox' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'gannBox', price1, time1, price2, time2 };
          else if (tool === 'gannSquare' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'gannSquare', price1, time1, price2, time2 };
          else if (tool === 'fibonacci' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibonacci',
              priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
              priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 };
          else if (tool === 'fibExtension' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibExtension',
              priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
              priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 };
          else if (tool === 'trendFibExtension' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'trendFibExtension', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'fibChannel' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibChannel', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'channel' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'channel', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'flatChannel' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'flatChannel', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'disjointChannel' && price2 != null && time2 != null)
            preview = {
              id: '__preview', type: 'disjointChannel',
              priceA1: price1, timeA1: time1, priceA2: price2, timeA2: time2,
              priceB1: price3 ?? price2, timeB1: time3 ?? time2,
              priceB2: price4 ?? price3 ?? price2, timeB2: time4 ?? time3 ?? time2,
            };
          else if (tool === 'abcd' || tool === 'xabcd' || tool === 'cypher' || tool === 'threeDrives' || tool === 'headShoulders') {
            const partialPrices = [price1, price2, price3, price4, price5, price6];
            const partialTimes = [time1, time2, time3, time4, time5, time6];
            const partialPoints: { price: number; time: number }[] = [];
            for (let i = 0; i < partialPrices.length; i++) {
              const p = partialPrices[i], t = partialTimes[i];
              if (p == null || t == null) break;
              partialPoints.push({ price: p, time: t });
            }
            if (partialPoints.length >= 2) preview = { id: '__preview', type: tool, points: partialPoints };
          }
          else if (tool === 'rotatedRectangle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'rotatedRectangle', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'circle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'circle', price1, time1, price2, time2 };
          else if (tool === 'ellipse' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'ellipse', price1, time1, price2, time2 };
          else if (tool === 'triangle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'triangle', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'sector' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'sector', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'fibWedge' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibWedge', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'positionForecast' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'positionForecast', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'arc' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'arc', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'curve' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'curve', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'doubleCurve' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'doubleCurve', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if ((tool === 'arrowTool' || tool === 'arrowMarker') && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'arrow', price1, time1, price2, time2,
              variant: tool === 'arrowMarker' ? 'marker' : 'plain' };
          else if (tool === 'regression' && price2 != null && time2 != null)
            // Show a plain rubber-band line while dragging — the actual statistical
            // regression channel only gets computed once the drawing is finalized.
            preview = { id: '__preview', type: 'trendline', price1, time1, price2, time2 };
          if (preview) {
            ctx.globalAlpha = 0.7;
            renderDrawing(ctx, W, H, preview, chart, series, candlesRef.current, false);
            ctx.globalAlpha = 1;
          }

          // Measure/Zoom In: not persisted Drawings, so they're not part of the
          // `preview` union above — render a live rubber-band + stats box instead.
          if ((tool === 'measure' || tool === 'zoomIn') && price2 != null && time2 != null) {
            renderMeasureBox(ctx, W, H, ds.x1, ds.y1, ds.x2, ds.y2, price1, time1, price2, time2, candlesRef.current);
          }
        }
      }

      // Measure's finalized stats readout sticks around (unlike other tools'
      // drawings, it isn't added to the store) until a new measurement starts
      // or the tool changes away — cleared in the activeTool-change effect below.
      if (!ds.active && measureResultRef.current && activeToolRef.current === 'measure') {
        const m = measureResultRef.current;
        renderMeasureBox(ctx, W, H, m.x1, m.y1, m.x2, m.y2, m.price1, m.time1, m.price2, m.time2, candlesRef.current);
      }

      // always-on floating preview for single-click tools (Horizontal Line/Ray,
      // Vertical Line) — TradingView follows the cursor with these before you
      // even click; the click just locks the current position in
      if (!ds.active) {
        const tool = activeToolRef.current;
        const isSingleClickTool = tool === 'hline' || tool === 'hray' || tool === 'vline' || tool === 'crossline' ||
          tool === 'arrowMarkUp' || tool === 'arrowMarkDown' || tool === 'longPosition' || tool === 'shortPosition' ||
          tool === 'pin' || tool === 'flagMark' || tool === 'priceLabel' || tool === 'signpost' ||
          tool === 'note' || tool === 'callout' || tool === 'comment';
        if (isSingleClickTool && mousePosRef.current.inside) {
          const { x: mx, y: my } = mousePosRef.current;
          const price = yToPrice(series, my);
          const time  = xToTime(chart, mx);
          if (price != null && time != null) {
            let preview: Drawing | null = null;
            if (tool === 'hline') preview = { id: '__preview', type: 'hline', price };
            else if (tool === 'hray') preview = { id: '__preview', type: 'hray', price, time };
            else if (tool === 'vline') preview = { id: '__preview', type: 'vline', time };
            else if (tool === 'crossline') preview = { id: '__preview', type: 'crossline', price, time };
            else if (tool === 'longPosition' || tool === 'shortPosition') {
              const posBox = defaultPositionBox(tool, price, time, my, series, candlesRef.current);
              if (posBox) preview = { id: '__preview', type: tool, ...posBox };
            }
            else if (tool === 'pin') preview = { id: '__preview', type: 'pin', price, time };
            else if (tool === 'flagMark') preview = { id: '__preview', type: 'flagMark', price, time };
            else if (tool === 'priceLabel') preview = { id: '__preview', type: 'priceLabel', price, time };
            else if (tool === 'signpost') preview = { id: '__preview', type: 'signpost', price, time, text: '' };
            else if (tool === 'note') preview = { id: '__preview', type: 'note', price, time, text: '' };
            else if (tool === 'callout') preview = { id: '__preview', type: 'callout', price, time, text: '' };
            else if (tool === 'comment') preview = { id: '__preview', type: 'comment', price, time, text: '' };
            else preview = { id: '__preview', type: 'arrowMark', variant: tool === 'arrowMarkUp' ? 'up' : 'down', price, time };
            if (preview) {
              ctx.globalAlpha = 0.6;
              renderDrawing(ctx, W, H, preview, chart, series, candlesRef.current, false);
              ctx.globalAlpha = 1;
            }
          }
        }

        // Path/Polyline/Brush/Highlighter: variable-length point list, not the
        // fixed-count drawingRef above. Polyline mirrors Path's rubber-band +
        // vertex dots; Highlighter mirrors Brush's plain live stroke.
        const fr = freeformRef.current;
        const frIsPathLike = fr.tool === 'path' || fr.tool === 'polyline';
        if (fr.active && fr.points.length >= 1) {
          ctx.save();
          ctx.strokeStyle = 'rgba(33,150,243,0.9)';
          ctx.lineWidth = frIsPathLike ? 1.5 : 2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          if (frIsPathLike) ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(fr.points[0].x, fr.points[0].y);
          for (let i = 1; i < fr.points.length; i++) ctx.lineTo(fr.points[i].x, fr.points[i].y);
          if (frIsPathLike && mousePosRef.current.inside) {
            ctx.lineTo(mousePosRef.current.x, mousePosRef.current.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          if (frIsPathLike) {
            ctx.fillStyle = 'rgba(33,150,243,0.9)';
            for (const p of fr.points) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }

      // "Magic" snap indicator — small yellow dot at the nearest OHLC point
      const snap = magnetPointRef.current;
      if (snap) {
        ctx.save();
        ctx.fillStyle = '#FFEB3B';
        ctx.beginPath();
        ctx.arc(snap.x, snap.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // TradingView only shows the crosshair (dashed lines + single price label) for
      // Cross/Dot. Arrow is a plain pointer with no overlay; Demonstration gets the
      // same crosshair plus an extra spotlight ring so presenters can highlight where
      // they're pointing.
      const cursorTool = activeToolRef.current;
      if ((cursorTool === 'cross' || cursorTool === 'dot' || cursorTool === 'demonstration') && mousePosRef.current.inside) {
        const { x: mx } = mousePosRef.current;
        const nearestTime = getNearestCandleTime(chart, mx, candlesRef.current);
        const verticalX = nearestTime == null ? mx : timeToX(chart, nearestTime);
        const price = hoverPriceRef.current;
        const y = price != null ? priceToY(series, price) : null;

        ctx.save();
        ctx.strokeStyle = 'rgba(59,130,246,0.95)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);

        if (verticalX != null) {
          ctx.beginPath();
          ctx.moveTo(verticalX, 0);
          ctx.lineTo(verticalX, H);
          ctx.stroke();
        }

        if (y != null) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();

          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.fillRect(W - 96, Math.max(8, Math.min(y - 10, H - 22)), 84, 20);
          ctx.fillStyle = '#f8fafc';
          ctx.font = '11px sans-serif';
          const label = (price ?? 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          ctx.fillText(label, W - 90, Math.max(20, Math.min(y + 4, H - 8)));
        }

        if (verticalX != null && y != null) {
          ctx.fillStyle = 'rgba(59,130,246,0.95)';
          ctx.beginPath();
          ctx.arc(verticalX, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (cursorTool === 'demonstration' && mousePosRef.current.inside) {
        const { x: mx, y: my } = mousePosRef.current;
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx, my, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59,130,246,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(59,130,246,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59,130,246,0.95)';
        ctx.fill();
        ctx.restore();
      }

    });
  }, [sharedChartRef, sharedSeriesRef]);

  // Text/Price Note inline-edit overlay: commit saves the typed text (deleting
  // the drawing if left empty — an empty note is pointless); cancel discards a
  // freshly-placed empty note but leaves an existing one's prior text alone.
  const commitEdit = useCallback(() => {
    const ed = editingRef.current;
    if (!ed) return;
    const trimmed = ed.value.trim();
    if (trimmed.length === 0) deleteDrawing(ed.id);
    else updateDrawing(ed.id, { text: trimmed });
    setEditing(null);
    // Only auto-revert if Text/Signpost/Note/Callout/Comment is still the
    // active tool — if this commit was triggered by switching to a
    // *different* tool mid-edit, that tool choice must win, not get
    // clobbered back to the cursor.
    if (!keepToolActiveRef.current && (activeToolRef.current === 'text' || activeToolRef.current === 'signpost' ||
        activeToolRef.current === 'note' || activeToolRef.current === 'callout' || activeToolRef.current === 'comment')) {
      setTool(lastCursorModeRef.current);
    }
    scheduleRender();
  }, [deleteDrawing, updateDrawing, setEditing, scheduleRender, setTool]);

  const cancelEdit = useCallback(() => {
    const ed = editingRef.current;
    if (!ed) return;
    if (ed.isNew) deleteDrawing(ed.id);
    setEditing(null);
    scheduleRender();
  }, [deleteDrawing, setEditing, scheduleRender]);

  // ── subscribe to chart events for redraw ─────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;
    const cb = () => scheduleRender();
    chart.timeScale().subscribeVisibleLogicalRangeChange(cb);
    chart.subscribeCrosshairMove(cb);
    scheduleRender();
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(cb);
      chart.unsubscribeCrosshairMove(cb);
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scheduleRender(); }, [drawings, selectedId, candles, drawingsHidden, drawingsLocked, scheduleRender]);

  // ── resize canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      scheduleRender();
    });
    ro.observe(container);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, [scheduleRender]);

  // clear stale hover/snap indicators whenever the active tool changes
  useEffect(() => {
    hoverEraseIdRef.current = null;
    magnetPointRef.current = null;
    if (activeTool !== 'measure') measureResultRef.current = null;
    if (activeTool !== 'text' && activeTool !== 'signpost' && activeTool !== 'note' &&
        activeTool !== 'callout' && activeTool !== 'comment' && editingRef.current) commitEdit();
    applyCursor(activeTool);
    scheduleRender();
    return () => {
      const doc = containerRef.current?.ownerDocument;
      if (doc?.body) doc.body.style.cursor = '';
    };
  }, [activeTool, applyCursor, scheduleRender, commitEdit]);

  // ── mouse event handlers (drawing tools + eraser — canvas captures events) ─
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Path/Brush finalize: convert the accumulated screen points to price/time
  // and commit as a drawing. Used by mouseup (Brush), dblclick (Path), and as
  // a window-level mouseup fallback if a Brush drag is released off-canvas.
  const finalizeFreeform = useCallback(() => {
    const fr = freeformRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    const tool = fr.tool;
    if (chart && series && tool && fr.points.length >= 2) {
      const pts = fr.points
        .map((p) => {
          const price = yToPrice(series, p.y);
          const time  = xToTime(chart, p.x);
          return price != null && time != null ? { price, time } : null;
        })
        .filter((p): p is { price: number; time: number } => p != null);
      if (pts.length >= 2) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        // Highlighter's only difference from Brush: thicker + translucent
        // creation defaults (still just ordinary LineStyle fields the user
        // can override afterward via the style toolbar like any other tool).
        const styleDefaults = tool === 'highlighter' ? { width: 12, opacity: 30 } : {};
        addDrawing({ id, type: tool, points: pts, ...styleDefaults });
        selectDrawing(id);
        if (!keepToolActiveRef.current) setTool(lastCursorModeRef.current);
      }
    }
    fr.active = false;
    fr.tool = null;
    fr.points = [];
    scheduleRender();
  }, [sharedChartRef, sharedSeriesRef, addDrawing, selectDrawing, scheduleRender, setTool]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const tool = activeToolRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    if (!chart || !series) return;

    // Suppress the browser's default mousedown focusing steps: since <canvas>
    // isn't focusable, that default action would otherwise blur (steal focus
    // right back from) the Text/Price Note edit box we mount+autofocus below
    // in response to this very click — it targets the original mousedown
    // target (the canvas) and runs *after* our handler, even though by then
    // the textarea already has focus.
    e.preventDefault();

    const { x, y } = getCoords(e);

    if (tool === 'eraser') {
      // locked drawings can't be erased; hidden ones aren't interactive at all
      if (!drawingsLockedRef.current && !drawingsHiddenRef.current) {
        // hit-test drawings in reverse order (top-most first) and delete on click
        for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
          if (hitTest(drawingsRef.current[i], x, y, chart, series, candlesRef.current)) {
            deleteDrawing(drawingsRef.current[i].id);
            break;
          }
        }
      }
      return;
    }

    if (tool === 'path') {
      const fr = freeformRef.current;
      if (!fr.active) { fr.active = true; fr.tool = 'path'; fr.points = [{ x, y }]; }
      else fr.points.push({ x, y });
      scheduleRender();
      return;
    }

    if (tool === 'polyline') {
      const fr = freeformRef.current;
      if (!fr.active) { fr.active = true; fr.tool = 'polyline'; fr.points = [{ x, y }]; }
      else fr.points.push({ x, y });
      scheduleRender();
      return;
    }

    if (tool === 'brush') {
      const fr = freeformRef.current;
      fr.active = true;
      fr.tool = 'brush';
      fr.points = [{ x, y }];
      scheduleRender();
      return;
    }

    if (tool === 'highlighter') {
      const fr = freeformRef.current;
      fr.active = true;
      fr.tool = 'highlighter';
      fr.points = [{ x, y }];
      scheduleRender();
      return;
    }

    const required = CLICKS_REQUIRED[tool] ?? 2;
    const snap = magnetEnabledRef.current
      ? computeMagnetSnap(x, y, chart, series, candlesRef.current)
      : null;
    const px = snap ? snap.x : x;
    const py = snap ? snap.y : y;

    const ds = drawingRef.current;

    // starting a fresh measurement clears the previous one's sticky readout
    if (tool === 'measure' && !ds.active) measureResultRef.current = null;

    if (!ds.active) {
      // first click: anchor point 1 (also seeds points 2/3 so a 1-click tool
      // can finalize immediately below)
      ds.active = true;
      ds.step   = 1;
      ds.x1 = ds.x2 = ds.x3 = ds.x4 = ds.x5 = ds.x6 = px;
      ds.y1 = ds.y2 = ds.y3 = ds.y4 = ds.y5 = ds.y6 = py;
    } else {
      ds.step += 1;
      if (ds.step === 2) { ds.x2 = px; ds.y2 = py; }
      else if (ds.step === 3) { ds.x3 = px; ds.y3 = py; }
      else if (ds.step === 4) { ds.x4 = px; ds.y4 = py; }
      else if (ds.step === 5) { ds.x5 = px; ds.y5 = py; }
      else if (ds.step === 6) { ds.x6 = px; ds.y6 = py; }
    }

    if (ds.step < required) {
      scheduleRender();
      return;
    }

    // finalize
    ds.active = false;
    ds.step = 0;

    const price1 = yToPrice(series, ds.y1);
    const time1  = xToTime(chart, ds.x1);
    const price2 = yToPrice(series, ds.y2);
    const time2  = xToTime(chart, ds.x2);
    const price3 = yToPrice(series, ds.y3);
    const time3  = xToTime(chart, ds.x3);
    const price4 = yToPrice(series, ds.y4);
    const time4  = xToTime(chart, ds.x4);
    const price5 = yToPrice(series, ds.y5);
    const time5  = xToTime(chart, ds.x5);
    const price6 = yToPrice(series, ds.y6);
    const time6  = xToTime(chart, ds.x6);

    if (price1 == null || time1 == null) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (tool === 'trendline') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'trendline', price1, time1, price2, time2 });
    } else if (tool === 'ray' || tool === 'extendedLine' || tool === 'infoLine' || tool === 'trendAngle' ||
        tool === 'gannFan' || tool === 'cyclicLines' || tool === 'timeCycles' || tool === 'sineLine' ||
        tool === 'fibTimeZone' || tool === 'fibSpeedFan' || tool === 'fibCircles' || tool === 'fibSpeedArcs') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: tool, price1, time1, price2, time2 });
    } else if (tool === 'hline') {
      addDrawing({ id, type: 'hline', price: price1 });
    } else if (tool === 'hray') {
      addDrawing({ id, type: 'hray', price: price1, time: time1 });
    } else if (tool === 'vline') {
      addDrawing({ id, type: 'vline', time: time1 });
    } else if (tool === 'crossline') {
      addDrawing({ id, type: 'crossline', price: price1, time: time1 });
    } else if (tool === 'rectangle') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'rectangle', price1, time1, price2, time2 });
    } else if (tool === 'gannBox' || tool === 'gannSquare') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: tool, price1, time1, price2, time2 });
    } else if (tool === 'fibonacci') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'fibonacci',
        priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
        priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 });
    } else if (tool === 'fibExtension') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'fibExtension',
        priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
        priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 });
    } else if (tool === 'trendFibExtension') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'trendFibExtension', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'fibChannel') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'fibChannel', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'channel') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'channel', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'flatChannel') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'flatChannel', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'disjointChannel') {
      if (price2 == null || time2 == null || price3 == null || time3 == null || price4 == null || time4 == null) return;
      addDrawing({
        id, type: 'disjointChannel',
        priceA1: price1, timeA1: time1, priceA2: price2, timeA2: time2,
        priceB1: price3, timeB1: time3, priceB2: price4, timeB2: time4,
      });
    } else if (tool === 'abcd' || tool === 'xabcd' || tool === 'cypher' || tool === 'threeDrives' || tool === 'headShoulders') {
      // Patterns group: fixed-N-click capture (mechanically the same
      // extension of drawingRef/CLICKS_REQUIRED that took DisjointChannel
      // from 3 to 4 points, taken further to 5/6), assembled into points[]
      // (not named price1..priceN fields) so render/hitTest/vertex-drag can
      // reuse the generic Path/Polyline code paths for any point count.
      const need = CLICKS_REQUIRED[tool] ?? 4;
      const allPrices = [price1, price2, price3, price4, price5, price6];
      const allTimes = [time1, time2, time3, time4, time5, time6];
      const points: { price: number; time: number }[] = [];
      for (let i = 0; i < need; i++) {
        const p = allPrices[i], t = allTimes[i];
        if (p == null || t == null) return;
        points.push({ price: p, time: t });
      }
      addDrawing({ id, type: tool, points });
    } else if (tool === 'regression') {
      if (time2 == null) return;
      addDrawing({ id, type: 'regression', time1, time2 });
    } else if (tool === 'rotatedRectangle') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'rotatedRectangle', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'circle') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'circle', price1, time1, price2, time2 });
    } else if (tool === 'ellipse') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'ellipse', price1, time1, price2, time2 });
    } else if (tool === 'triangle') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'triangle', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'sector') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'sector', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'fibWedge') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'fibWedge', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'positionForecast') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'positionForecast', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'arc') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'arc', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'curve') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'curve', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'doubleCurve') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'doubleCurve', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'arrowTool' || tool === 'arrowMarker') {
      if (price2 == null || time2 == null) return;
      addDrawing({
        id, type: 'arrow', price1, time1, price2, time2,
        variant: tool === 'arrowMarker' ? 'marker' : 'plain',
      });
    } else if (tool === 'arrowMarkUp' || tool === 'arrowMarkDown') {
      addDrawing({ id, type: 'arrowMark', variant: tool === 'arrowMarkUp' ? 'up' : 'down', price: price1, time: time1 });
    } else if (tool === 'text') {
      // place empty, then immediately open the inline-edit overlay to type into it
      addDrawing({ id, type: 'text', price: price1, time: time1, text: '' });
      selectDrawing(id);
      setEditing({ id, x: ds.x1, y: ds.y1, value: '', isNew: true });
      return;
    } else if (tool === 'priceNote') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'priceNote', price1, time1, price2, time2 });
    } else if (tool === 'pin') {
      addDrawing({ id, type: 'pin', price: price1, time: time1 });
    } else if (tool === 'anchoredVwap') {
      addDrawing({ id, type: 'anchoredVwap', price: price1, time: time1 });
    } else if (tool === 'flagMark') {
      addDrawing({ id, type: 'flagMark', price: price1, time: time1 });
    } else if (tool === 'priceLabel') {
      addDrawing({ id, type: 'priceLabel', price: price1, time: time1 });
    } else if (tool === 'signpost') {
      // place empty, then immediately open the inline-edit overlay to type into
      // it — same flow as Text (see the generalized editing handlers below).
      // The -48 offset matches renderDrawing's poleH+signH so the textarea
      // lines up with the sign box instead of the anchor point at its base.
      addDrawing({ id, type: 'signpost', price: price1, time: time1, text: '' });
      selectDrawing(id);
      setEditing({ id, x: ds.x1, y: ds.y1 - 48, value: '', isNew: true });
      return;
    } else if (tool === 'note') {
      // place empty, then immediately open the inline-edit overlay to type
      // into it — same flow as Text/Signpost. Offset matches renderDrawing's
      // text start (icon half-width + gap) so the textarea lines up with
      // where the note's text renders, vertically centered on the icon.
      addDrawing({ id, type: 'note', price: price1, time: time1, text: '' });
      selectDrawing(id);
      setEditing({ id, x: ds.x1 + 20, y: ds.y1 - 10, value: '', isNew: true });
      return;
    } else if (tool === 'callout') {
      // Offset matches renderDrawing's empty-text box position (offset
      // up-and-right from the anchor) so the textarea lines up with the box.
      addDrawing({ id, type: 'callout', price: price1, time: time1, text: '' });
      selectDrawing(id);
      setEditing({ id, x: ds.x1 + 24, y: ds.y1 - 68, value: '', isNew: true });
      return;
    } else if (tool === 'comment') {
      // Offset matches renderDrawing's empty-text bubble position (centered
      // above the anchor, tail pointing down) so the textarea lines up with
      // the bubble.
      addDrawing({ id, type: 'comment', price: price1, time: time1, text: '' });
      selectDrawing(id);
      setEditing({ id, x: ds.x1 - 13, y: ds.y1 - 36, value: '', isNew: true });
      return;
    } else if (tool === 'measure') {
      if (price2 == null || time2 == null) return;
      measureResultRef.current = { x1: ds.x1, y1: ds.y1, x2: ds.x2, y2: ds.y2, price1, time1, price2, time2 };
      scheduleRender();
      return;
    } else if (tool === 'zoomIn') {
      if (time2 == null) return;
      const lo = Math.min(time1, time2), hi = Math.max(time1, time2);
      if (hi > lo) chart.timeScale().setVisibleRange({ from: lo as unknown as LWTime, to: hi as unknown as LWTime });
      setTool(lastCursorMode);
      return;
    } else if (tool === 'priceRange') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'priceRange', price1, time1, price2, time2 });
    } else if (tool === 'dateRange') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'dateRange', price1, time1, price2, time2 });
    } else if (tool === 'datePriceRange') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'datePriceRange', price1, time1, price2, time2 });
    } else if (tool === 'longPosition' || tool === 'shortPosition') {
      const posBox = defaultPositionBox(tool, price1, time1, ds.y1, series, candlesRef.current);
      if (!posBox) return;
      addDrawing({ id, type: tool, ...posBox });
    }

    // auto-select the newly placed drawing so trash button is immediately usable
    selectDrawing(id);
    // TradingView default: finishing a drawing reverts to the cursor tool,
    // unless "Stay in Drawing Mode" is on
    if (!keepToolActive) setTool(lastCursorMode);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e);
    mousePosRef.current = { x, y, inside: true };
    const tool   = activeToolRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    const price = series ? yToPrice(series, y) : null;
    hoverPriceRef.current = price ?? null;

    if (tool === 'eraser') {
      let hit: string | null = null;
      if (chart && series && !drawingsLockedRef.current && !drawingsHiddenRef.current) {
        for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
          if (hitTest(drawingsRef.current[i], x, y, chart, series, candlesRef.current)) {
            hit = drawingsRef.current[i].id;
            break;
          }
        }
      }
      if (hoverEraseIdRef.current !== hit) {
        hoverEraseIdRef.current = hit;
        scheduleRender();
      }
      applyCursor('eraser');
      return;
    }

    if (tool === 'brush' || tool === 'highlighter') {
      const fr = freeformRef.current;
      // `e.buttons & 1` — the left button is still held down; a mouseup we
      // missed (e.g. released outside the canvas) means the drag already ended.
      if (fr.active && fr.tool === tool && (e.buttons & 1) === 1) {
        const last = fr.points[fr.points.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 3) {
          fr.points.push({ x, y });
          scheduleRender();
        }
      }
      return;
    }

    if (tool === 'path' || tool === 'polyline') {
      // just needs the live rubber-band redraw; mousePosRef is already updated above
      scheduleRender();
      return;
    }

    const ds = drawingRef.current;
    if (magnetEnabledRef.current && chart && series) {
      magnetPointRef.current = computeMagnetSnap(x, y, chart, series, candlesRef.current);
    } else {
      magnetPointRef.current = null;
    }
    const snap = magnetPointRef.current;
    if (ds.active) {
      const nx = snap ? snap.x : x;
      const ny = snap ? snap.y : y;
      const nextStep = ds.step + 1;
      if (nextStep === 2) { ds.x2 = nx; ds.y2 = ny; }
      else if (nextStep === 3) { ds.x3 = nx; ds.y3 = ny; }
      else if (nextStep === 4) { ds.x4 = nx; ds.y4 = ny; }
    }
    scheduleRender();

    applyCursor(tool);
  };

  const handleMouseLeave = () => {
    mousePosRef.current = { ...mousePosRef.current, inside: false };
    scheduleRender();
  };

  // Brush finishes when the mouse button is released.
  const handleMouseUp = () => {
    const fr = freeformRef.current;
    if (fr.active && (fr.tool === 'brush' || fr.tool === 'highlighter')) finalizeFreeform();
  };

  // Path/Polyline finish on double-click (the extra point dblclick's own second
  // mousedown already added is a harmless duplicate of the last vertex).
  const handleDoubleClick = () => {
    const fr = freeformRef.current;
    if (fr.active && (fr.tool === 'path' || fr.tool === 'polyline')) finalizeFreeform();
  };

  // ── mouse tracking for cursor-group tools (cross/dot/arrow/demonstration/eraser) ─
  // These tools deliberately leave the canvas's pointer-events at 'none' so the
  // chart stays pannable, so window-level listeners are used instead — they still
  // fire (via bubbling from whatever element was actually hit) without blocking it.
  // The one exception is grabbing a trend line to drag it: that mousedown is
  // intercepted in the CAPTURE phase (before it reaches the chart's own canvas)
  // so the chart doesn't start panning underneath the drag.
  useEffect(() => {
    // These window listeners filter hits by raw pixel bounds against the canvas's
    // bounding rect, not by event target — necessary because the canvas itself has
    // pointer-events:none for cursor-group tools (clicks pass through to the chart
    // underneath). But floating UI chrome (the style toolbar) is a sibling that sits
    // visually on top of the same pixel region with pointer-events enabled, so a
    // click landing on one of ITS buttons must not also be treated as a chart click.
    // `instanceof Element` (not HTMLElement) — SVG icon nodes are SVGElement,
    // a sibling interface, and would otherwise silently fail this check whenever
    // a click lands exactly on a button's icon glyph rather than its padding.
    const isOverlayTarget = (e: MouseEvent) =>
      e.target instanceof Element && e.target.closest('[data-drawing-overlay]') != null;

    const onWinMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const chart  = sharedChartRef.current;
      const series = sharedSeriesRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // dragging an existing trend line/channel takes priority over everything else
      // (don't cancel an in-progress drag just because the cursor passed over the toolbar)
      const drag = dragRef.current;
      if (drag?.active && chart && series) {
        const dx = x - drag.startX;
        const dy = y - drag.startY;

        if (drag.kind === 'trendline') {
          let nx1 = drag.origX1, ny1 = drag.origY1, nx2 = drag.origX2, ny2 = drag.origY2;
          if (drag.mode === 'move') {
            nx1 += dx; ny1 += dy; nx2 += dx; ny2 += dy;
          } else if (drag.mode === 'p1') {
            nx1 = x; ny1 = y;
          } else {
            nx2 = x; ny2 = y;
          }
          const price1 = yToPrice(series, ny1);
          const time1  = xToTime(chart, nx1);
          const price2 = yToPrice(series, ny2);
          const time2  = xToTime(chart, nx2);
          if (price1 != null && time1 != null && price2 != null && time2 != null) {
            dragPreviewRef.current = { kind: 'trendline', id: drag.id, price1, time1, price2, time2 };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'hline') {
          const ny = drag.origY1 + dy;
          const price = yToPrice(series, ny);
          if (price != null) {
            dragPreviewRef.current = { kind: 'hline', id: drag.id, price };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'vline') {
          const nx = drag.origX1 + dx;
          const time = xToTime(chart, nx);
          if (time != null) {
            dragPreviewRef.current = { kind: 'vline', id: drag.id, time };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'hray') {
          const nx = drag.origX1 + dx;
          const ny = drag.origY1 + dy;
          const price = yToPrice(series, ny);
          const time  = xToTime(chart, nx);
          if (price != null && time != null) {
            dragPreviewRef.current = { kind: 'hray', id: drag.id, price, time };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'box') {
          // rectangle/circle: 'p1'/'p2' drag the two *stored* corners, 'c2'/'c3'
          // drag the two *mixed* corners (one point's time, the other's price)
          let nx1 = drag.origX1, ny1 = drag.origY1, nx2 = drag.origX2, ny2 = drag.origY2;
          if (drag.mode === 'move') {
            nx1 += dx; ny1 += dy; nx2 += dx; ny2 += dy;
          } else if (drag.mode === 'p1') {
            nx1 = x; ny1 = y;
          } else if (drag.mode === 'p2') {
            nx2 = x; ny2 = y;
          } else if (drag.mode === 'c2') {
            nx1 = x; ny2 = y;
          } else if (drag.mode === 'c3') {
            nx2 = x; ny1 = y;
          }
          const price1 = yToPrice(series, ny1);
          const time1  = xToTime(chart, nx1);
          const price2 = yToPrice(series, ny2);
          const time2  = xToTime(chart, nx2);
          if (price1 != null && time1 != null && price2 != null && time2 != null) {
            dragPreviewRef.current = { kind: 'box', id: drag.id, price1, time1, price2, time2 };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'triangle' || drag.kind === 'arc' || drag.kind === 'curve' || drag.kind === 'doubleCurve' ||
            drag.kind === 'trendFibExtension' || drag.kind === 'sector' || drag.kind === 'fibWedge' || drag.kind === 'positionForecast') {
          // All 5 store 3 independent anchor points with identical move/p1/p2/p3
          // semantics — a single drag application covers all of them.
          let nx1 = drag.origX1, ny1 = drag.origY1;
          let nx2 = drag.origX2, ny2 = drag.origY2;
          let nx3 = drag.origX3, ny3 = drag.origY3;
          if (drag.mode === 'move') {
            nx1 += dx; ny1 += dy; nx2 += dx; ny2 += dy; nx3 += dx; ny3 += dy;
          } else if (drag.mode === 'p1') {
            nx1 = x; ny1 = y;
          } else if (drag.mode === 'p2') {
            nx2 = x; ny2 = y;
          } else if (drag.mode === 'p3') {
            nx3 = x; ny3 = y;
          }
          const price1 = yToPrice(series, ny1);
          const time1  = xToTime(chart, nx1);
          const price2 = yToPrice(series, ny2);
          const time2  = xToTime(chart, nx2);
          const price3 = yToPrice(series, ny3);
          const time3  = xToTime(chart, nx3);
          if (price1 != null && time1 != null && price2 != null && time2 != null && price3 != null && time3 != null) {
            dragPreviewRef.current = { kind: drag.kind, id: drag.id, price1, time1, price2, time2, price3, time3 };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'path' || drag.kind === 'brush') {
          const orig = drag.origPoints ?? [];
          const newScreenPoints = drag.mode === 'vertex' && drag.vertexIndex != null
            ? orig.map((p, i) => (i === drag.vertexIndex ? { x, y } : p))
            : orig.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          const pts = newScreenPoints
            .map((p) => {
              const price = yToPrice(series, p.y);
              const time  = xToTime(chart, p.x);
              return price != null && time != null ? { price, time } : null;
            })
            .filter((p): p is { price: number; time: number } => p != null);
          if (pts.length === orig.length && pts.length >= 2) {
            dragPreviewRef.current = { kind: drag.kind, id: drag.id, points: pts };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'arrowMark') {
          // single-point icon: only ever moved, never resized via drag
          const nx = drag.origX1 + dx, ny = drag.origY1 + dy;
          const price = yToPrice(series, ny);
          const time  = xToTime(chart, nx);
          if (price != null && time != null) {
            dragPreviewRef.current = { kind: 'arrowMark', id: drag.id, price, time };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'note') {
          // Text: single-anchor, only ever moved as a whole
          const nx = drag.origX1 + dx, ny = drag.origY1 + dy;
          const price = yToPrice(series, ny);
          const time  = xToTime(chart, nx);
          if (price != null && time != null) {
            dragPreviewRef.current = { kind: 'note', id: drag.id, price, time };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'position') {
          // origX1/origY1 = left edge x / entry y; origX2/origY2 = right edge x / target y; origY3 = stop y
          let nx1 = drag.origX1, nx2 = drag.origX2;
          let nyEntry = drag.origY1, nyTarget = drag.origY2, nyStop = drag.origY3;
          if (drag.mode === 'move') {
            nx1 += dx; nx2 += dx;
            nyEntry += dy; nyTarget += dy; nyStop += dy;
          } else if (drag.mode === 'target') {
            nyTarget = y;
          } else if (drag.mode === 'stop') {
            nyStop = y;
          } else if (drag.mode === 'width') {
            nx2 = x;
          }
          const entryPrice  = yToPrice(series, nyEntry);
          const targetPrice = yToPrice(series, nyTarget);
          const stopPrice   = yToPrice(series, nyStop);
          const time1 = xToTime(chart, nx1);
          const time2 = xToTime(chart, nx2);
          if (entryPrice != null && targetPrice != null && stopPrice != null && time1 != null && time2 != null) {
            dragPreviewRef.current = { kind: 'position', id: drag.id, entryPrice, targetPrice, stopPrice, time1, time2 };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'fibonacci') {
          let nx1 = drag.origX1, ny1 = drag.origY1, nx2 = drag.origX2, ny2 = drag.origY2;
          if (drag.mode === 'move') {
            nx1 += dx; ny1 += dy; nx2 += dx; ny2 += dy;
          } else if (drag.mode === 'p1') {
            nx1 = x; ny1 = y;
          } else {
            nx2 = x; ny2 = y;
          }
          const priceHigh = yToPrice(series, ny1);
          const timeHigh  = xToTime(chart, nx1);
          const priceLow  = yToPrice(series, ny2);
          const timeLow   = xToTime(chart, nx2);
          if (priceHigh != null && timeHigh != null && priceLow != null && timeLow != null) {
            dragPreviewRef.current = { kind: 'fibonacci', id: drag.id, priceHigh, timeHigh, priceLow, timeLow };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'flatChannel') {
          // p1: top price only, p2: right time edge only, p3 (width handle):
          // bottom price only, move: translate everything.
          let nx1 = drag.origX1, ny1 = drag.origY1, nx2 = drag.origX2;
          let widthY = drag.origY3;
          if (drag.mode === 'move') {
            nx1 += dx; ny1 += dy; nx2 += dx; widthY += dy;
          } else if (drag.mode === 'p1') {
            ny1 = y;
          } else if (drag.mode === 'p2') {
            nx2 = x;
          } else {
            widthY = y;
          }
          const price1 = yToPrice(series, ny1);
          const time1  = xToTime(chart, nx1);
          const time2  = xToTime(chart, nx2);
          const price3 = yToPrice(series, widthY);
          if (price1 != null && time1 != null && time2 != null && price3 != null) {
            dragPreviewRef.current = { kind: 'flatChannel', id: drag.id, price1, time1, time2, price3 };
            scheduleRender();
          }
          return;
        }

        if (drag.kind === 'disjointChannel') {
          const orig = drag.origPoints ?? [];
          if (orig.length !== 4) return;
          const idx = drag.mode === 'a1' ? 0 : drag.mode === 'a2' ? 1 : drag.mode === 'b1' ? 2 : drag.mode === 'b2' ? 3 : -1;
          const pts = orig.map((p, i) =>
            drag.mode === 'move' ? { x: p.x + dx, y: p.y + dy } : i === idx ? { x, y } : p);
          const [pA1, pA2, pB1, pB2] = pts;
          const priceA1 = yToPrice(series, pA1.y), timeA1 = xToTime(chart, pA1.x);
          const priceA2 = yToPrice(series, pA2.y), timeA2 = xToTime(chart, pA2.x);
          const priceB1 = yToPrice(series, pB1.y), timeB1 = xToTime(chart, pB1.x);
          const priceB2 = yToPrice(series, pB2.y), timeB2 = xToTime(chart, pB2.x);
          if (priceA1 != null && timeA1 != null && priceA2 != null && timeA2 != null &&
              priceB1 != null && timeB1 != null && priceB2 != null && timeB2 != null) {
            dragPreviewRef.current = {
              kind: 'disjointChannel', id: drag.id,
              priceA1, timeA1, priceA2, timeA2, priceB1, timeB1, priceB2, timeB2,
            };
            scheduleRender();
          }
          return;
        }

        // channel: 'p1'/'p2' reshape the baseline (length/angle), 'move' translates
        // everything, 'p3' (width handle) only changes the channel's height/offset
        let nx1 = drag.origX1, ny1 = drag.origY1, nx2 = drag.origX2, ny2 = drag.origY2;
        let widthY = drag.origY3;
        if (drag.mode === 'move') {
          nx1 += dx; ny1 += dy; nx2 += dx; ny2 += dy; widthY += dy;
        } else if (drag.mode === 'p1') {
          nx1 = x; ny1 = y;
        } else if (drag.mode === 'p2') {
          nx2 = x; ny2 = y;
        } else {
          widthY = y;
        }

        const price1 = yToPrice(series, ny1);
        const time1  = xToTime(chart, nx1);
        const price2 = yToPrice(series, ny2);
        const time2  = xToTime(chart, nx2);
        const xMidNow = (nx1 + nx2) / 2;
        const time3 = xToTime(chart, xMidNow);
        const price3 = yToPrice(series, widthY);
        if (price1 != null && time1 != null && price2 != null && time2 != null && time3 != null && price3 != null) {
          dragPreviewRef.current = { kind: 'channel', id: drag.id, price1, time1, price2, time2, price3, time3 };
          scheduleRender();
        }
        return;
      }

      if (isOverlayTarget(e)) return;

      const tool = activeToolRef.current;
      if (CAPTURE_TOOLS.has(tool)) return;

      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      mousePosRef.current = { x, y, inside };
      const price = inside && series ? yToPrice(series, y) : null;
      hoverPriceRef.current = price ?? null;

      if (!inside || !chart || !series) {
        if (magnetPointRef.current) { magnetPointRef.current = null; scheduleRender(); }
        return;
      }

      magnetPointRef.current = magnetEnabledRef.current
        ? computeMagnetSnap(x, y, chart, series, candlesRef.current)
        : null;

      // hovering a trend line/channel's endpoint/body shows a grab/move cursor
      // instead of the tool's normal cursor, signalling it can be dragged
      let hoverCursor: string | null = null;
      for (let i = drawingsRef.current.length - 1; i >= 0 && !drawingsHiddenRef.current && !drawingsLockedRef.current; i--) {
        const d = drawingsRef.current[i];
        if (d.type === 'trendline' || d.type === 'arrow' || d.type === 'priceNote' ||
            d.type === 'ray' || d.type === 'extendedLine' || d.type === 'infoLine' || d.type === 'trendAngle' ||
            d.type === 'gannFan' || d.type === 'cyclicLines' || d.type === 'timeCycles' || d.type === 'sineLine' ||
            d.type === 'fibTimeZone' || d.type === 'fibSpeedFan' || d.type === 'fibCircles' || d.type === 'fibSpeedArcs') {
          const x1 = timeToX(chart, d.time1), y1 = priceToY(series, d.price1);
          const x2 = timeToX(chart, d.time2), y2 = priceToY(series, d.price2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
          if (Math.hypot(x - x1, y - y1) < 8 || Math.hypot(x - x2, y - y2) < 8) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'hline') {
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'ns-resize'; break; }
        } else if (d.type === 'vline') {
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'ew-resize'; break; }
        } else if (d.type === 'hray' || d.type === 'crossline') {
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'channel' || d.type === 'rotatedRectangle' || d.type === 'fibChannel') {
          const lines = computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
          if (!lines) continue;
          const { x1, y1, x2, y2, y1b, y2b } = lines;
          const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;
          if (Math.hypot(x - x1, y - y1) < 8 || Math.hypot(x - x2, y - y2) < 8) { hoverCursor = 'grab'; break; }
          if (Math.hypot(x - wx, y - wy) < 8) { hoverCursor = 'ns-resize'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'flatChannel') {
          const lines = getFlatChannelLines(d, chart, series);
          if (!lines) continue;
          const { x1, y1, x2, y2, y1b, y2b } = lines;
          const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;
          if (Math.hypot(x - x1, y - y1) < 8) { hoverCursor = 'ns-resize'; break; }
          if (Math.hypot(x - x2, y - y2) < 8) { hoverCursor = 'ew-resize'; break; }
          if (Math.hypot(x - wx, y - wy) < 8) { hoverCursor = 'ns-resize'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'disjointChannel') {
          const xA1 = timeToX(chart, d.timeA1), yA1 = priceToY(series, d.priceA1);
          const xA2 = timeToX(chart, d.timeA2), yA2 = priceToY(series, d.priceA2);
          const xB1 = timeToX(chart, d.timeB1), yB1 = priceToY(series, d.priceB1);
          const xB2 = timeToX(chart, d.timeB2), yB2 = priceToY(series, d.priceB2);
          if (xA1 == null || yA1 == null || xA2 == null || yA2 == null ||
              xB1 == null || yB1 == null || xB2 == null || yB2 == null) continue;
          const nearAny = ([[xA1, yA1], [xA2, yA2], [xB1, yB1], [xB2, yB2]] as const)
            .some(([hx, hy]) => Math.hypot(x - hx, y - hy) < 8);
          if (nearAny) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'triangle' || d.type === 'arc' || d.type === 'curve' || d.type === 'doubleCurve' ||
            d.type === 'trendFibExtension' || d.type === 'sector' || d.type === 'fibWedge' || d.type === 'positionForecast') {
          const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
          if (!pts3) continue;
          const { x1, y1, x2, y2, x3, y3 } = pts3;
          const nearAny = Math.hypot(x - x1, y - y1) < 8 || Math.hypot(x - x2, y - y2) < 8 || Math.hypot(x - x3, y - y3) < 8;
          if (nearAny) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'rectangle' || d.type === 'circle' || d.type === 'ellipse' || d.type === 'priceRange' || d.type === 'dateRange' || d.type === 'datePriceRange' || d.type === 'gannBox' || d.type === 'gannSquare') {
          const x1 = timeToX(chart, d.time1), y1 = priceToY(series, d.price1);
          const x2 = timeToX(chart, d.time2), y2 = priceToY(series, d.price2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
          const nearCorner = Math.hypot(x - x1, y - y1) < 8 || Math.hypot(x - x2, y - y2) < 8 ||
            Math.hypot(x - x1, y - y2) < 8 || Math.hypot(x - x2, y - y1) < 8;
          if (nearCorner) { hoverCursor = 'nwse-resize'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'path' || d.type === 'polyline' || d.type === 'brush' || d.type === 'highlighter' ||
            d.type === 'abcd' || d.type === 'xabcd' || d.type === 'cypher' || d.type === 'threeDrives' || d.type === 'headShoulders') {
          const pts = d.points
            .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
            .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
          const isPathLikeHover = d.type === 'path' || d.type === 'polyline' ||
            d.type === 'abcd' || d.type === 'xabcd' || d.type === 'cypher' || d.type === 'threeDrives' || d.type === 'headShoulders';
          const nearVertex = isPathLikeHover && pts.some((p) => Math.hypot(x - p.x, y - p.y) < 8);
          if (nearVertex) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'fibonacci' || d.type === 'fibExtension') {
          const xH = timeToX(chart, d.timeHigh), yH = priceToY(series, d.priceHigh);
          const xL = timeToX(chart, d.timeLow),  yL = priceToY(series, d.priceLow);
          if (xH == null || yH == null || xL == null || yL == null) continue;
          if (Math.hypot(x - xH, y - yH) < 8 || Math.hypot(x - xL, y - yL) < 8) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'arrowMark' || d.type === 'text' || d.type === 'pin' ||
            d.type === 'flagMark' || d.type === 'priceLabel' || d.type === 'signpost' || d.type === 'anchoredVwap' ||
            d.type === 'note' || d.type === 'callout' || d.type === 'comment') {
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'longPosition' || d.type === 'shortPosition') {
          const x1 = timeToX(chart, d.time1), x2 = timeToX(chart, d.time2);
          const yEntry = priceToY(series, d.entryPrice);
          const yTarget = priceToY(series, d.targetPrice);
          const yStop = priceToY(series, d.stopPrice);
          if (x1 == null || x2 == null || yEntry == null || yTarget == null || yStop == null) continue;
          const midX = (x1 + x2) / 2;
          if (Math.hypot(x - midX, y - yTarget) < 8 || Math.hypot(x - midX, y - yStop) < 8) { hoverCursor = 'ns-resize'; break; }
          if (Math.hypot(x - x2, y - yEntry) < 8) { hoverCursor = 'ew-resize'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        }
      }

      if (hoverCursor) applyCursorValue(hoverCursor);
      else applyCursor(tool);
      scheduleRender();
    };

    const onWinDownCapture = (e: MouseEvent) => {
      if (isOverlayTarget(e)) return;
      const canvas = canvasRef.current;
      const chart  = sharedChartRef.current;
      const series = sharedSeriesRef.current;
      if (!canvas || !chart || !series) return;
      const tool = activeToolRef.current;
      if (CAPTURE_TOOLS.has(tool)) return;
      // locked drawings can't be dragged; hidden ones aren't interactive at all
      if (drawingsLockedRef.current || drawingsHiddenRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
        const d = drawingsRef.current[i];

        if (d.type === 'trendline' || d.type === 'arrow' || d.type === 'priceNote' ||
            d.type === 'ray' || d.type === 'extendedLine' || d.type === 'infoLine' || d.type === 'trendAngle' ||
            d.type === 'gannFan' || d.type === 'cyclicLines' || d.type === 'timeCycles' || d.type === 'sineLine' ||
            d.type === 'fibTimeZone' || d.type === 'fibSpeedFan' || d.type === 'fibCircles' || d.type === 'fibSpeedArcs') {
          const x1 = timeToX(chart, d.time1), y1 = priceToY(series, d.price1);
          const x2 = timeToX(chart, d.time2), y2 = priceToY(series, d.price2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) continue;

          const nearP1 = Math.hypot(x - x1, y - y1) < 8;
          const nearP2 = Math.hypot(x - x2, y - y2) < 8;
          if (!nearP1 && !nearP2 && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          // grabbed a trend line/arrow/price note (or one of the new line
          // variants): block the chart from starting a pan on this mousedown
          // and take over the gesture as a drag instead
          dragRef.current = {
            active: true, kind: 'trendline', id: d.id,
            mode: nearP1 ? 'p1' : nearP2 ? 'p2' : 'move',
            startX: x, startY: y,
            origX1: x1, origY1: y1, origX2: x2, origY2: y2, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('grabbing');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'hline') {
          const lineY = priceToY(series, d.price);
          if (lineY == null || !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'hline', id: d.id, mode: 'move',
            startX: x, startY: y,
            origX1: 0, origY1: lineY, origX2: 0, origY2: 0, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('ns-resize');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'vline') {
          const lineX = timeToX(chart, d.time);
          if (lineX == null || !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'vline', id: d.id, mode: 'move',
            startX: x, startY: y,
            origX1: lineX, origY1: 0, origX2: 0, origY2: 0, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('ew-resize');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'hray' || d.type === 'crossline') {
          const lineY = priceToY(series, d.price);
          const lineX = timeToX(chart, d.time);
          if (lineY == null || lineX == null || !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'hray', id: d.id, mode: 'move',
            startX: x, startY: y,
            origX1: lineX, origY1: lineY, origX2: 0, origY2: 0, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('move');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'channel' || d.type === 'rotatedRectangle' || d.type === 'fibChannel') {
          const lines = computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
          if (!lines) continue;
          const { x1, y1, x2, y2, y1b, y2b } = lines;
          const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;

          const nearP1 = Math.hypot(x - x1, y - y1) < 8;
          const nearP2 = Math.hypot(x - x2, y - y2) < 8;
          const nearWidth = Math.hypot(x - wx, y - wy) < 8;
          if (!nearP1 && !nearP2 && !nearWidth && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'channel', id: d.id,
            mode: nearP1 ? 'p1' : nearP2 ? 'p2' : nearWidth ? 'p3' : 'move',
            startX: x, startY: y,
            origX1: x1, origY1: y1, origX2: x2, origY2: y2, origX3: wx, origY3: wy,
          };
          selectDrawing(d.id);
          applyCursorValue(nearWidth ? 'ns-resize' : 'grabbing');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'flatChannel') {
          const lines = getFlatChannelLines(d, chart, series);
          if (!lines) continue;
          const { x1, y1, x2, y2, y1b } = lines;
          const wx = (x1 + x2) / 2, wy = y1b;

          const nearP1 = Math.hypot(x - x1, y - y1) < 8;
          const nearP2 = Math.hypot(x - x2, y - y2) < 8;
          const nearWidth = Math.hypot(x - wx, y - wy) < 8;
          if (!nearP1 && !nearP2 && !nearWidth && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'flatChannel', id: d.id,
            mode: nearP1 ? 'p1' : nearP2 ? 'p2' : nearWidth ? 'p3' : 'move',
            startX: x, startY: y,
            origX1: x1, origY1: y1, origX2: x2, origY2: y2, origX3: wx, origY3: wy,
          };
          selectDrawing(d.id);
          applyCursorValue(nearP1 ? 'ns-resize' : nearP2 ? 'ew-resize' : nearWidth ? 'ns-resize' : 'move');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'disjointChannel') {
          const xA1 = timeToX(chart, d.timeA1), yA1 = priceToY(series, d.priceA1);
          const xA2 = timeToX(chart, d.timeA2), yA2 = priceToY(series, d.priceA2);
          const xB1 = timeToX(chart, d.timeB1), yB1 = priceToY(series, d.priceB1);
          const xB2 = timeToX(chart, d.timeB2), yB2 = priceToY(series, d.priceB2);
          if (xA1 == null || yA1 == null || xA2 == null || yA2 == null ||
              xB1 == null || yB1 == null || xB2 == null || yB2 == null) continue;

          const nearA1 = Math.hypot(x - xA1, y - yA1) < 8;
          const nearA2 = Math.hypot(x - xA2, y - yA2) < 8;
          const nearB1 = Math.hypot(x - xB1, y - yB1) < 8;
          const nearB2 = Math.hypot(x - xB2, y - yB2) < 8;
          if (!nearA1 && !nearA2 && !nearB1 && !nearB2 && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'disjointChannel', id: d.id,
            mode: nearA1 ? 'a1' : nearA2 ? 'a2' : nearB1 ? 'b1' : nearB2 ? 'b2' : 'move',
            startX: x, startY: y,
            origX1: 0, origY1: 0, origX2: 0, origY2: 0, origX3: 0, origY3: 0,
            origPoints: [{ x: xA1, y: yA1 }, { x: xA2, y: yA2 }, { x: xB1, y: yB1 }, { x: xB2, y: yB2 }],
          };
          selectDrawing(d.id);
          applyCursorValue(nearA1 || nearA2 || nearB1 || nearB2 ? 'grabbing' : 'move');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'triangle' || d.type === 'arc' || d.type === 'curve' || d.type === 'doubleCurve' ||
            d.type === 'trendFibExtension' || d.type === 'sector' || d.type === 'fibWedge' || d.type === 'positionForecast') {
          const pts3 = get3PointScreen(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
          if (!pts3) continue;
          const { x1, y1, x2, y2, x3, y3 } = pts3;

          const nearP1 = Math.hypot(x - x1, y - y1) < 8;
          const nearP2 = Math.hypot(x - x2, y - y2) < 8;
          const nearP3 = Math.hypot(x - x3, y - y3) < 8;
          if (!nearP1 && !nearP2 && !nearP3 && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: d.type, id: d.id,
            mode: nearP1 ? 'p1' : nearP2 ? 'p2' : nearP3 ? 'p3' : 'move',
            startX: x, startY: y,
            origX1: x1, origY1: y1, origX2: x2, origY2: y2, origX3: x3, origY3: y3,
          };
          selectDrawing(d.id);
          applyCursorValue(nearP1 || nearP2 || nearP3 ? 'grabbing' : 'move');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'rectangle' || d.type === 'circle' || d.type === 'ellipse' || d.type === 'priceRange' || d.type === 'dateRange' || d.type === 'datePriceRange' || d.type === 'gannBox' || d.type === 'gannSquare') {
          const x1 = timeToX(chart, d.time1), y1 = priceToY(series, d.price1);
          const x2 = timeToX(chart, d.time2), y2 = priceToY(series, d.price2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) continue;

          const nearP1 = Math.hypot(x - x1, y - y1) < 8;
          const nearP2 = Math.hypot(x - x2, y - y2) < 8;
          const nearC2 = Math.hypot(x - x1, y - y2) < 8; // mixed corner: time1, price2
          const nearC3 = Math.hypot(x - x2, y - y1) < 8; // mixed corner: time2, price1
          if (!nearP1 && !nearP2 && !nearC2 && !nearC3 && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'box', id: d.id,
            mode: nearP1 ? 'p1' : nearP2 ? 'p2' : nearC2 ? 'c2' : nearC3 ? 'c3' : 'move',
            startX: x, startY: y,
            origX1: x1, origY1: y1, origX2: x2, origY2: y2, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('grabbing');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'path' || d.type === 'polyline' || d.type === 'brush' || d.type === 'highlighter' ||
            d.type === 'abcd' || d.type === 'xabcd' || d.type === 'cypher' || d.type === 'threeDrives' || d.type === 'headShoulders') {
          const screenPts = d.points
            .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
            .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
          if (screenPts.length < 2) continue;

          // Path/Polyline's individual vertices can be dragged to reshape them;
          // Brush/Highlighter are freehand and only support moving the whole
          // stroke. Polyline/Highlighter reuse the 'path'/'brush' drag kinds
          // respectively — the drag logic only cares about vertex-vs-move
          // capability, not the exact original type. The 5 Patterns-group
          // tools (ABCD/XABCD/Cypher/Three Drives/Head & Shoulders) are
          // vertex-draggable like Path/Polyline, so they reuse the 'path' kind.
          const isPathLike = d.type === 'path' || d.type === 'polyline' ||
            d.type === 'abcd' || d.type === 'xabcd' || d.type === 'cypher' || d.type === 'threeDrives' || d.type === 'headShoulders';
          let vertexIndex: number | null = null;
          if (isPathLike) {
            for (let vi = 0; vi < screenPts.length; vi++) {
              if (Math.hypot(x - screenPts[vi].x, y - screenPts[vi].y) < 8) { vertexIndex = vi; break; }
            }
          }
          if (vertexIndex == null && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: isPathLike ? 'path' : 'brush', id: d.id,
            mode: vertexIndex != null ? 'vertex' : 'move',
            vertexIndex: vertexIndex ?? undefined,
            startX: x, startY: y,
            origX1: 0, origY1: 0, origX2: 0, origY2: 0, origX3: 0, origY3: 0,
            origPoints: screenPts,
          };
          selectDrawing(d.id);
          applyCursorValue(vertexIndex != null ? 'grabbing' : 'move');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'fibonacci' || d.type === 'fibExtension') {
          const xH = timeToX(chart, d.timeHigh), yH = priceToY(series, d.priceHigh);
          const xL = timeToX(chart, d.timeLow),  yL = priceToY(series, d.priceLow);
          if (xH == null || yH == null || xL == null || yL == null) continue;

          const nearHigh = Math.hypot(x - xH, y - yH) < 8;
          const nearLow  = Math.hypot(x - xL, y - yL) < 8;
          if (!nearHigh && !nearLow && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'fibonacci', id: d.id,
            mode: nearHigh ? 'p1' : nearLow ? 'p2' : 'move',
            startX: x, startY: y,
            origX1: xH, origY1: yH, origX2: xL, origY2: yL, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('grabbing');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'arrowMark' || d.type === 'pin' || d.type === 'flagMark' ||
            d.type === 'priceLabel' || d.type === 'signpost' || d.type === 'anchoredVwap' ||
            d.type === 'note' || d.type === 'callout' || d.type === 'comment') {
          const x1 = timeToX(chart, d.time), y1 = priceToY(series, d.price);
          if (x1 == null || y1 == null) continue;
          if (!hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'arrowMark', id: d.id,
            mode: 'move',
            startX: x, startY: y,
            origX1: x1, origY1: y1, origX2: 0, origY2: 0, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('grabbing');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'text') {
          const x1 = timeToX(chart, d.time), y1 = priceToY(series, d.price);
          if (x1 == null || y1 == null) continue;
          if (!hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'note', id: d.id,
            mode: 'move',
            startX: x, startY: y,
            origX1: x1, origY1: y1, origX2: 0, origY2: 0, origX3: 0, origY3: 0,
          };
          selectDrawing(d.id);
          applyCursorValue('grabbing');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }

        if (d.type === 'longPosition' || d.type === 'shortPosition') {
          const x1 = timeToX(chart, d.time1), x2 = timeToX(chart, d.time2);
          const yEntry  = priceToY(series, d.entryPrice);
          const yTarget = priceToY(series, d.targetPrice);
          const yStop   = priceToY(series, d.stopPrice);
          if (x1 == null || x2 == null || yEntry == null || yTarget == null || yStop == null) continue;
          const midX = (x1 + x2) / 2;

          const nearTarget = Math.hypot(x - midX, y - yTarget) < 8;
          const nearStop   = Math.hypot(x - midX, y - yStop) < 8;
          const nearWidth  = Math.hypot(x - x2, y - yEntry) < 8;
          if (!nearTarget && !nearStop && !nearWidth && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: 'position', id: d.id,
            mode: nearTarget ? 'target' : nearStop ? 'stop' : nearWidth ? 'width' : 'move',
            startX: x, startY: y,
            origX1: x1, origY1: yEntry, origX2: x2, origY2: yTarget, origX3: 0, origY3: yStop,
          };
          selectDrawing(d.id);
          applyCursorValue(nearWidth ? 'ew-resize' : nearTarget || nearStop ? 'ns-resize' : 'move');
          e.preventDefault();
          e.stopPropagation();
          scheduleRender();
          return;
        }
      }
    };

    const onWinUp = () => {
      // Safety net: if a Brush/Highlighter drag left the canvas bounds before
      // the button was released, our own onMouseUp never fires — finalize here instead.
      const fr = freeformRef.current;
      if (fr.active && (fr.tool === 'brush' || fr.tool === 'highlighter')) finalizeFreeform();

      const drag = dragRef.current;
      if (!drag?.active) return;
      const preview = dragPreviewRef.current;
      if (preview && preview.id === drag.id) {
        if (preview.kind === 'trendline' || preview.kind === 'box') {
          updateDrawing(drag.id, {
            price1: preview.price1, time1: preview.time1,
            price2: preview.price2, time2: preview.time2,
          });
        } else if (preview.kind === 'channel' || preview.kind === 'triangle' || preview.kind === 'arc' ||
            preview.kind === 'curve' || preview.kind === 'doubleCurve' || preview.kind === 'trendFibExtension' ||
            preview.kind === 'sector' || preview.kind === 'fibWedge' || preview.kind === 'positionForecast') {
          updateDrawing(drag.id, {
            price1: preview.price1, time1: preview.time1,
            price2: preview.price2, time2: preview.time2,
            price3: preview.price3, time3: preview.time3,
          });
        } else if (preview.kind === 'flatChannel') {
          updateDrawing(drag.id, {
            price1: preview.price1, time1: preview.time1,
            time2: preview.time2, price3: preview.price3,
          });
        } else if (preview.kind === 'disjointChannel') {
          updateDrawing(drag.id, {
            priceA1: preview.priceA1, timeA1: preview.timeA1,
            priceA2: preview.priceA2, timeA2: preview.timeA2,
            priceB1: preview.priceB1, timeB1: preview.timeB1,
            priceB2: preview.priceB2, timeB2: preview.timeB2,
          });
        } else if (preview.kind === 'path' || preview.kind === 'brush') {
          updateDrawing(drag.id, { points: preview.points });
        } else if (preview.kind === 'fibonacci') {
          updateDrawing(drag.id, {
            priceHigh: preview.priceHigh, timeHigh: preview.timeHigh,
            priceLow: preview.priceLow, timeLow: preview.timeLow,
          });
        } else if (preview.kind === 'arrowMark' || preview.kind === 'note') {
          updateDrawing(drag.id, { price: preview.price, time: preview.time });
        } else if (preview.kind === 'position') {
          updateDrawing(drag.id, {
            entryPrice: preview.entryPrice, targetPrice: preview.targetPrice, stopPrice: preview.stopPrice,
            time1: preview.time1, time2: preview.time2,
          });
        } else if (preview.kind === 'hline') {
          updateDrawing(drag.id, { price: preview.price });
        } else if (preview.kind === 'vline') {
          updateDrawing(drag.id, { time: preview.time });
        } else if (preview.kind === 'hray') {
          updateDrawing(drag.id, { price: preview.price, time: preview.time });
        }
      }
      dragRef.current = null;
      dragPreviewRef.current = null;
      applyCursor(activeToolRef.current);
      scheduleRender();
    };

    const onWinDown = (e: MouseEvent) => {
      if (dragRef.current?.active) return; // handled by onWinDownCapture
      if (isOverlayTarget(e)) return;
      const canvas = canvasRef.current;
      const chart  = sharedChartRef.current;
      const series = sharedSeriesRef.current;
      if (!canvas || !chart || !series) return;
      const tool = activeToolRef.current;
      if (CAPTURE_TOOLS.has(tool)) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      // hidden drawings aren't selectable (locked ones still are — view-only)
      let hit: string | null = null;
      for (let i = drawingsRef.current.length - 1; i >= 0 && !drawingsHiddenRef.current; i--) {
        if (hitTest(drawingsRef.current[i], x, y, chart, series, candlesRef.current)) {
          hit = drawingsRef.current[i].id;
          break;
        }
      }
      selectDrawing(hit);
    };

    // Double-click an existing Text/Price Note (while a cursor-group tool is
    // active, so the canvas itself isn't capturing events) reopens it for editing.
    const onWinDblClick = (e: MouseEvent) => {
      if (isOverlayTarget(e)) return;
      const canvas = canvasRef.current;
      const chart  = sharedChartRef.current;
      const series = sharedSeriesRef.current;
      if (!canvas || !chart || !series) return;
      const tool = activeToolRef.current;
      if (CAPTURE_TOOLS.has(tool)) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
        const d = drawingsRef.current[i];
        if (d.type !== 'text' && d.type !== 'signpost' && d.type !== 'note' &&
            d.type !== 'callout' && d.type !== 'comment') continue;
        if (!hitTest(d, x, y, chart, series, candlesRef.current)) continue;
        const tx = timeToX(chart, d.time), ty = priceToY(series, d.price);
        if (tx == null || ty == null) continue;
        selectDrawing(d.id);
        if (d.type === 'text') {
          setEditing({ id: d.id, x: tx, y: ty, value: d.text, isNew: false });
        } else if (d.type === 'signpost') {
          // Signpost's sign box sits `poleH + signH` (26 + 22 = 48) above the
          // anchor — same offset used in renderDrawing and in the placement
          // setEditing call below, so the textarea lines up with the sign.
          setEditing({ id: d.id, x: tx, y: ty - 48, value: d.text ?? '', isNew: false });
        } else if (d.type === 'note') {
          // Same offset as Note's placement setEditing call — see there.
          setEditing({ id: d.id, x: tx + 20, y: ty - 10, value: d.text ?? '', isNew: false });
        } else if (d.type === 'callout') {
          // Same offset as Callout's placement setEditing call — see there.
          setEditing({ id: d.id, x: tx + 24, y: ty - 68, value: d.text ?? '', isNew: false });
        } else {
          // Same offset as Comment's placement setEditing call — see there.
          setEditing({ id: d.id, x: tx - 13, y: ty - 36, value: d.text ?? '', isNew: false });
        }
        return;
      }
    };

    window.addEventListener('mousemove', onWinMove);
    window.addEventListener('mousedown', onWinDownCapture, true);
    window.addEventListener('mousedown', onWinDown);
    window.addEventListener('mouseup', onWinUp);
    window.addEventListener('dblclick', onWinDblClick);
    return () => {
      window.removeEventListener('mousemove', onWinMove);
      window.removeEventListener('mousedown', onWinDownCapture, true);
      window.removeEventListener('mousedown', onWinDown);
      window.removeEventListener('mouseup', onWinUp);
      window.removeEventListener('dblclick', onWinDblClick);
    };
  }, [scheduleRender, selectDrawing, updateDrawing, applyCursor, applyCursorValue, finalizeFreeform, setEditing]);

  // ── keyboard: Delete / Escape ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // typing Backspace/Escape inside the text-edit textarea must not also
      // delete the selected drawing or reset in-progress drawing state
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      if (e.key === 'Escape') {
        drawingRef.current.active = false;
        drawingRef.current.step   = 0;
        freeformRef.current.active = false;
        freeformRef.current.tool   = null;
        freeformRef.current.points = [];
        measureResultRef.current = null;
        // Cancelling an in-progress placement above doesn't touch selection —
        // without this, Escape on an already-placed, already-selected drawing
        // did nothing, so its floating style toolbar stayed mounted. If the
        // user then switched symbol/timeframe with that stale selection still
        // active, the toolbar's position math (keyed off the drawing's old
        // time/price) degenerated to a clamped top-left coordinate instead of
        // going off-screen, so it looked stuck in the drawing rail.
        if (selectedIdRef.current) selectDrawing(null);
        scheduleRender();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedIdRef.current;
        if (sel && !drawingsLockedRef.current) deleteDrawing(sel);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        // Mid-placement (multi-click shape or brush stroke in progress): treat
        // Ctrl+Z as a clean cancel of that in-progress shape, same as Escape,
        // rather than reaching back into history — the shape isn't committed
        // to `drawings` yet, so there'd be nothing there for it to undo anyway.
        if (drawingRef.current.active || freeformRef.current.active) {
          e.preventDefault();
          drawingRef.current.active = false;
          drawingRef.current.step   = 0;
          freeformRef.current.active = false;
          freeformRef.current.tool   = null;
          freeformRef.current.points = [];
          measureResultRef.current = null;
          scheduleRender();
        } else if (!drawingsLockedRef.current) {
          e.preventDefault();
          undo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteDrawing, scheduleRender, undo, selectDrawing]);

  // Trendline/hline/rectangle/fibonacci/eraser capture all events (chart
  // pan/zoom blocked — intentional while placing points or erasing).
  // Cursor-group tools (cross/dot/arrow/demonstration/eraser) pass events
  // through so chart crosshair/zoom/pan still work; see window listeners above.
  const capturesPointerEvents = CAPTURE_TOOLS.has(activeTool);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ zIndex: 50, pointerEvents: capturesPointerEvents ? 'all' : 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: CURSOR_STYLE[activeTool] ?? 'crosshair', pointerEvents: capturesPointerEvents ? 'all' : 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      />

      {editing && (
        <textarea
          data-drawing-overlay="text-edit"
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
          }}
          placeholder="Text…"
          className="absolute text-sm leading-snug"
          style={{
            left: editing.x,
            top: editing.y - 2,
            minWidth: 120,
            maxWidth: 280,
            minHeight: 24,
            zIndex: 70,
            pointerEvents: 'auto',
            background: 'transparent',
            color: '#d1d4dc',
            border: '1px dashed #2196F3',
            borderRadius: 4,
            padding: '2px 5px',
            resize: 'none',
            outline: 'none',
          }}
        />
      )}
    </div>
  );
});
