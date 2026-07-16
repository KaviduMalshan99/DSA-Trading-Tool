import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useWhaleStore, type WhaleTrade } from '../../store/whaleStore';
import { toChartTime } from '../../utils/chartTime';

const WS_BASE   = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const RECENT_MS = 10 * 60 * 1_000; // only draw trades from last 10 minutes

export interface WhaleMarkersProps {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

function bubbleRadius(notional: number): number {
  if (notional >= 1_000_000) return 20;
  if (notional >= 200_000)   return 14;
  return 10;
}

function fmtNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

interface Tooltip { clientX: number; clientY: number; trade: WhaleTrade }

export function WhaleMarkers({ sharedChartRef, sharedSeriesRef }: WhaleMarkersProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const tradesRef    = useRef<WhaleTrade[]>([]);

  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const { activeSymbol } = useMarketStore();
  const { addTrades, clearTrades } = useWhaleStore();

  // ── Draw ─────────────────────────────────────────────────────────────────
  const drawFnRef = useRef<() => void>(() => {});
  drawFnRef.current = () => {
    const canvas = canvasRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    if (!canvas || !chart || !series) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now    = Date.now();
    const cutoff = now - RECENT_MS;

    for (const trade of tradesRef.current) {
      // Skip trades older than 10 minutes
      if (trade.time < cutoff) continue;

      const timeSec = toChartTime(trade.time);
      const r       = bubbleRadius(trade.notional);

      const rawX = chart.timeScale().timeToCoordinate(timeSec);
      const rawY = series.priceToCoordinate(trade.price);

      // Price off-screen — skip
      if (rawY === null) continue;

      // Time outside visible range — pin bubble to right edge so it stays visible
      const cx: number = rawX !== null ? rawX : canvas.width - r - 6;
      const cy: number = rawY;

      const isBuy  = trade.side === 'buy';
      const fill   = isBuy ? '#00ff88' : '#ff4444';
      const border = isBuy ? '#00cc66' : '#cc2222';

      // Circle
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.stroke();

      // B / S label
      const fontSize = Math.max(8, Math.round(r * 0.8));
      ctx.font         = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle    = '#000000';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isBuy ? 'B' : 'S', cx, cy);
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

  // ── Periodic redraw (fade + right-edge pins update as time passes) ────────
  useEffect(() => {
    const id = setInterval(scheduleDraw, 10_000);
    return () => clearInterval(id);
  }, [scheduleDraw]);

  // ── Hover tooltip ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const chart  = sharedChartRef.current;
      const series = sharedSeriesRef.current;
      if (!canvas || !chart || !series) { setTooltip(null); return; }

      const rect   = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const now    = Date.now();
      const cutoff = now - RECENT_MS;

      for (const trade of tradesRef.current) {
        if (trade.time < cutoff) continue;
        const timeSec = toChartTime(trade.time);
        const r       = bubbleRadius(trade.notional);
        const rawX = chart.timeScale().timeToCoordinate(timeSec);
        const rawY = series.priceToCoordinate(trade.price);
        if (rawY === null) continue;
        const cx: number = rawX !== null ? rawX : canvas.width - r - 6;
        const cy: number = rawY;
        const dist = Math.sqrt((mouseX - cx) ** 2 + (mouseY - cy) ** 2);
        if (dist <= r + 6) {
          setTooltip({ clientX: e.clientX, clientY: e.clientY, trade });
          return;
        }
      }
      setTooltip(null);
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, [sharedChartRef, sharedSeriesRef]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    tradesRef.current = [];
    clearTrades();
    setTooltip(null);

    let ws:    WebSocket | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/whales/${activeSymbol}`);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type: string;
            trades?: WhaleTrade[];
            trade?:  WhaleTrade;
          };
          if (msg.type === 'historical' && msg.trades) {
            tradesRef.current = msg.trades.slice(0, 50);
            addTrades(msg.trades);
            scheduleDraw();
          } else if (msg.type === 'whale' && msg.trade) {
            tradesRef.current = [msg.trade, ...tradesRef.current].slice(0, 50);
            addTrades([msg.trade]);
            scheduleDraw();
          }
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
      tradesRef.current = [];
      clearTrades();
    };
  }, [activeSymbol, addTrades, clearTrades, scheduleDraw]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none select-none"
          style={{ left: tooltip.clientX + 14, top: tooltip.clientY - 28 }}
        >
          <div className="bg-[var(--bg-panel-alt)] border border-[var(--border-color)] rounded px-2 py-1 text-xs font-mono text-[var(--text-primary)] shadow-lg whitespace-nowrap">
            <span className={tooltip.trade.side === 'buy' ? 'text-[#00ff88]' : 'text-[#ff4444]'}>
              {tooltip.trade.side.toUpperCase()}
            </span>
            {' '}{fmtNotional(tooltip.trade.notional)}
            <span className="text-[var(--text-muted)] ml-1">
              @ {tooltip.trade.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
