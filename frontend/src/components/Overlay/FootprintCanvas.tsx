import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { intervalToSecs } from '../../utils/interval';

const WS_BASE       = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const MIN_CANDLE_PX = 100; // don't render if candle narrower than this
const MIN_ROW_PX    = 8;  // don't render if a price-level row is shorter than this

interface PriceLevel {
  price:    number;
  buy_vol:  number;
  sell_vol: number;
  imbalance: boolean;
}

interface FootprintBar {
  time:   number;        // candle open-time in ms
  levels: PriceLevel[]; // sorted high→low by backend
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
  const barsRef      = useRef<Map<number, FootprintBar>>(new Map());

  const { activeSymbol, activeInterval } = useMarketStore();

  // ── Draw ─────────────────────────────────────────────────────────────────
  const drawFnRef = useRef<() => void>(() => {});
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

    if (barsRef.current.size === 0) return;

    const intervalSecs = intervalToSecs(activeInterval);
    const timeScale    = chart.timeScale();
    const timeRange    = timeScale.getVisibleRange();
    if (!timeRange) return;
    const fromSec = timeRange.from as number;
    const toSec   = timeRange.to   as number;

    ctx.textBaseline = 'middle';

    for (const bar of barsRef.current.values()) {
      const openSec  = Math.floor(bar.time / 1000);
      const closeSec = openSec + intervalSecs;

      if (closeSec < fromSec || openSec > toSec) continue;

      // ── Candle x-boundaries ─────────────────────────────────────────
      const leftRaw  = timeScale.timeToCoordinate(openSec  as unknown as LWTime);
      const rightRaw = timeScale.timeToCoordinate(closeSec as unknown as LWTime);
      if (leftRaw === null || rightRaw === null) continue;

      const leftX       = leftRaw  as unknown as number;
      const rightX      = rightRaw as unknown as number;
      const candleWidth = rightX - leftX;
      if (candleWidth < MIN_CANDLE_PX) continue;

      const levels = bar.levels;
      if (levels.length < 2) continue;

      // ── Candle y-boundaries from outermost price levels ─────────────
      const topRaw    = series.priceToCoordinate(levels[0].price);
      const bottomRaw = series.priceToCoordinate(levels[levels.length - 1].price);
      if (topRaw === null || bottomRaw === null) continue;

      const topY        = topRaw    as unknown as number;
      const bottomY     = bottomRaw as unknown as number;
      const candleHeight = Math.abs(bottomY - topY);
      const rowH         = candleHeight / levels.length;
      if (rowH < MIN_ROW_PX) continue;

      // ── Dynamic font size based on candle width ──────────────────────
      const fontSize  = candleWidth > 200 ? 13 : candleWidth > 150 ? 11 : 9;
      const showPrice = candleWidth > 120;
      const centerX   = leftX + candleWidth / 2;
      const pad       = fontSize * 0.4 + 2;
      const normalFont = `${fontSize}px "Courier New", monospace`;
      const boldFont   = `bold ${fontSize}px "Courier New", monospace`;

      // ── Clip to candle boundaries — nothing can overflow ─────────────
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftX, topY, candleWidth, candleHeight);
      ctx.clip();

      let prevRowTop: number | null = null;

      for (const lvl of levels) {
        const yRaw = series.priceToCoordinate(lvl.price);
        if (yRaw === null) continue;
        const y = yRaw as unknown as number;
        if (y < topY || y > bottomY) continue;

        const rowTop = y - rowH / 2;

        // Row separator — thin line between adjacent price levels only
        if (prevRowTop !== null) {
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(leftX, rowTop);
          ctx.lineTo(rightX, rowTop);
          ctx.stroke();
        }
        prevRowTop = rowTop;

        const buyStr  = lvl.buy_vol.toFixed(2);
        const sellStr = lvl.sell_vol.toFixed(2);
        const buyIsDominant = lvl.imbalance && lvl.buy_vol > lvl.sell_vol;
        const sellIsDominant = lvl.imbalance && lvl.sell_vol > lvl.buy_vol;

        // Imbalance: tight highlight box behind the dominant side's number only
        if (buyIsDominant || sellIsDominant) {
          ctx.font = boldFont;
          const text  = buyIsDominant ? buyStr : sellStr;
          const textW = ctx.measureText(text).width;
          const boxH  = Math.min(rowH - 2, fontSize + 6);
          ctx.fillStyle = buyIsDominant ? 'rgba(0,255,136,0.14)' : 'rgba(255,68,68,0.14)';
          if (buyIsDominant) {
            ctx.fillRect(leftX + 1, y - boxH / 2, textW + pad * 2, boxH);
          } else {
            ctx.fillRect(rightX - 1 - textW - pad * 2, y - boxH / 2, textW + pad * 2, boxH);
          }
        }

        // Buy volume — LEFT, green
        ctx.font = buyIsDominant ? boldFont : normalFont;
        ctx.fillStyle = '#00ff88';
        ctx.textAlign = 'left';
        ctx.fillText(buyStr, leftX + pad, y);

        // Price — CENTER, gray (only when wide enough)
        if (showPrice) {
          const priceStr = Number.isInteger(lvl.price)
            ? String(lvl.price)
            : lvl.price.toFixed(1);
          ctx.font = normalFont;
          ctx.fillStyle = 'rgba(180,180,180,0.75)';
          ctx.textAlign = 'center';
          ctx.fillText(priceStr, centerX, y);
        }

        // Sell volume — RIGHT, red
        ctx.font = sellIsDominant ? boldFont : normalFont;
        ctx.fillStyle = '#ff4444';
        ctx.textAlign = 'right';
        ctx.fillText(sellStr, rightX - pad, y);
      }

      ctx.restore();
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

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    barsRef.current.clear();

    let ws:     WebSocket | null = null;
    let stopped = false;
    let timer:  ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/footprint/${activeSymbol}/${activeInterval}`);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type:        string;
            footprints?: FootprintBar[];
            footprint?:  FootprintBar;
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

      ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 2_000); };
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
      <canvas ref={canvasRef} className="absolute inset-0" style={{ background: 'transparent' }} />
    </div>
  );
}
