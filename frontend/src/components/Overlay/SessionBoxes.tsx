/**
 * SessionBoxes — canvas overlay shading the major trading sessions' active
 * hours as vertical bands, one set per UTC day across the visible range.
 *
 * Sessions are fixed clock hours, so there's nothing for the backend to
 * compute: everything here is derived from the loaded candles' own timestamps.
 *
 * The bands overlap on purpose — London/NY (12:00–16:00 UTC) is the
 * high-activity window, and the stacked translucent fills make it visibly
 * darker than either session alone.
 */

import { useEffect, useRef } from 'react';
import type { IChartApi, Logical } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { intervalToSecs } from '../../utils/interval';
import type { Candle } from '../../types/market';

const DAY_MS = 86_400_000;

/** Session windows in UTC hours — the same UTC-day basis levels.py and vwap.py use. */
const SESSIONS = [
  { key: 'asia',   label: 'Asia',   startHour: 0,  endHour: 9,  color: '#42a5f5' },
  { key: 'london', label: 'London', startHour: 7,  endHour: 16, color: '#ffa726' },
  { key: 'ny',     label: 'NY',     startHour: 12, endHour: 21, color: '#66bb6a' },
] as const;

const FILL_ALPHA = 0.06;  // subtle — three of these can overlap without drowning the candles
const EDGE_ALPHA = 0.35;

// Below this the three bands collapse into an illegible stripe, so hide them
// rather than draw noise. This also bounds how many days can be on screen.
const MIN_PX_PER_DAY = 45;
const MIN_BAND_PX_FOR_LABEL = 30;
const MAX_DAYS = 40; // hard safety net on top of the pixel-width guard

const LABEL_TOP_Y = 56;   // clears TradingChart's symbol row and the VWAP badge
const LABEL_ROW_H = 13;   // each session gets its own row so overlapping bands don't collide

function utcDayStartMs(epochMs: number): number {
  return Math.floor(epochMs / DAY_MS) * DAY_MS;
}

/**
 * Fractional bar index for an arbitrary timestamp.
 *
 * lightweight-charts lays bars out by *index*, not by elapsed time, and its
 * timeToCoordinate() only resolves times that exist in the series data — which
 * session boundaries often don't (07:00 is mid-candle on a 4h chart, where bars
 * open at 00/04/08/...). Interpolating an index and going through
 * logicalToCoordinate() handles sub-candle times, extrapolates past both data
 * edges, and stays correct across gaps in the data.
 */
