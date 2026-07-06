import { useEffect, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useDrawingStore, type Drawing, type DrawingTool } from '../../store/drawingStore';
import { useMarketStore } from '../../store/marketStore';
import type { Candle } from '../../types/market';

// Tools that should own mouse events on the overlay canvas (blocking chart
// pan/zoom underneath). Cursor-group tools (cross/dot/arrow/demonstration/magic)
// deliberately do NOT capture, so the chart stays pannable by default.
const CAPTURE_TOOLS = new Set<DrawingTool>(['trendline', 'hline', 'rectangle', 'fibonacci', 'eraser']);

const CURSOR_STYLE: Record<string, string> = {
  cross: 'crosshair',
  dot: 'cell',
  arrow: 'default',
  demonstration: 'default',
  magic: 'crosshair',
  eraser: 'not-allowed',
};

type LWTime = import('lightweight-charts').Time;

const FIB_LEVELS = [
  { pct: 0,     color: '#787B86', label: '0%' },
  { pct: 0.236, color: '#F23645', label: '23.6%' },
  { pct: 0.382, color: '#FF9800', label: '38.2%' },
  { pct: 0.500, color: '#4CAF50', label: '50%' },
  { pct: 0.618, color: '#2196F3', label: '61.8%' },
  { pct: 0.786, color: '#9C27B0', label: '78.6%' },
  { pct: 1,     color: '#787B86', label: '100%' },
];

interface Props {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

// ── coordinate helpers ────────────────────────────────────────────────────────

function priceToY(series: ISeriesApi<'Candlestick'>, price: number): number | null {
  const c = series.priceToCoordinate(price);
  return c == null ? null : (c as unknown as number);
}

function timeToX(chart: IChartApi, t: number): number | null {
  const c = chart.timeScale().timeToCoordinate(t as unknown as LWTime);
  return c == null ? null : (c as unknown as number);
}

function yToPrice(series: ISeriesApi<'Candlestick'>, y: number): number | null {
  const p = series.coordinateToPrice(y);
  return p == null ? null : (p as unknown as number);
}

function xToTime(chart: IChartApi, x: number): number | null {
  const t = chart.timeScale().coordinateToTime(x);
  return t == null ? null : (t as unknown as number);
}

// ── draw one completed/preview drawing ───────────────────────────────────────

function renderDrawing(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  d: Drawing,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
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

    // extend to edges
    const dx = x2 - x1;
    const dy = y2 - y1;
    let xL = 0, yL = 0, xR = W, yR = 0;
    if (Math.abs(dx) < 0.001) {
      xL = x1; yL = 0; xR = x1; yR = H;
    } else {
      yL = y1 + (dy / dx) * (0  - x1);
      yR = y1 + (dy / dx) * (W - x1);
    }

    ctx.strokeStyle = pick('#2196F3', '#64B5F6');
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xL, yL);
    ctx.lineTo(xR, yR);
    ctx.stroke();

    // price labels
    const fmt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = pick('#2196F3', '#64B5F6');
    ctx.font = '11px monospace';
    ctx.fillText(fmt(d.price1), Math.min(x1 + 4, W - 70), y1 - 4);
    ctx.fillText(fmt(d.price2), Math.min(x2 + 4, W - 70), y2 - 4);

  } else if (d.type === 'hline') {
    const y = priceToY(series, d.price);
    if (y == null) { ctx.restore(); return; }

    ctx.strokeStyle = pick('#FF9800', '#FFB74D');
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = pick('#FF9800', '#FFB74D');
    ctx.font = '11px monospace';
    ctx.fillText(label, W - 90, y - 4);

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

    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.1)' : 'rgba(33,150,243,0.1)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = pick('#2196F3', '#64B5F6');
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.setLineDash([]);
    ctx.strokeRect(rx, ry, rw, rh);

    const topP    = Math.max(d.price1, d.price2);
    const bottomP = Math.min(d.price1, d.price2);
    const range   = (topP - bottomP).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillStyle = pick('#2196F3', '#64B5F6');
    ctx.font = '10px monospace';
    ctx.fillText(`Δ${range}`, rx + 4, ry + 14);

  } else if (d.type === 'fibonacci') {
    const xH = timeToX(chart, d.timeHigh);
    const yH = priceToY(series, d.priceHigh);
    const xL = timeToX(chart, d.timeLow);
    const yL = priceToY(series, d.priceLow);
    if (xH == null || yH == null || xL == null || yL == null) { ctx.restore(); return; }

    const xLeft  = Math.min(xH, xL);
    const xRight = Math.max(xH, xL);
    const range  = d.priceHigh - d.priceLow;

    for (const { pct, color, label } of FIB_LEVELS) {
      const price = d.priceHigh - pct * range;
      const y = priceToY(series, price);
      if (y == null) continue;

      const lineColor = eraserHover ? '#f85149' : color;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = pct === 0.618 ? 1.5 : 1;
      ctx.setLineDash([4, 3]);
      ctx.globalAlpha = selected ? 1 : 0.85;
      ctx.beginPath();
      ctx.moveTo(xLeft, y);
      ctx.lineTo(xRight, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // label on right
      const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ctx.fillStyle = lineColor;
      ctx.font = '10px monospace';
      ctx.fillText(`${label}  ${priceStr}`, Math.min(xRight + 4, W - 120), y - 3);
    }

    // shaded region
    ctx.fillStyle = eraserHover ? 'rgba(248,81,73,0.06)' : 'rgba(33,150,243,0.04)';
    ctx.fillRect(xLeft, Math.min(yH, yL), xRight - xLeft, Math.abs(yH - yL));
  }

  ctx.restore();
}

