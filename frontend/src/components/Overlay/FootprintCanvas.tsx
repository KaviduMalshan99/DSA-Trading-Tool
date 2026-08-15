import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useChartStore } from '../../store/chartStore';
import { intervalToSecs } from '../../utils/interval';
import { toChartTimeSeconds } from '../../utils/chartTime';

const WS_BASE       = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const MIN_CANDLE_PX = 100; // don't render if candle narrower than this

// Minimum height of one price-level row before the ladder is skipped.
//
// Row height is essentially `chartHeight * bucketStep / visiblePriceRange` —
// level count scales with the candle's range, so this is driven by the bucket
// step and the price axis, not by any single candle. When BTC bucketed to $10
// rows were ~60px and 8 was comfortable; since buckets became symbol-relative
// ($1 on BTC) the same zoom yields ~5-7px rows, and 8 silently suppressed the
// entire overlay. 5 restores drawing at a normal ~10-20 visible candles.
//
// Legibility is protected by sizing the font to the row (see fontSize below)
// rather than by keeping this threshold high — a high threshold doesn't make
// text readable, it just draws nothing.
const MIN_ROW_PX    = 5;
const MIN_FONT_PX   = 6;  // below this the digits stop being readable at all

// Mirrors app/analytics/footprint.py's _IMBALANCE_MIN_SMALLER — keep in sync
// if that constant ever changes. The ratio itself (default 3.0 = 300%) is
// user-adjustable via the toolbar and applied entirely client-side, since
// buy_vol/sell_vol already arrive raw per level — no backend round-trip
// needed to re-tune sensitivity live. This supersedes the backend's own
// hardcoded 5x `imbalance` flag for display purposes (still sent, now unused
// here).
const IMBALANCE_MIN_SMALLER = 0.5;

function isImbalance(buy: number, sell: number, ratio: number): boolean {
  const smaller = Math.min(buy, sell);
  if (smaller < IMBALANCE_MIN_SMALLER) return false;
  return buy >= ratio * sell || sell >= ratio * buy;
}

// Side of a level's imbalance, or null if the level isn't imbalanced —
// built directly on isImbalance() above so stacking always agrees with the
// existing single-level highlight.
function imbalanceSide(buy: number, sell: number, ratio: number): 'buy' | 'sell' | null {
  if (!isImbalance(buy, sell, ratio)) return null;
  return buy > sell ? 'buy' : 'sell';
}

interface StackRun {
  start: number; // index into bar.levels (inclusive)
  end:   number; // index into bar.levels (inclusive)
  side:  'buy' | 'sell';
}

// Runs of >= stackSize consecutive same-side imbalanced levels. "Consecutive"
// means adjacent entries in bar.levels (already sorted high→low, no gaps),
// per the Stage 3 Stacked Imbalance spec.
function findStackRuns(levels: PriceLevel[], ratio: number, stackSize: number): StackRun[] {
  const runs: StackRun[] = [];
  let i = 0;
  while (i < levels.length) {
    const side = imbalanceSide(levels[i].buy_vol, levels[i].sell_vol, ratio);
    if (side === null) { i++; continue; }
    let j = i + 1;
    while (j < levels.length && imbalanceSide(levels[j].buy_vol, levels[j].sell_vol, ratio) === side) j++;
    if (j - i >= stackSize) runs.push({ start: i, end: j - 1, side });
    i = j;
  }
  return runs;
}

interface PriceLevel {
  price:    number;
  buy_vol:  number;
  sell_vol: number;
  imbalance: boolean; // backend's hardcoded-5x flag — kept for payload compatibility, not used for rendering
}

interface FootprintBar {
  time:     number;        // candle open-time in ms
  decimals?: number;      // decimal places for level price labels (backend-derived from its bucket step)
  levels:   PriceLevel[]; // sorted high→low by backend
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
  const imbalanceRatio = useChartStore((s) => s.imbalanceRatio);
  const stackSize      = useChartStore((s) => s.stackSize);

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
      const openSec  = toChartTimeSeconds(bar.time);
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
      const priceDecimals = bar.decimals ?? 1;

      // ── Candle y-boundaries from outermost price levels ─────────────
      const topRaw    = series.priceToCoordinate(levels[0].price);
      const bottomRaw = series.priceToCoordinate(levels[levels.length - 1].price);
      if (topRaw === null || bottomRaw === null) continue;

      const topY        = topRaw    as unknown as number;
      const bottomY     = bottomRaw as unknown as number;
      const candleHeight = Math.abs(bottomY - topY);
      const rowH         = candleHeight / levels.length;
      if (rowH < MIN_ROW_PX) continue;

