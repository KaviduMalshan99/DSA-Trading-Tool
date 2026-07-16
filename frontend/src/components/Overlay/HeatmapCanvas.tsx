import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { shiftEpochSeconds } from '../../utils/chartTime';

const WS_BASE     = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const PRICE_STEP  = 10;   // must match backend DEFAULT_STEP
const MIN_DRAW_MS = 100;  // throttle: max 10 redraws/second
const MAX_SNAPS   = 2000; // ~33 min of 1-second snapshots
const BUCKET_SECS = 10;   // group snapshots into 10-sec buckets → ~10px cells on 1m chart

interface Snapshot {
  time: number;
  levels: Record<string, number>;
}

export interface HeatmapCanvasProps {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

type LWTime = import('lightweight-charts').Time;

// ── 256-step color LUT — computed once at module load ────────────────────────
// Minimum alpha is 0.4 so even low-intensity cells are clearly visible.
const STOPS: [number, number, number, number, number][] = [
  [0.00,   0,   0,   0, 0.00],  // skip zone (alpha=0, filtered below)
  [0.05,   0,   0, 139, 0.40],  // dark blue — minimum visible
  [0.30,  75,   0, 130, 0.60],  // purple
  [0.50, 255, 140,   0, 0.70],  // orange
  [1.00, 255, 255,   0, 0.90],  // yellow
];

const COLOR_LUT: string[] = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  if (v < 0.05) return ''; // intensity too low — caller skips

  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let j = 0; j < STOPS.length - 1; j++) {
    if (v <= STOPS[j + 1][0]) { lo = STOPS[j]; hi = STOPS[j + 1]; break; }
  }

  const t = hi[0] === lo[0] ? 1 : (v - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1] + t * (hi[1] - lo[1]));
  const g = Math.round(lo[2] + t * (hi[2] - lo[2]));
  const b = Math.round(lo[3] + t * (hi[3] - lo[3]));
  const a = (lo[4] + t * (hi[4] - lo[4])).toFixed(2);
  return `rgba(${r},${g},${b},${a})`;
});

function intensityToColor(v: number): string {
  return COLOR_LUT[Math.round(Math.min(1, Math.max(0, v)) * 255)];
}
// ─────────────────────────────────────────────────────────────────────────────

export function HeatmapCanvas({ sharedChartRef, sharedSeriesRef }: HeatmapCanvasProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const lastDrawRef  = useRef(0);
  const snapshotsRef = useRef<Snapshot[]>([]);

  const { activeSymbol } = useMarketStore();

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

    const raw = snapshotsRef.current;
    if (raw.length === 0) return;

    // ── Step 1: bucket 1-second snapshots into BUCKET_SECS-wide groups ───────
    // Each bucket averages intensity across the window, giving ~10× wider cells.
    const bucketMap = new Map<number, { levels: Record<string, number>; count: number }>();
    for (const snap of raw) {
      const key = Math.floor(snap.time / BUCKET_SECS) * BUCKET_SECS;
      let b = bucketMap.get(key);
      if (!b) { b = { levels: {}, count: 0 }; bucketMap.set(key, b); }
      b.count++;
      for (const [ps, v] of Object.entries(snap.levels)) {
        b.levels[ps] = (b.levels[ps] ?? 0) + v;
      }
    }
    const snapshots: Snapshot[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([time, { levels, count }]) => ({
        time,
        levels: Object.fromEntries(
          Object.entries(levels).map(([ps, sum]) => [ps, sum / count])
        ),
      }));

    // ── Step 2: resolve x coordinates; cull outside drawing margin ───────────
    const timeScale = chart.timeScale();
    type Resolved = { snap: Snapshot; x: number };
    const resolved: Resolved[] = [];
    for (const snap of snapshots) {
      const coord = timeScale.timeToCoordinate(snap.time as unknown as LWTime);
      if (coord === null) continue;
      const x = coord as unknown as number;
      if (x < -300 || x > W + 300) continue;
      resolved.push({ snap, x });
    }
    if (resolved.length === 0) return;

    // ── Step 3: pre-compute price→y and price→cellHeight ────────────────────
    const uniquePrices = new Set<number>();
    for (const { snap } of resolved) {
      for (const ps of Object.keys(snap.levels)) {
        uniquePrices.add(parseInt(ps, 10));
      }
    }

    const priceToY     = new Map<number, number>();
    const priceToCellH = new Map<number, number>();

    for (const price of uniquePrices) {
      const coord = series.priceToCoordinate(price);
      if (coord !== null) priceToY.set(price, coord as unknown as number);
    }
    for (const price of uniquePrices) {
      const y0 = priceToY.get(price);
      if (y0 === undefined) continue;
      const yAbove = priceToY.get(price + PRICE_STEP);
      const yBelow = priceToY.get(price - PRICE_STEP);
      const h = yAbove !== undefined
        ? Math.max(1, Math.abs(y0 - yAbove))
        : yBelow !== undefined
          ? Math.max(1, Math.abs(y0 - yBelow))
          : 4;
      priceToCellH.set(price, h);
    }

    // ── Step 4: draw ─────────────────────────────────────────────────────────
    for (let i = 0; i < resolved.length; i++) {
      const { snap, x } = resolved[i];
      const nextX = i + 1 < resolved.length ? resolved[i + 1].x : x + 2;
      const cellW = Math.max(1, nextX - x);

      for (const [priceStr, intensity] of Object.entries(snap.levels)) {
        if (intensity < 0.05) continue;

        const price = parseInt(priceStr, 10);
        const y     = priceToY.get(price);
        if (y === undefined) continue;

        const cellH = priceToCellH.get(price) ?? 4;
        if (y + cellH < 0 || y - cellH > H) continue;

        const color = intensityToColor(intensity);
        if (!color) continue;

        ctx.fillStyle = color;
        ctx.fillRect(x, y - cellH / 2, cellW, cellH);
      }
    }
  };

  const scheduleDraw = useRef(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const now = performance.now();
      if (now - lastDrawRef.current < MIN_DRAW_MS) return;
      lastDrawRef.current = now;
      drawFnRef.current();
    });
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
    snapshotsRef.current = [];

    let ws:     WebSocket | null = null;
    let stopped = false;
    let timer:  ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/heatmap/${activeSymbol}`);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type:       string;
            snapshots?: Snapshot[];
            snapshot?:  Snapshot;
          };
          if (msg.type === 'historical' && msg.snapshots) {
            snapshotsRef.current = msg.snapshots.map((s) => ({ ...s, time: shiftEpochSeconds(s.time) }));
            scheduleDraw();
          } else if (msg.type === 'snapshot' && msg.snapshot) {
            const snaps = snapshotsRef.current;
            if (snaps.length >= MAX_SNAPS) snaps.shift();
            snaps.push({ ...msg.snapshot, time: shiftEpochSeconds(msg.snapshot.time) });
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
      snapshotsRef.current = [];
    };
  }, [activeSymbol, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-0">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
