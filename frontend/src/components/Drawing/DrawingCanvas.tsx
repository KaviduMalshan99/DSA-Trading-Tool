import { useEffect, useRef, useCallback, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useDrawingStore, type Drawing, type DrawingTool } from '../../store/drawingStore';
import { useMarketStore } from '../../store/marketStore';
import type { Candle } from '../../types/market';

// Tools that should own mouse events on the overlay canvas (blocking chart
// pan/zoom underneath). Cursor-group tools (cross/dot/arrow/demonstration/eraser)
// deliberately do NOT capture, so the chart stays pannable by default.
const CAPTURE_TOOLS = new Set<DrawingTool>([
  'trendline', 'hline', 'hray', 'vline', 'rectangle', 'fibonacci', 'channel', 'regression', 'eraser',
  'rotatedRectangle', 'circle', 'path', 'arrowMarker', 'arrowTool', 'arrowMarkUp', 'arrowMarkDown', 'brush',
  'text', 'priceNote', 'measure', 'zoomIn',
  'longPosition', 'shortPosition', 'priceRange', 'dateRange',
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
  hline: 1,
  hray: 1,
  vline: 1,
  rectangle: 2,
  fibonacci: 2,
  channel: 3,
  regression: 2,
  rotatedRectangle: 3,
  circle: 2,
  arrowTool: 2,
  arrowMarker: 2,
  arrowMarkUp: 1,
  arrowMarkDown: 1,
  text: 1,
  priceNote: 2,
  measure: 2,
  zoomIn: 2,
  longPosition: 1,
  shortPosition: 1,
  priceRange: 2,
  dateRange: 2,
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
  const interval = Math.floor(last.t / 1000) - Math.floor(prev.t / 1000);
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
  const lastTime = Math.floor(candles[lastIdx].t / 1000);
  const firstTime = Math.floor(candles[0].t / 1000);
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
  const anchorTime = Math.floor(candles[anchorIdx].t / 1000);
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
    .map((c) => ({ t: Math.floor(c.t / 1000), c: c.c }))
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

// ── Measure tool: a transient (non-persisted) stats readout between two
// clicked anchor points — price change, % change, elapsed time, bar count ────

interface MeasureStats { priceDiff: number; pricePct: number; timeDiffSec: number; bars: number }

function computeMeasureStats(price1: number, time1: number, price2: number, time2: number, candles: Candle[]): MeasureStats {
  const priceDiff = price2 - price1;
  const pricePct = price1 !== 0 ? (priceDiff / price1) * 100 : 0;
  const timeDiffSec = Math.abs(time2 - time1);
  const lo = Math.min(time1, time2), hi = Math.max(time1, time2);
  const bars = candles.filter((c) => { const t = Math.floor(c.t / 1000); return t >= lo && t <= hi; }).length;
  return { priceDiff, pricePct, timeDiffSec, bars };
}

// Rounded dark label bubble shared by Price Range / Date Range — `y` is the
// bubble's top edge, horizontally centered on `cx`.
function drawRangeLabel(ctx: CanvasRenderingContext2D, cx: number, y: number, text: string) {
  ctx.font = 'bold 12px sans-serif';
  const textW = ctx.measureText(text).width;
  const padX = 8, h = 22;
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
  ctx.fillText(text, x + padX, y + h / 2 + 1);
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

  } else if (d.type === 'circle') {
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

  } else if (d.type === 'path' || d.type === 'brush') {
    const pts = d.points
      .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    if (pts.length < 2) { ctx.restore(); return; }

    const baseColor = d.color ?? '#2196F3';
    ctx.strokeStyle = eraserHover ? '#f85149' : hexToRgba(baseColor, d.opacity ?? 100);
    ctx.lineWidth = (d.width ?? (d.type === 'brush' ? 2 : 1.5)) + (selected ? 0.5 : 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (d.type === 'path') ctx.setLineDash(d.dash === 'dashed' ? [8, 4] : d.dash === 'dotted' ? [2, 3] : []);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Path (unlike Brush) ends in an arrowhead, using the direction of its last segment.
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

    if (selected && d.type === 'path') {
      ctx.fillStyle = eraserHover ? '#f85149' : baseColor;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
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
    const bars = candles.filter((c) => { const t = Math.floor(c.t / 1000); return t >= lo && t <= hi; }).length;
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

  } else if (d.type === 'fibonacci') {
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

    FIB_LEVELS.forEach(({ pct: defaultPct, color: defaultColor }, i) => {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) return;
      const pct = cfg?.pct ?? defaultPct;
      const price = d.priceHigh - pct * range;
      const y = priceToY(series, price);
      if (y == null) return;

      const lineColor = eraserHover ? '#f85149' : (cfg?.color ?? defaultColor);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = d.levelWidth ?? (pct === 0.618 ? 1.5 : 1);
      ctx.setLineDash(levelDash);
      ctx.globalAlpha = selected ? 1 : 0.85;
      ctx.beginPath();
      ctx.moveTo(spanLeft, y);
      ctx.lineTo(spanRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // label on right
      const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ctx.fillStyle = lineColor;
      ctx.font = '10px monospace';
      ctx.fillText(`${pct}  ${priceStr}`, Math.min(xRight + 4, W - 120), y - 3);
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

  if (d.type === 'trendline') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL;
  }

  if (d.type === 'channel') {
    const lines = getChannelLines(d, chart, series);
    if (!lines) return false;
    const { x1, y1, x2, y2, y1b, y2b } = lines;
    return distToSegment(mx, my, x1, y1, x2, y2) < TOL || distToSegment(mx, my, x1, y1b, x2, y2b) < TOL;
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

  if (d.type === 'rectangle') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    const lx = Math.min(x1, x2), rx = Math.max(x1, x2);
    const ty = Math.min(y1, y2), by = Math.max(y1, y2);
    // near any edge
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

  if (d.type === 'circle') {
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

  if (d.type === 'path' || d.type === 'brush') {
    const pts = d.points
      .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
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

  if (d.type === 'priceRange' || d.type === 'dateRange') {
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

  if (d.type === 'fibonacci') {
    const range = d.priceHigh - d.priceLow;
    for (let i = 0; i < FIB_LEVELS.length; i++) {
      const cfg = d.levels?.[i];
      if (cfg?.enabled === false) continue;
      const pct = cfg?.pct ?? FIB_LEVELS[i].pct;
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
    const diff = Math.abs(Math.floor(c.t / 1000) - timeSec);
    if (diff < bestTimeDiff) { bestTimeDiff = diff; nearest = c; }
  }

  const ohlc = [nearest.o, nearest.h, nearest.l, nearest.c];
  let snapPrice = ohlc[0];
  let bestPriceDiff = Infinity;
  for (const p of ohlc) {
    const diff = Math.abs(p - price);
    if (diff < bestPriceDiff) { bestPriceDiff = diff; snapPrice = p; }
  }

  const snapTime = Math.floor(nearest.t / 1000);
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

  let nearestTime = Math.floor(candles[0].t / 1000);
  let bestDiff = Infinity;
  for (const candle of candles) {
    const candleTime = Math.floor(candle.t / 1000);
    const diff = Math.abs(candleTime - hoveredTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      nearestTime = candleTime;
    }
  }
  return nearestTime;
}

// ── main component ────────────────────────────────────────────────────────────

export function DrawingCanvas({ sharedChartRef, sharedSeriesRef }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);

  // drawing-in-progress state stored in refs so we don't re-render mid-draw.
  // Up to 3 anchor points are tracked — most tools use 1-2, Parallel Channel uses all 3.
  const drawingRef = useRef<{
    active: boolean;
    step: number;
    x1: number; y1: number;
    x2: number; y2: number;
    x3: number; y3: number;
  }>({ active: false, step: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0 });

  // Path/Brush use a variable-length point list instead of the fixed 1-3 point
  // scheme above. Path grows one point per click and finishes on double-click;
  // Brush grows continuously while the mouse is held down and finishes on release.
  const freeformRef = useRef<{
    active: boolean;
    tool: 'path' | 'brush' | null;
    points: { x: number; y: number }[];
  }>({ active: false, tool: null, points: [] });

  const {
    activeTool, drawings, selectedId, magnetEnabled, lastCursorMode,
    keepToolActive, drawingsLocked, drawingsHidden,
    addDrawing, updateDrawing, deleteDrawing, selectDrawing, setTool,
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
    kind: 'trendline' | 'channel' | 'fibonacci' | 'box' | 'path' | 'brush' | 'arrowMark' | 'note' | 'position';
    id: string;
    mode: 'move' | 'p1' | 'p2' | 'p3' | 'c2' | 'c3' | 'vertex' | 'target' | 'stop' | 'width';
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
    | { kind: 'fibonacci'; id: string; priceHigh: number; timeHigh: number; priceLow: number; timeLow: number }
    | { kind: 'box'; id: string; price1: number; time1: number; price2: number; time2: number }
    | { kind: 'path' | 'brush'; id: string; points: { price: number; time: number }[] }
    | { kind: 'arrowMark'; id: string; price: number; time: number }
    | { kind: 'note'; id: string; price: number; time: number }
    | { kind: 'position'; id: string; entryPrice: number; targetPrice: number; stopPrice: number; time1: number; time2: number }
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
          if (drag.kind === 'trendline' && (d.type === 'trendline' || d.type === 'arrow' || d.type === 'priceNote')) {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2 };
          } else if (drag.kind === 'channel' && (d.type === 'channel' || d.type === 'rotatedRectangle')) {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2,
              price3: drag.price3, time3: drag.time3 };
          } else if (drag.kind === 'fibonacci' && d.type === 'fibonacci') {
            dd = { ...d, priceHigh: drag.priceHigh, timeHigh: drag.timeHigh, priceLow: drag.priceLow, timeLow: drag.timeLow };
          } else if (drag.kind === 'box' && (d.type === 'rectangle' || d.type === 'circle' || d.type === 'priceRange' || d.type === 'dateRange')) {
            dd = { ...d, price1: drag.price1, time1: drag.time1, price2: drag.price2, time2: drag.time2 };
          } else if (drag.kind === 'path' && d.type === 'path') {
            dd = { ...d, points: drag.points };
          } else if (drag.kind === 'brush' && d.type === 'brush') {
            dd = { ...d, points: drag.points };
          } else if (drag.kind === 'arrowMark' && d.type === 'arrowMark') {
            dd = { ...d, price: drag.price, time: drag.time };
          } else if (drag.kind === 'note' && d.type === 'text') {
            dd = { ...d, price: drag.price, time: drag.time };
          } else if (drag.kind === 'position' && (d.type === 'longPosition' || d.type === 'shortPosition')) {
            dd = { ...d, entryPrice: drag.entryPrice, targetPrice: drag.targetPrice, stopPrice: drag.stopPrice, time1: drag.time1, time2: drag.time2 };
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
        if (price1 != null && time1 != null) {
          let preview: Drawing | null = null;
          if (tool === 'trendline' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'trendline', price1, time1, price2, time2 };
          else if (tool === 'priceNote' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'priceNote', price1, time1, price2, time2 };
          else if (tool === 'priceRange' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'priceRange', price1, time1, price2, time2 };
          else if (tool === 'dateRange' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'dateRange', price1, time1, price2, time2 };
          else if (tool === 'rectangle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'rectangle', price1, time1, price2, time2 };
          else if (tool === 'fibonacci' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'fibonacci',
              priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
              priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 };
          else if (tool === 'channel' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'channel', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'rotatedRectangle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'rotatedRectangle', price1, time1, price2, time2,
              price3: price3 ?? price2, time3: time3 ?? time2 };
          else if (tool === 'circle' && price2 != null && time2 != null)
            preview = { id: '__preview', type: 'circle', price1, time1, price2, time2 };
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
        const isSingleClickTool = tool === 'hline' || tool === 'hray' || tool === 'vline' ||
          tool === 'arrowMarkUp' || tool === 'arrowMarkDown' || tool === 'longPosition' || tool === 'shortPosition';
        if (isSingleClickTool && mousePosRef.current.inside) {
          const { x: mx, y: my } = mousePosRef.current;
          const price = yToPrice(series, my);
          const time  = xToTime(chart, mx);
          if (price != null && time != null) {
            let preview: Drawing | null = null;
            if (tool === 'hline') preview = { id: '__preview', type: 'hline', price };
            else if (tool === 'hray') preview = { id: '__preview', type: 'hray', price, time };
            else if (tool === 'vline') preview = { id: '__preview', type: 'vline', time };
            else if (tool === 'longPosition' || tool === 'shortPosition') {
              const posBox = defaultPositionBox(tool, price, time, my, series, candlesRef.current);
              if (posBox) preview = { id: '__preview', type: tool, ...posBox };
            }
            else preview = { id: '__preview', type: 'arrowMark', variant: tool === 'arrowMarkUp' ? 'up' : 'down', price, time };
            if (preview) {
              ctx.globalAlpha = 0.6;
              renderDrawing(ctx, W, H, preview, chart, series, candlesRef.current, false);
              ctx.globalAlpha = 1;
            }
          }
        }

        // Path/Brush: variable-length point list, not the fixed-count drawingRef above.
        const fr = freeformRef.current;
        if (fr.active && fr.points.length >= 1) {
          ctx.save();
          ctx.strokeStyle = 'rgba(33,150,243,0.9)';
          ctx.lineWidth = fr.tool === 'brush' ? 2 : 1.5;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          if (fr.tool === 'path') ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(fr.points[0].x, fr.points[0].y);
          for (let i = 1; i < fr.points.length; i++) ctx.lineTo(fr.points[i].x, fr.points[i].y);
          if (fr.tool === 'path' && mousePosRef.current.inside) {
            ctx.lineTo(mousePosRef.current.x, mousePosRef.current.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          if (fr.tool === 'path') {
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
    // Only auto-revert if Text is still the active tool — if this commit was
    // triggered by switching to a *different* tool mid-edit, that tool choice
    // must win, not get clobbered back to the cursor.
    if (!keepToolActiveRef.current && activeToolRef.current === 'text') setTool(lastCursorModeRef.current);
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
    if (activeTool !== 'text' && editingRef.current) commitEdit();
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
        addDrawing({ id, type: tool, points: pts });
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

    if (tool === 'brush') {
      const fr = freeformRef.current;
      fr.active = true;
      fr.tool = 'brush';
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
      ds.x1 = ds.x2 = ds.x3 = px;
      ds.y1 = ds.y2 = ds.y3 = py;
    } else {
      ds.step += 1;
      if (ds.step === 2) { ds.x2 = px; ds.y2 = py; }
      else if (ds.step === 3) { ds.x3 = px; ds.y3 = py; }
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

    if (price1 == null || time1 == null) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (tool === 'trendline') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'trendline', price1, time1, price2, time2 });
    } else if (tool === 'hline') {
      addDrawing({ id, type: 'hline', price: price1 });
    } else if (tool === 'hray') {
      addDrawing({ id, type: 'hray', price: price1, time: time1 });
    } else if (tool === 'vline') {
      addDrawing({ id, type: 'vline', time: time1 });
    } else if (tool === 'rectangle') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'rectangle', price1, time1, price2, time2 });
    } else if (tool === 'fibonacci') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'fibonacci',
        priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
        priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 });
    } else if (tool === 'channel') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'channel', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'regression') {
      if (time2 == null) return;
      addDrawing({ id, type: 'regression', time1, time2 });
    } else if (tool === 'rotatedRectangle') {
      if (price2 == null || time2 == null || price3 == null || time3 == null) return;
      addDrawing({ id, type: 'rotatedRectangle', price1, time1, price2, time2, price3, time3 });
    } else if (tool === 'circle') {
      if (price2 == null || time2 == null) return;
      addDrawing({ id, type: 'circle', price1, time1, price2, time2 });
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

    if (tool === 'brush') {
      const fr = freeformRef.current;
      // `e.buttons & 1` — the left button is still held down; a mouseup we
      // missed (e.g. released outside the canvas) means the drag already ended.
      if (fr.active && fr.tool === 'brush' && (e.buttons & 1) === 1) {
        const last = fr.points[fr.points.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 3) {
          fr.points.push({ x, y });
          scheduleRender();
        }
      }
      return;
    }

    if (tool === 'path') {
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
    if (fr.active && fr.tool === 'brush') finalizeFreeform();
  };

  // Path finishes on double-click (the extra point dblclick's own second
  // mousedown already added is a harmless duplicate of the last vertex).
  const handleDoubleClick = () => {
    const fr = freeformRef.current;
    if (fr.active && fr.tool === 'path') finalizeFreeform();
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
        if (d.type === 'trendline' || d.type === 'arrow' || d.type === 'priceNote') {
          const x1 = timeToX(chart, d.time1), y1 = priceToY(series, d.price1);
          const x2 = timeToX(chart, d.time2), y2 = priceToY(series, d.price2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
          if (Math.hypot(x - x1, y - y1) < 8 || Math.hypot(x - x2, y - y2) < 8) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'channel' || d.type === 'rotatedRectangle') {
          const lines = computeParallelOffset(d.price1, d.time1, d.price2, d.time2, d.price3, d.time3, chart, series);
          if (!lines) continue;
          const { x1, y1, x2, y2, y1b, y2b } = lines;
          const wx = (x1 + x2) / 2, wy = (y1b + y2b) / 2;
          if (Math.hypot(x - x1, y - y1) < 8 || Math.hypot(x - x2, y - y2) < 8) { hoverCursor = 'grab'; break; }
          if (Math.hypot(x - wx, y - wy) < 8) { hoverCursor = 'ns-resize'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'rectangle' || d.type === 'circle' || d.type === 'priceRange' || d.type === 'dateRange') {
          const x1 = timeToX(chart, d.time1), y1 = priceToY(series, d.price1);
          const x2 = timeToX(chart, d.time2), y2 = priceToY(series, d.price2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
          const nearCorner = Math.hypot(x - x1, y - y1) < 8 || Math.hypot(x - x2, y - y2) < 8 ||
            Math.hypot(x - x1, y - y2) < 8 || Math.hypot(x - x2, y - y1) < 8;
          if (nearCorner) { hoverCursor = 'nwse-resize'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'path' || d.type === 'brush') {
          const pts = d.points
            .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
            .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
          const nearVertex = d.type === 'path' && pts.some((p) => Math.hypot(x - p.x, y - p.y) < 8);
          if (nearVertex) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'fibonacci') {
          const xH = timeToX(chart, d.timeHigh), yH = priceToY(series, d.priceHigh);
          const xL = timeToX(chart, d.timeLow),  yL = priceToY(series, d.priceLow);
          if (xH == null || yH == null || xL == null || yL == null) continue;
          if (Math.hypot(x - xH, y - yH) < 8 || Math.hypot(x - xL, y - yL) < 8) { hoverCursor = 'grab'; break; }
          if (hitTest(d, x, y, chart, series, candlesRef.current)) { hoverCursor = 'move'; break; }
        } else if (d.type === 'arrowMark' || d.type === 'text') {
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

        if (d.type === 'trendline' || d.type === 'arrow' || d.type === 'priceNote') {
          const x1 = timeToX(chart, d.time1), y1 = priceToY(series, d.price1);
          const x2 = timeToX(chart, d.time2), y2 = priceToY(series, d.price2);
          if (x1 == null || y1 == null || x2 == null || y2 == null) continue;

          const nearP1 = Math.hypot(x - x1, y - y1) < 8;
          const nearP2 = Math.hypot(x - x2, y - y2) < 8;
          if (!nearP1 && !nearP2 && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          // grabbed a trend line/arrow/price note: block the chart from
          // starting a pan on this mousedown and take over the gesture as a drag instead
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

        if (d.type === 'channel' || d.type === 'rotatedRectangle') {
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

        if (d.type === 'rectangle' || d.type === 'circle' || d.type === 'priceRange' || d.type === 'dateRange') {
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

        if (d.type === 'path' || d.type === 'brush') {
          const screenPts = d.points
            .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
            .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
          if (screenPts.length < 2) continue;

          // Path's individual vertices can be dragged to reshape it; Brush is
          // freehand and only supports moving the whole stroke.
          let vertexIndex: number | null = null;
          if (d.type === 'path') {
            for (let vi = 0; vi < screenPts.length; vi++) {
              if (Math.hypot(x - screenPts[vi].x, y - screenPts[vi].y) < 8) { vertexIndex = vi; break; }
            }
          }
          if (vertexIndex == null && !hitTest(d, x, y, chart, series, candlesRef.current)) continue;

          dragRef.current = {
            active: true, kind: d.type, id: d.id,
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

        if (d.type === 'fibonacci') {
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

        if (d.type === 'arrowMark') {
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
      // Safety net: if a Brush drag left the canvas bounds before the button
      // was released, our own onMouseUp never fires — finalize here instead.
      const fr = freeformRef.current;
      if (fr.active && fr.tool === 'brush') finalizeFreeform();

      const drag = dragRef.current;
      if (!drag?.active) return;
      const preview = dragPreviewRef.current;
      if (preview && preview.id === drag.id) {
        if (preview.kind === 'trendline' || preview.kind === 'box') {
          updateDrawing(drag.id, {
            price1: preview.price1, time1: preview.time1,
            price2: preview.price2, time2: preview.time2,
          });
        } else if (preview.kind === 'channel') {
          updateDrawing(drag.id, {
            price1: preview.price1, time1: preview.time1,
            price2: preview.price2, time2: preview.time2,
            price3: preview.price3, time3: preview.time3,
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
        if (d.type !== 'text') continue;
        if (!hitTest(d, x, y, chart, series, candlesRef.current)) continue;
        const tx = timeToX(chart, d.time), ty = priceToY(series, d.price);
        if (tx == null || ty == null) continue;
        selectDrawing(d.id);
        setEditing({ id: d.id, x: tx, y: ty, value: d.text, isNew: false });
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
        scheduleRender();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedIdRef.current;
        if (sel && !drawingsLockedRef.current) deleteDrawing(sel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteDrawing, scheduleRender]);

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
}