function timeToLogical(targetMs: number, candles: Candle[], intervalMs: number): number {
  const n = candles.length;
  const firstT = candles[0].t;
  const lastT = candles[n - 1].t;

  if (targetMs <= firstT) return -(firstT - targetMs) / intervalMs;
  if (targetMs >= lastT) return n - 1 + (targetMs - lastT) / intervalMs;

  // binary search for the bar containing targetMs
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].t <= targetMs) lo = mid;
    else hi = mid;
  }
  const span = candles[hi].t - candles[lo].t;
  return span > 0 ? lo + (targetMs - candles[lo].t) / span : lo;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export interface SessionBoxesProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function SessionBoxes({ sharedChartRef }: SessionBoxesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const { activeInterval } = useMarketStore();
  // Redraw when a new bar opens (see VWAPOverlay — `t` only changes on a new
  // bar, not on every intra-bar tick).
  const lastCandleTime = useMarketStore((s) => s.candles.at(-1)?.t ?? null);

  const drawFnRef = useRef<() => void>(() => {});
  drawFnRef.current = () => {
    const canvas = canvasRef.current;
    const chart = sharedChartRef.current;
    if (!canvas || !chart) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const intervalSecs = intervalToSecs(activeInterval);
    // On 1d+ a whole session is sub-candle, so the bands would be narrower than
    // one bar and tell the trader nothing — same principle as session VWAP.
    if (intervalSecs >= 86_400) return;

    const candles = useMarketStore.getState().candles;
    if (candles.length < 2) return;

    const intervalMs = intervalSecs * 1000;
    const timeScale = chart.timeScale();

    const range = timeScale.getVisibleLogicalRange();
    if (!range) return;

    // Clamp the visible window to loaded data so trailing whitespace doesn't
    // spawn bands for days that aren't really on the chart.
    const firstIdx = Math.max(0, Math.floor(range.from));
    const lastIdx = Math.min(candles.length - 1, Math.ceil(range.to));
    if (firstIdx > lastIdx) return;

    const barSpacing = timeScale.options().barSpacing;
    const pxPerDay = (DAY_MS / intervalMs) * barSpacing;
    if (pxPerDay < MIN_PX_PER_DAY) return;

    // Keep the bands inside the plotting area — the canvas sits over the axes
    // too, and tinting the time axis looks like a rendering bug.
    const axisWidth = chart.priceScale('right').width() || 0;
    const timeAxisHeight = timeScale.height() || 0;
    const plotRight = W - axisWidth;
    const plotBottom = H - timeAxisHeight;
    if (plotRight <= 0 || plotBottom <= 0) return;

    const logicalToX = (logical: number): number | null => {
      const raw = timeScale.logicalToCoordinate(logical as Logical);
      return raw === null ? null : (raw as unknown as number);
    };

    const firstDay = utcDayStartMs(candles[firstIdx].t);
    const lastDay = utcDayStartMs(candles[lastIdx].t);
    const dayCount = Math.min(MAX_DAYS, Math.floor((lastDay - firstDay) / DAY_MS) + 1);

    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let d = 0; d < dayCount; d++) {
      const dayStart = firstDay + d * DAY_MS;

      SESSIONS.forEach((session, sessionIdx) => {
        // Raw UTC epoch-ms, deliberately *not* shifted through
        // CHART_TZ_OFFSET_SECONDS: these are compared against the candles' own
        // raw `t` values to derive a bar index, and the index is what the
        // library maps to a pixel. The Asia/Colombo shift only exists for
        // values handed to lightweight-charts as a `time`, which never happens
        // on this path — applying it here would slide every band 5.5h off the
        // candles it describes.
        const startMs = dayStart + session.startHour * 3_600_000;
        const endMs = dayStart + session.endHour * 3_600_000;

        const rawLeft = logicalToX(timeToLogical(startMs, candles, intervalMs));
        const rawRight = logicalToX(timeToLogical(endMs, candles, intervalMs));
        if (rawLeft === null || rawRight === null) return;

        const left = Math.max(0, rawLeft);
        const right = Math.min(plotRight, rawRight);
        if (right <= 0 || left >= plotRight || right - left <= 0) return; // off-screen

        const [r, g, b] = hexToRgb(session.color);
        ctx.fillStyle = `rgba(${r},${g},${b},${FILL_ALPHA})`;
        ctx.fillRect(left, 0, right - left, plotBottom);

        // Edges only where the real boundary is on screen, so a band clipped by
        // the viewport doesn't grow a fake edge at the chart border.
        ctx.strokeStyle = `rgba(${r},${g},${b},${EDGE_ALPHA})`;
        ctx.lineWidth = 1;
        for (const x of [rawLeft, rawRight]) {
          if (x < 0 || x > plotRight) continue;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, plotBottom);
          ctx.stroke();
        }

        // Each session gets its own label row, so the three bands' labels stay
        // legible through the London/NY overlap instead of stacking on one line.
        const labelY = LABEL_TOP_Y + sessionIdx * LABEL_ROW_H;
        if (right - left >= MIN_BAND_PX_FOR_LABEL && labelY + LABEL_ROW_H <= plotBottom) {
          ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
          ctx.fillText(session.label, left + 4, labelY);
        }
      });
    }
  };

  const scheduleDraw = useRef(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawFnRef.current());
  }).current;

  // ── Chart event subscriptions ─────────────────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;
    const onUpdate = () => scheduleDraw();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onUpdate);
    chart.subscribeCrosshairMove(onUpdate);
    scheduleDraw();
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onUpdate);
      chart.unsubscribeCrosshairMove(onUpdate);
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      scheduleDraw();
    });
    ro.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, [scheduleDraw]);

  // ── Redraw on new bars / symbol / timeframe change ────────────────────────
  useEffect(() => {
    scheduleDraw();
  }, [activeInterval, lastCandleTime, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ background: 'transparent' }} />
    </div>
  );
}
