/**
 * AbsorptionOverlay — marks candles where unusually large volume traded but
 * price barely moved (see backend/app/analytics/absorption.py for the exact
 * detection gate: volume_multiplier x baseline volume, range_fraction x
 * baseline range, plus a minimum clear-aggressor delta fraction).
 *
 * Deliberately a different SHAPE from every other event marker already on
 * the chart — StructureOverlay uses triangles (swings), dashed ticks
 * (BOS/CHOCH), and diamonds (sweeps); WhaleMarkers uses circles. A small
 * rounded chip with "ABS" text keeps this one visually distinct and, per the
 * spec, subtle rather than a big blob competing with those.
 */

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { toChartTimeSeconds } from '../../utils/chartTime';
import { api } from '../../services/api';
import type { AbsorptionData, AbsorptionEvent } from '../../types/analytics';

const POLL_MS = 15_000;

// Bullish (buy absorption: heavy selling absorbed, price held/closed up) —
// muted green, same family as buy-side green used elsewhere but dimmer so it
// reads as "subtle" per spec rather than a loud alert.
const BUY_COLOR = '#4fd1a5';
// Bearish (sell absorption: heavy buying absorbed, price capped) — muted red.
const SELL_COLOR = '#e8735f';

// Clear space between the candle's wick and the chip. Buy absorption anchors
// just below the candle's low, which is also roughly where FootprintCanvas
// draws its bottom-row buy/sell numbers when Footprint is on — those numbers
// can now be up to 13px tall (readability fix made rows taller, letting font
// size grow off its old MIN_FONT_PX floor), so this needs enough clearance
// to sit below that text rather than the old cramped-row gap.
const CHIP_GAP = 12;
const CHIP_PAD_X = 3;
const CHIP_H = 12;

// Chip text only earns its space once bars are wide enough to read it; below
// that, draw just the small marker dot so dense charts don't get cluttered.
const MIN_BAR_SPACING_FOR_LABEL = 12;

type LWTime = import('lightweight-charts').Time;

export interface AbsorptionOverlayProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export function AbsorptionOverlay({ sharedChartRef, sharedSeriesRef }: AbsorptionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const dataRef = useRef<AbsorptionData | null>(null);

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
    if (!data || data.events.length === 0) return;

    const timeScale = chart.timeScale();
    const axisWidth = chart.priceScale('right').width() || 0;
    const plotRight = W - axisWidth;
    const barSpacing = timeScale.options().barSpacing;
    const showLabel = barSpacing >= MIN_BAR_SPACING_FOR_LABEL;

    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';

    const project = (evt: AbsorptionEvent, atPrice: number): { x: number; y: number } | null => {
      const rawX = timeScale.timeToCoordinate(toChartTimeSeconds(evt.time) as unknown as LWTime);
      if (rawX === null) return null;
      const rawY = series.priceToCoordinate(atPrice);
      if (rawY === null) return null;
      return { x: rawX as unknown as number, y: rawY as unknown as number };
    };

    for (const evt of data.events) {
      const isBuy = evt.type === 'buy_absorption';
      const color = isBuy ? BUY_COLOR : SELL_COLOR;

      // Buy absorption anchors below the candle's low (support held); sell
      // absorption anchors above the candle's high (resistance capped) —
      // mirrors the story each event tells, and keeps the marker off the
      // candle body itself.
      const pt = isBuy ? project(evt, evt.low) : project(evt, evt.high);
      if (!pt) continue;
      const { x, y } = pt;
      if (x < 0 || x > plotRight || y < 0 || y > H) continue;

      const cy = isBuy ? y + CHIP_GAP : y - CHIP_GAP;

      if (!showLabel) {
        ctx.beginPath();
        ctx.arc(x, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        continue;
      }

      const label = 'ABS';
      const textW = ctx.measureText(label).width;
      const chipW = textW + CHIP_PAD_X * 2;
      const chipTop = isBuy ? cy : cy - CHIP_H;

      ctx.fillStyle = `${color}26`; // ~15% alpha fill — subtle, not a solid blob
      ctx.fillRect(x - chipW / 2, chipTop, chipW, CHIP_H);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - chipW / 2, chipTop, chipW, CHIP_H);

      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, chipTop + CHIP_H / 2 + 0.5);
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
    scheduleDraw(); // clear immediately — don't wait for the fetch to resolve
    let stopped = false;

    async function fetchAbsorption() {
      try {
        const data = await api.getAbsorption(activeSymbol, activeInterval);
        if (!stopped) {
          dataRef.current = data;
          scheduleDraw();
        }
      } catch { /* no candle data yet — keep last-known events */ }
    }

    fetchAbsorption();
    const timer = setInterval(fetchAbsorption, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeSymbol, activeInterval, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ background: 'transparent' }} />
    </div>
  );
}