// ── hit-test a drawing (returns true if mouse is close enough to select) ─────

function hitTest(
  d: Drawing,
  mx: number,
  my: number,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
): boolean {
  const TOL = 8;

  if (d.type === 'hline') {
    const y = priceToY(series, d.price);
    return y != null && Math.abs(my - y) < TOL;
  }

  if (d.type === 'trendline') {
    const x1 = timeToX(chart, d.time1);
    const y1 = priceToY(series, d.price1);
    const x2 = timeToX(chart, d.time2);
    const y2 = priceToY(series, d.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(mx - x1, my - y1) < TOL;
    const t = Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / len2));
    const dist = Math.hypot(mx - (x1 + t * dx), my - (y1 + t * dy));
    return dist < TOL;
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

  if (d.type === 'fibonacci') {
    const range = d.priceHigh - d.priceLow;
    for (const { pct } of FIB_LEVELS) {
      const price = d.priceHigh - pct * range;
      const y = priceToY(series, price);
      if (y != null && Math.abs(my - y) < TOL) return true;
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

// ── main component ────────────────────────────────────────────────────────────

export function DrawingCanvas({ sharedChartRef, sharedSeriesRef }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);

  // drawing-in-progress state stored in refs so we don't re-render mid-draw
  const drawingRef = useRef<{
    active: boolean;
    step: number;
    x1: number; y1: number;
    x2: number; y2: number;
  }>({ active: false, step: 0, x1: 0, y1: 0, x2: 0, y2: 0 });

  const { activeTool, drawings, selectedId, magnetEnabled, addDrawing, deleteDrawing, selectDrawing } =
    useDrawingStore();
  const { activeSymbol, activeInterval, candles } = useMarketStore();

  const activeToolRef     = useRef<DrawingTool>(activeTool);
  const drawingsRef       = useRef<Drawing[]>(drawings);
  const selectedIdRef     = useRef<string | null>(selectedId);
  const candlesRef        = useRef<Candle[]>(candles);
  const magnetEnabledRef  = useRef(magnetEnabled);

  // "Eraser" hover target (drawing highlighted red, ready to delete on click).
  const hoverEraseIdRef = useRef<string | null>(null);
  // "Magic" snap indicator — nearest candle OHLC point to the cursor.
  const magnetPointRef  = useRef<MagnetSnap | null>(null);
  // "Demonstration" — last known mouse position (tracked even in modes that
  // don't capture the canvas, via the window-level listener below).
  const mousePosRef = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false });

  activeToolRef.current     = activeTool;
  drawingsRef.current       = drawings;
  selectedIdRef.current     = selectedId;
  candlesRef.current        = candles;
  magnetEnabledRef.current  = magnetEnabled;

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

      // completed drawings
      const eraserActive = activeToolRef.current === 'eraser';
      for (const d of drawingsRef.current) {
        renderDrawing(
          ctx, W, H, d, chart, series,
          d.id === selectedIdRef.current,
          eraserActive && d.id === hoverEraseIdRef.current,
        );
      }

      // live preview
      const ds = drawingRef.current;
      if (ds.active && ds.step >= 1) {
        const tool = activeToolRef.current;
        const price1 = yToPrice(series, ds.y1);
        const time1  = xToTime(chart, ds.x1);
        const price2 = yToPrice(series, ds.y2);
        const time2  = xToTime(chart, ds.x2);
        if (price1 != null && time1 != null && price2 != null && time2 != null) {
          let preview: Drawing | null = null;
          if (tool === 'trendline')
            preview = { id: '__preview', type: 'trendline', price1, time1, price2, time2 };
          else if (tool === 'hline')
            preview = { id: '__preview', type: 'hline', price: price1 };
          else if (tool === 'rectangle')
            preview = { id: '__preview', type: 'rectangle', price1, time1, price2, time2 };
          else if (tool === 'fibonacci')
            preview = { id: '__preview', type: 'fibonacci',
              priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
              priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 };
          if (preview) {
            ctx.globalAlpha = 0.7;
            renderDrawing(ctx, W, H, preview, chart, series, false);
            ctx.globalAlpha = 1;
          }
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

      // "Demonstration" — large translucent circle following the cursor
      if (activeToolRef.current === 'demonstration' && mousePosRef.current.inside) {
        const { x: mx, y: my } = mousePosRef.current;
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx, my, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.stroke();
        ctx.restore();
      }
    });
  }, [sharedChartRef, sharedSeriesRef]);

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

  useEffect(() => { scheduleRender(); }, [drawings, selectedId, scheduleRender]);

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
    scheduleRender();
  }, [activeTool, scheduleRender]);

  // ── mouse event handlers (drawing tools + eraser — canvas captures events) ─
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const tool = activeToolRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    if (!chart || !series) return;

    const { x, y } = getCoords(e);

    if (tool === 'eraser') {
      // hit-test drawings in reverse order (top-most first) and delete on click
      for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
        if (hitTest(drawingsRef.current[i], x, y, chart, series)) {
          deleteDrawing(drawingsRef.current[i].id);
          break;
        }
      }
      return;
    }

    const snap = magnetEnabledRef.current
      ? computeMagnetSnap(x, y, chart, series, candlesRef.current)
      : null;
    const px = snap ? snap.x : x;
    const py = snap ? snap.y : y;

    const ds = drawingRef.current;

    if (!ds.active) {
      // first click: anchor point 1
      ds.active = true;
      ds.step   = 1;
      ds.x1 = ds.x2 = px;
      ds.y1 = ds.y2 = py;
      scheduleRender();
      return;
    }

    // second click: finalize
    ds.x2 = px; ds.y2 = py;
    const price1 = yToPrice(series, ds.y1);
    const time1  = xToTime(chart, ds.x1);
    const price2 = yToPrice(series, ds.y2);
    const time2  = xToTime(chart, ds.x2);
    ds.active = false; ds.step = 0;

    if (price1 == null || time1 == null || price2 == null || time2 == null) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (tool === 'trendline')
      addDrawing({ id, type: 'trendline', price1, time1, price2, time2 });
    else if (tool === 'hline')
      addDrawing({ id, type: 'hline', price: price1 });
    else if (tool === 'rectangle')
      addDrawing({ id, type: 'rectangle', price1, time1, price2, time2 });
    else if (tool === 'fibonacci')
      addDrawing({ id, type: 'fibonacci',
        priceHigh: Math.max(price1, price2), timeHigh: price1 >= price2 ? time1 : time2,
        priceLow:  Math.min(price1, price2), timeLow:  price1 < price2  ? time1 : time2 });

    // auto-select the newly placed drawing so trash button is immediately usable
    selectDrawing(id);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCoords(e);
    const tool   = activeToolRef.current;
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    const canvas = canvasRef.current;

    if (tool === 'eraser') {
      let hit: string | null = null;
      if (chart && series) {
        for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
          if (hitTest(drawingsRef.current[i], x, y, chart, series)) {
            hit = drawingsRef.current[i].id;
            break;
          }
        }
      }
      if (hoverEraseIdRef.current !== hit) {
        hoverEraseIdRef.current = hit;
        scheduleRender();
      }
      if (canvas) canvas.style.cursor = CURSOR_STYLE.eraser;
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
      ds.x2 = snap ? snap.x : x;
      ds.y2 = snap ? snap.y : y;
    }
    scheduleRender();

    if (canvas) canvas.style.cursor = 'crosshair';
  };

  // ── mouse tracking for cursor-group tools (cross/dot/arrow/demonstration/magic) ─
  // These tools deliberately leave the canvas's pointer-events at 'none' so the
  // chart stays pannable, so window-level listeners are used instead — they still
  // fire (via bubbling from whatever element was actually hit) without blocking it.
  useEffect(() => {
    const onWinMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const chart  = sharedChartRef.current;
      const series = sharedSeriesRef.current;
      if (!canvas) return;
      const tool = activeToolRef.current;
      if (CAPTURE_TOOLS.has(tool)) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      mousePosRef.current = { x, y, inside };

      if (!inside || !chart || !series) {
        if (magnetPointRef.current) { magnetPointRef.current = null; scheduleRender(); }
        else if (tool === 'demonstration') scheduleRender();
        return;
      }

      magnetPointRef.current = magnetEnabledRef.current
        ? computeMagnetSnap(x, y, chart, series, candlesRef.current)
        : null;

      canvas.style.cursor = CURSOR_STYLE[tool] ?? 'default';
      scheduleRender();
    };

    const onWinDown = (e: MouseEvent) => {
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

      let hit: string | null = null;
      for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
        if (hitTest(drawingsRef.current[i], x, y, chart, series)) {
          hit = drawingsRef.current[i].id;
          break;
        }
      }
      selectDrawing(hit);
    };

    window.addEventListener('mousemove', onWinMove);
    window.addEventListener('mousedown', onWinDown);
    return () => {
      window.removeEventListener('mousemove', onWinMove);
      window.removeEventListener('mousedown', onWinDown);
    };
  }, [scheduleRender, selectDrawing]);

  // ── keyboard: Delete / Escape ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        drawingRef.current.active = false;
        drawingRef.current.step   = 0;
        scheduleRender();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedIdRef.current;
        if (sel) deleteDrawing(sel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteDrawing, scheduleRender]);

  // Trendline/hline/rectangle/fibonacci/eraser capture all events (chart
  // pan/zoom blocked — intentional while placing points or erasing).
  // Cursor-group tools (cross/dot/arrow/demonstration/magic) pass events
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
        style={{ cursor: CURSOR_STYLE[activeTool] ?? 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      />
    </div>
  );
}
