/**
 * VolumeProfile — canvas overlay on the right side of the chart.
 *
 * Draws horizontal volume bars aligned to the chart price scale.
 * POC (Point of Control): brightest yellow bar + dashed yellow line.
 * Value Area: blue bars.  Normal levels: grey bars.
 * Dashed horizontal lines + labels at POC / VAH / VAL.
 */

import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

interface VPLevel {
  price:         number;
  volume:        number;
  buy_vol:       number;
  sell_vol:      number;
  is_poc:        boolean;
  in_value_area: boolean;
}

interface VProfile {
  levels:       VPLevel[];
  poc:          number;
  vah:          number;
  val:          number;
  total_volume: number;
}

export interface VolumeProfileProps {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export function VolumeProfile({ sharedChartRef, sharedSeriesRef }: VolumeProfileProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const profileRef   = useRef<VProfile | null>(null);

  const { activeSymbol, activeInterval } = useMarketStore();

  // Always-fresh draw function stored in a ref (stable scheduler pattern)
  const drawFnRef = useRef<() => void>(() => {});

  drawFnRef.current = () => {
    const canvas  = canvasRef.current;
    const chart   = sharedChartRef.current;
    const series  = sharedSeriesRef.current;
    const profile = profileRef.current;
    if (!canvas || !chart || !series || !profile || profile.levels.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const MAX_BAR_W = W * 0.15; // bars occupy the rightmost 15% of the pane
    const maxVol    = Math.max(...profile.levels.map((l) => l.volume));
    if (maxVol === 0) return;

    const levels = profile.levels; // sorted low→high from backend

    // Row height: pixel distance between adjacent price levels
    let rowH = 4;
    if (levels.length >= 2) {
      const y0 = series.priceToCoordinate(levels[0].price);
      const y1 = series.priceToCoordinate(levels[1].price);
      if (y0 !== null && y1 !== null) rowH = Math.abs(y1 - y0);
    }
    rowH = Math.max(1, Math.min(rowH, 20));

    // ── Volume bars ───────────────────────────────────────────────────
    for (const lvl of levels) {
      const y = series.priceToCoordinate(lvl.price);
      if (y === null || y < 0 || y > H) continue;

      const barW = (lvl.volume / maxVol) * MAX_BAR_W;
      const barH = Math.max(1, rowH - 1);
      const x    = W - barW;

      if (lvl.is_poc) {
        ctx.fillStyle = '#f0b90b';
      } else if (lvl.in_value_area) {
        ctx.fillStyle = 'rgba(59,130,246,0.60)';
      } else {
        ctx.fillStyle = 'rgba(107,114,128,0.40)';
      }
      ctx.fillRect(x, y - barH / 2, barW, barH);

      // Extra outline on POC bar to make it pop
      if (lvl.is_poc) {
        ctx.strokeStyle = '#f0b90b';
        ctx.lineWidth   = 1;
        ctx.strokeRect(x, y - barH / 2, barW, barH);
      }
    }

    // ── Dashed horizontal lines + labels ─────────────────────────────
    const drawLine = (price: number, color: string, label: string) => {
      const y = series.priceToCoordinate(price);
      if (y === null || y < 0 || y > H) return;

      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font         = 'bold 9px sans-serif';
      ctx.fillStyle    = color;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, W - 2, y - 1);
    };

    drawLine(profile.poc, '#f0b90b', 'POC');
    drawLine(profile.vah, '#3b82f6', 'VAH');
    drawLine(profile.val, '#3b82f6', 'VAL');
  };

  // Stable scheduler — created once, always delegates to the latest drawFnRef
  const scheduleDraw = useRef(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawFnRef.current());
  }).current;

  // ── Subscribe to chart events ─────────────────────────────────────────────
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

  // ── Resize canvas to match container ─────────────────────────────────────
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
    profileRef.current = null; // clear stale data on symbol change

    let ws: WebSocket | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/vprofile/${activeSymbol}/${activeInterval}`);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type: string;
            profile?: VProfile;
          };
          if ((msg.type === 'snapshot' || msg.type === 'update') && msg.profile) {
            profileRef.current = msg.profile;
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
    };
  }, [activeSymbol, activeInterval, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