      // ── Dynamic font size — constrained by BOTH axes ─────────────────
      // Width alone isn't enough: rows can be far shorter than the
      // width-implied font, which is what makes dense ladders overlap.
      // Clamping to the row height keeps every number inside its own row.
      const widthFont = candleWidth > 200 ? 13 : candleWidth > 150 ? 11 : 9;
      const fontSize  = Math.max(MIN_FONT_PX, Math.min(widthFont, Math.floor(rowH - 1)));
      const showPrice = candleWidth > 120;
      const centerX   = leftX + candleWidth / 2;
      const pad       = fontSize * 0.4 + 2;
      const normalFont = `${fontSize}px "Courier New", monospace`;
      const boldFont   = `bold ${fontSize}px "Courier New", monospace`;
      const edgeW      = 3; // width of the per-level dominant-side accent stripe

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
        const levelImbalance = isImbalance(lvl.buy_vol, lvl.sell_vol, imbalanceRatio);
        const buyIsDominant  = levelImbalance && lvl.buy_vol  > lvl.sell_vol;
        const sellIsDominant = levelImbalance && lvl.sell_vol > lvl.buy_vol;

        // Dedicated Imbalance highlight (adjustable ratio, default 300%) —
        // full-row tint + an accent stripe on the aggressive side's edge, so
        // it reads clearly even at a glance, plus the tight chip behind the
        // dominant number itself for the close-up view.
        if (buyIsDominant || sellIsDominant) {
          const accent = buyIsDominant ? '#00ff88' : '#ff4444';

          ctx.fillStyle = buyIsDominant ? 'rgba(0,255,136,0.07)' : 'rgba(255,68,68,0.07)';
          ctx.fillRect(leftX, rowTop, candleWidth, rowH);

          ctx.fillStyle = accent;
          if (buyIsDominant) {
            ctx.fillRect(leftX, rowTop, edgeW, rowH);
          } else {
            ctx.fillRect(rightX - edgeW, rowTop, edgeW, rowH);
          }

          ctx.font = boldFont;
          const text  = buyIsDominant ? buyStr : sellStr;
          const textW = ctx.measureText(text).width;
          const boxH  = Math.min(rowH - 2, fontSize + 6);
          ctx.fillStyle = buyIsDominant ? 'rgba(0,255,136,0.16)' : 'rgba(255,68,68,0.16)';
          if (buyIsDominant) {
            ctx.fillRect(leftX + 1 + edgeW, y - boxH / 2, textW + pad * 2, boxH);
          } else {
            ctx.fillRect(rightX - 1 - edgeW - textW - pad * 2, y - boxH / 2, textW + pad * 2, boxH);
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
            : lvl.price.toFixed(priceDecimals);
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

      // ── Stacked Imbalance — bracket around runs of >= stackSize consecutive ──
      // same-side imbalanced levels (built on the same isImbalance() used above).
      // Drawn after the per-level pass so the bracket sits on top of it.
      const stackRuns = findStackRuns(levels, imbalanceRatio, stackSize);
      for (const run of stackRuns) {
        const runTopRaw    = series.priceToCoordinate(levels[run.start].price);
        const runBottomRaw = series.priceToCoordinate(levels[run.end].price);
        if (runTopRaw === null || runBottomRaw === null) continue;

        const runTopY    = Math.max(topY,    (runTopRaw    as unknown as number) - rowH / 2);
        const runBottomY = Math.min(bottomY, (runBottomRaw as unknown as number) + rowH / 2);
        const runHeight  = runBottomY - runTopY;
        if (runHeight <= 0) continue;

        const accent = run.side === 'buy' ? '#00ff88' : '#ff4444';

        // Group tint + bracket border — visually distinct from the single-level
        // highlight (which only tints/strokes one row at a time).
        ctx.fillStyle = run.side === 'buy' ? 'rgba(0,255,136,0.10)' : 'rgba(255,68,68,0.10)';
        ctx.fillRect(leftX, runTopY, candleWidth, runHeight);

        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(leftX + 1, runTopY + 1, candleWidth - 2, runHeight - 2);

        // "STACK" tag, read vertically along the aggressive side's edge —
        // only when the run is tall enough to hold it without crowding.
        const tagFontSize = Math.max(MIN_FONT_PX, Math.min(fontSize, 10));
        ctx.font = `bold ${tagFontSize}px "Courier New", monospace`;
        const tagText  = 'STACK';
        const tagWidth = ctx.measureText(tagText).width;
        if (runHeight > tagWidth + 12) {
          ctx.save();
          const tagX = run.side === 'buy' ? leftX + edgeW + 6 : rightX - edgeW - 6;
          const tagY = runTopY + runHeight / 2;
          ctx.translate(tagX, tagY);
          ctx.rotate(run.side === 'buy' ? -Math.PI / 2 : Math.PI / 2);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = accent;
          ctx.fillText(tagText, 0, 0);
          ctx.restore();
        }
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

  // Redraw when the imbalance ratio or stack size changes — no chart/WS event
  // fires this on its own, and imbalance/stacking are computed fresh at draw
  // time (not baked into the stored bar objects), so a plain redraw suffices.
  useEffect(() => {
    scheduleDraw();
  }, [imbalanceRatio, stackSize, scheduleDraw]);

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
    scheduleDraw(); // clear immediately — don't wait for the socket to reconnect

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
