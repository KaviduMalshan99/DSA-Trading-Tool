/**
 * FootprintCanvas — canvas overlay drawn on top of the candlestick chart.
 *
 * Coordinate mapping
 * ──────────────────
 * lightweight-charts v4 exposes:
 *   chart.timeScale().timeToCoordinate(timeSec)   → x pixel from chart-pane left
 *   chart.timeScale().getVisibleLogicalRange()     → { from, to } bar indices
 *   series.priceToCoordinate(price)               → y pixel from chart-pane top
 *
 * The canvas sits absolutely over the same container div as the chart so
 * these coordinates map 1:1 to canvas pixels.
 *
 * Visibility rule: text is hidden when candle pixel-width < MIN_CANDLE_PX.
 */

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const MIN_CANDLE_PX = 80; // hide text below this candle pixel width

interface PriceLevel {
  price: number;
  buy_vol: number;
  sell_vol: number;
  imbalance: boolean;
}

interface FootprintBar {
  time: number; // ms epoch (candle open-time)
  levels: PriceLevel[];
}

export interface FootprintCanvasProps {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

type LWTime = import('lightweight-charts').Time;

export function FootprintCanvas({ sharedChartRef, sharedSeriesRef }: FootprintCanvasProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);

  // Footprint data keyed by candle open-time in ms
  const barsRef = useRef<Map<number, FootprintBar>>(new Map());

  const { activeSymbol, activeInterval } = useMarketStore();

  // ── Draw function stored in a ref so the stable scheduler always calls
  //    the latest version without needing new chart subscriptions.
  const drawFnRef = useRef<() => void>(() => { /* noop until canvas is ready */ });

  drawFnRef.current = () => {
    const canvas = canvasRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    if (!canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ── Candle pixel width from logical range ─────────────────────────
    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    if (!logicalRange) return;
    const numBars = logicalRange.to - logicalRange.from;
    if (numBars <= 0) return;
    const candlePx = W / numBars;
    if (candlePx < MIN_CANDLE_PX) return;

    const halfW = candlePx * 0.44; // inset slightly from bar edge

    // ── Visible time window ───────────────────────────────────────────
    const timeRange = chart.timeScale().getVisibleRange();
    if (!timeRange) return;
    const fromSec = timeRange.from as number;
    const toSec   = timeRange.to   as number;

    // ── Font size based on candle width ──────────────────────────────
    const fontSize = candlePx > 120 ? 11 : 9;
    ctx.font = `${fontSize}px "Courier New", monospace`;
    ctx.textBaseline = 'middle';

    // ── Render ────────────────────────────────────────────────────────
    for (const bar of barsRef.current.values()) {
      const timeSec = Math.floor(bar.time / 1000);
      if (timeSec < fromSec || timeSec > toSec) continue;

      const x = chart.timeScale().timeToCoordinate(timeSec as LWTime);
      if (x === null) continue;

      const levels = bar.levels; // sorted high→low by backend
      if (levels.length < 2) continue;

      // Row height — pixel distance between two adjacent price levels
      let rowH = 10;
      const y0 = series.priceToCoordinate(levels[0].price);
      const y1 = series.priceToCoordinate(levels[1].price);
      if (y0 !== null && y1 !== null) {
        rowH = Math.abs(y1 - y0);
      }
      rowH = Math.max(8, Math.min(rowH, 20));

      for (const lvl of levels) {
        const y = series.priceToCoordinate(lvl.price);
        if (y === null || y < 0 || y > H) continue;

        // Separator line between price levels (very subtle)
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - halfW, y - rowH / 2);
        ctx.lineTo(x + halfW, y - rowH / 2);
        ctx.stroke();

        // Imbalance: barely-visible yellow tint — do NOT fill the whole row,
        // just a thin strip so candles remain visible underneath.
        if (lvl.imbalance) {
          ctx.fillStyle = 'rgba(240,185,11,0.08)';
          ctx.fillRect(x - halfW, y - rowH / 2, halfW * 2, rowH);
        }

        // Buy volume — left side, bright green
        if (lvl.buy_vol > 0) {
          ctx.fillStyle = '#00ff88';
          ctx.textAlign = 'left';
          ctx.fillText(fmtVol(lvl.buy_vol), x - halfW + 2, y);
        }

        // Sell volume — right side, bright red
        if (lvl.sell_vol > 0) {
          ctx.fillStyle = '#ff4444';
          ctx.textAlign = 'right';
          ctx.fillText(fmtVol(lvl.sell_vol), x + halfW - 2, y);
        }
      }
    }
  };

  // Stable scheduler — created once, always delegates to the latest drawFnRef
  const scheduleDraw = useRef(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawFnRef.current());
  }).current;

  // ── Chart event subscriptions (run once after mount) ──────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;

    const onRange     = () => scheduleDraw();
    const onCrosshair = () => scheduleDraw();

    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.subscribeCrosshairMove(onCrosshair);
    scheduleDraw();

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onCrosshair);
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize canvas to match container ──────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      scheduleDraw();
    });
    ro.observe(container);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;

    return () => ro.disconnect();
  }, [scheduleDraw]);

  // ── WebSocket ─────────────────────────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/footprint/${activeSymbol}/${activeInterval}`);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type: string;
            footprints?: FootprintBar[];
            footprint?: FootprintBar;
          };

          if (msg.type === 'historical' && msg.footprints) {
            barsRef.current.clear();
            for (const bar of msg.footprints) barsRef.current.set(bar.time, bar);
          } else if ((msg.type === 'update' || msg.type === 'partial') && msg.footprint) {
            barsRef.current.set(msg.footprint.time, msg.footprint);
            if (barsRef.current.size > 50) {
              barsRef.current.delete(Math.min(...barsRef.current.keys()));
            }
          }

          scheduleDraw();
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 2000); };
      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [activeSymbol, activeInterval, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

function fmtVol(v: number): string {
  return v.toFixed(1);
}
