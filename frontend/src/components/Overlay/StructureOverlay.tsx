/**
 * StructureOverlay — canvas overlay drawing market structure in three layers:
 *
 *   1. Swing highs/lows (pivots) as triangles pointing at their candle.
 *   2. HH/LH/HL/LL tags classifying each swing against the previous swing of
 *      the same type, plus an overall trend tag in the corner.
 *   3. A thin zigzag connecting consecutive swings, so the structure the tags
 *      describe is visible as a shape rather than inferred from labels.
 *
 * Colours match the levels palette (orange = high, cyan = low) so "orange is a
 * high, cyan is a low" reads consistently across the app.
 */

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { toChartTimeSeconds } from '../../utils/chartTime';
import { api } from '../../services/api';
import type { MarketTrend, StructureData, SwingPoint } from '../../types/analytics';

const POLL_MS = 15_000;

const HIGH_COLOR = '#ff9800'; // same orange as PDH
const LOW_COLOR = '#26c6da';  // same cyan as PDL
const PRICE_TEXT_COLOR = '#8b8f9a'; // muted, so the HH/LH tag stays the primary read
const ZIGZAG_COLOR = 'rgba(149,152,161,0.45)'; // background guide — thinner/fainter than drawing tools

const MARKER_HALF_W = 4;   // half the triangle's base
const MARKER_H = 6;        // triangle height
const MARKER_GAP = 5;      // clear space between the candle's wick and the marker

// Two thresholds: the structure tag is the point of the feature so it appears
// first, and the price is secondary detail that only earns its space when the
// bars are wide enough for both.
const MIN_BAR_SPACING_FOR_LABELS = 9;
const MIN_BAR_SPACING_FOR_PRICE = 18;

const TREND_STYLE: Record<MarketTrend, { text: string; color: string }> = {
  up:    { text: 'UPTREND',   color: '#26a641' },
  down:  { text: 'DOWNTREND', color: '#f85149' },
  range: { text: 'RANGING',   color: '#9598a1' },
};

type LWTime = import('lightweight-charts').Time;

export interface StructureOverlayProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export function StructureOverlay({ sharedChartRef, sharedSeriesRef }: StructureOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const dataRef = useRef<StructureData | null>(null);
  const [trend, setTrend] = useState<MarketTrend | null>(null);

  const { activeSymbol, activeInterval } = useMarketStore();

  const drawFnRef = useRef<() => void>(() => {});
  drawFnRef.current = () => {
    const canvas = canvasRef.current;
    const chart = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    if (!canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const data = dataRef.current;
    if (!data) return;

    const timeScale = chart.timeScale();
    // Keep everything out of the right-hand price axis, same as LevelsOverlay.
    const axisWidth = chart.priceScale('right').width() || 0;
    const plotRight = W - axisWidth;
    const barSpacing = timeScale.options().barSpacing;
    const showLabels = barSpacing >= MIN_BAR_SPACING_FOR_LABELS;
    const showPrices = barSpacing >= MIN_BAR_SPACING_FOR_PRICE;

    /**
     * Swings sit on real candle timestamps, so the standard
     * toChartTimeSeconds + timeToCoordinate path resolves exactly and the
     * marker lands on its own candle. Coordinates are returned unclamped —
     * off-screen points still anchor the zigzag's direction at the edges.
     */
    const project = (swing: SwingPoint): { x: number; y: number } | null => {
      const rawX = timeScale.timeToCoordinate(toChartTimeSeconds(swing.time) as unknown as LWTime);
      if (rawX === null) return null;
      const rawY = series.priceToCoordinate(swing.price);
      if (rawY === null) return null;
      return { x: rawX as unknown as number, y: rawY as unknown as number };
    };

    const points = data.swings.map((s) => ({ swing: s, pt: project(s) }));

    // ── Layer 3: zigzag connecting consecutive swings ───────────────────────
    // Clipped to the plot area rather than filtered by visibility, so a segment
    // running off-screen still enters/leaves at the correct angle.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotRight, H);
    ctx.clip();

    ctx.strokeStyle = ZIGZAG_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let penDown = false;
    for (const { pt } of points) {
      if (!pt) {
        penDown = false; // unresolvable point — break the line rather than bridge it
        continue;
      }
      if (penDown) ctx.lineTo(pt.x, pt.y);
      else ctx.moveTo(pt.x, pt.y);
      penDown = true;
    }
    ctx.stroke();
    ctx.restore();

    // ── Layers 1 & 2: markers and tags ──────────────────────────────────────
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';

    for (const { swing, pt } of points) {
      if (!pt) continue;
      const { x, y } = pt;
      if (x < 0 || x > plotRight || y < 0 || y > H) continue;

      const isHigh = swing.type === 'high';
      const color = isHigh ? HIGH_COLOR : LOW_COLOR;
      // Apex points at the candle; the base sits away from it.
      const apexY = isHigh ? y - MARKER_GAP : y + MARKER_GAP;
      const baseY = isHigh ? apexY - MARKER_H : apexY + MARKER_H;

      ctx.beginPath();
      ctx.moveTo(x, apexY);
      ctx.lineTo(x - MARKER_HALF_W, baseY);
      ctx.lineTo(x + MARKER_HALF_W, baseY);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      if (!showLabels) continue;

      // Stack outward from the candle: tag first, then price beyond it.
      ctx.textBaseline = isHigh ? 'bottom' : 'top';
      const tagY = isHigh ? baseY - 2 : baseY + 2;

      // Swings with no previous same-type swing carry no label — draw nothing
      // rather than invent a direction for them.
      if (swing.label) {
        ctx.fillStyle = color;
        ctx.fillText(swing.label, x, tagY);
      }

      if (showPrices) {
        const priceY = isHigh ? tagY - 10 : tagY + 10;
        ctx.fillStyle = PRICE_TEXT_COLOR;
        ctx.fillText(swing.price.toFixed(data.decimals), x, priceY);
      }
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

  // ── Poll REST endpoint ────────────────────────────────────────────────────
  useEffect(() => {
    dataRef.current = null;
    setTrend(null);
    scheduleDraw(); // clear immediately — don't wait for the fetch to resolve
    let stopped = false;

    async function fetchStructure() {
      try {
        const data = await api.getStructure(activeSymbol, activeInterval);
        if (!stopped) {
          dataRef.current = data;
          setTrend(data.current_trend);
          scheduleDraw();
        }
      } catch { /* no candle data yet — keep last-known swings */ }
    }

    fetchStructure();
    const timer = setInterval(fetchStructure, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeSymbol, activeInterval, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ background: 'transparent' }} />
      {/* Bottom-left corner: the only spot free of the symbol/VWAP legends at
          the top and the session labels below them. */}
      {trend && (
        <div className="absolute bottom-8 left-3 flex items-center gap-1.5 text-[10px] font-mono select-none">
          <span className="uppercase tracking-wider text-[var(--text-muted)]">Structure</span>
          <span className="font-bold" style={{ color: TREND_STYLE[trend].color }}>
            {TREND_STYLE[trend].text}
          </span>
        </div>
      )}
    </div>
  );
}
