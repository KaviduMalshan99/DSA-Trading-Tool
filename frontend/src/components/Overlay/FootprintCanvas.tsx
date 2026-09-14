import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useChartStore } from '../../store/chartStore';
import { useReplayStore } from '../../store/replayStore';
import { useFootprintSignalStore } from '../../store/footprintSignalStore';
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
// hardcoded 5x same-level `imbalance` flag for display purposes (still sent,
// now unused here — see PriceLevel.imbalance below).
const IMBALANCE_MIN_SMALLER = 0.5;

// Tolerance for treating two levels as "one step apart" — guards against
// float rounding on the backend's `round(hi - i*step, decimals)` zero-fill,
// while still rejecting a real gap (>= 1.5 steps away).
const ADJACENCY_TOLERANCE_FRAC = 0.5;

// True only when `higher` and `lower` are genuine adjacent price rows (one
// `step` apart), not just adjacent *array* entries. The backend zero-fills
// live bars so this normally always holds, but a pathological (flash-move)
// bar falls back to sparse output on the backend — this is the frontend
// backstop for that case: a real gap must never be treated as a diagonal
// neighbor, since that would silently compare non-adjacent prices.
function isTrueNeighbor(higher: PriceLevel, lower: PriceLevel, step: number): boolean {
  if (step <= 0) return false;
  const diff = higher.price - lower.price;
  return Math.abs(diff - step) < step * ADJACENCY_TOLERANCE_FRAC;
}

// Diagonal (ATAS-style) buy imbalance at row `i`: this row's buy/ask volume
// vs. the SELL/bid volume of the row directly BELOW it (one tick lower) —
// aggressive buyers lifting the ask against aggressive sellers hitting the
// bid one level down. Undefined (false) for the bottom row, which has no
// row below, and across any gap where the "row below" isn't a true price
// neighbor.
function buyDiagonalImbalance(levels: PriceLevel[], i: number, step: number, ratio: number): boolean {
  if (i + 1 >= levels.length) return false;
  const cur = levels[i];
  const below = levels[i + 1];
  if (!isTrueNeighbor(cur, below, step)) return false;
  const buy = cur.buy_vol;
  const sell = below.sell_vol;
  if (Math.min(buy, sell) < IMBALANCE_MIN_SMALLER) return false;
  return buy >= ratio * sell;
}

// Diagonal sell imbalance at row `i`: this row's sell/bid volume vs. the
// BUY/ask volume of the row directly ABOVE it. Undefined for the top row.
function sellDiagonalImbalance(levels: PriceLevel[], i: number, step: number, ratio: number): boolean {
  if (i - 1 < 0) return false;
  const cur = levels[i];
  const above = levels[i - 1];
  if (!isTrueNeighbor(above, cur, step)) return false;
  const sell = cur.sell_vol;
  const buy = above.buy_vol;
  if (Math.min(sell, buy) < IMBALANCE_MIN_SMALLER) return false;
  return sell >= ratio * buy;
}

// Per-row diagonal flags for a whole bar — buy[i]/sell[i] are independent,
// unlike the old same-level model's single "dominant side" per row. Computed
// once per bar so the draw loop, Stacked Imbalance, and the Execution
// Dashboard signal all agree on the exact same result.
function computeDiagonalFlags(
  levels: PriceLevel[],
  step: number,
  ratio: number
): { buy: boolean[]; sell: boolean[] } {
  const buy: boolean[] = new Array(levels.length);
  const sell: boolean[] = new Array(levels.length);
  for (let i = 0; i < levels.length; i++) {
    buy[i] = buyDiagonalImbalance(levels, i, step, ratio);
    sell[i] = sellDiagonalImbalance(levels, i, step, ratio);
  }
  return { buy, sell };
}

interface StackRun {
  start: number; // index into bar.levels (inclusive)
  end:   number; // index into bar.levels (inclusive)
  side:  'buy' | 'sell';
}

// Runs of >= stackSize consecutive rows flagged on the SAME diagonal side.
// Buy-side and sell-side runs are found independently (a row can carry both
// flags, so the two run sets can overlap) — "consecutive" means adjacent
// array entries, which computeDiagonalFlags already only marks true between
// genuine price neighbors (see isTrueNeighbor), so a gap in the underlying
// data can never bridge a stack run either. Takes precomputed flags (rather
// than levels/step/ratio) so callers that already ran computeDiagonalFlags
// for the per-row highlight pass don't redo the same work.
function findStackRuns(buy: boolean[], sell: boolean[], stackSize: number): StackRun[] {
  const runs: StackRun[] = [];
  for (const [flags, side] of [[buy, 'buy'], [sell, 'sell']] as const) {
    let i = 0;
    while (i < flags.length) {
      if (!flags[i]) { i++; continue; }
      let j = i + 1;
      while (j < flags.length && flags[j]) j++;
      if (j - i >= stackSize) runs.push({ start: i, end: j - 1, side });
      i = j;
    }
  }
  return runs;
}

interface PriceLevel {
  price:    number;
  buy_vol:  number;
  sell_vol: number;
  imbalance: boolean; // backend's hardcoded-5x flag — kept for payload compatibility, not used for rendering
}

// Summarizes one bar's strongest signal for the Execution Dashboard's
// Imbalance/Stacked row: prefer an active stack (longest run wins ties);
// fall back to the single strongest per-row diagonal imbalance when no run
// reaches stack_size. Buy and sell diagonal flags are independent per row
// (see computeDiagonalFlags), so both are scanned rather than picking one
// "side" per row.
function summarizeBarSignal(
  levels: PriceLevel[],
  step: number,
  ratio: number,
  stackSize: number
): { side: 'buy' | 'sell' | null; isStack: boolean } {
  const { buy, sell } = computeDiagonalFlags(levels, step, ratio);
  const runs = findStackRuns(buy, sell, stackSize);
  if (runs.length > 0) {
    const longest = runs.reduce((best, r) => (r.end - r.start > best.end - best.start ? r : best));
    return { side: longest.side, isStack: true };
  }

  let strongestSide: 'buy' | 'sell' | null = null;
  let strongestRatio = -Infinity;
  for (let i = 0; i < levels.length; i++) {
    if (buy[i]) {
      const belowSell = levels[i + 1].sell_vol;
      const r = belowSell > 0 ? levels[i].buy_vol / belowSell : Infinity;
      if (r > strongestRatio) { strongestRatio = r; strongestSide = 'buy'; }
    }
    if (sell[i]) {
      const aboveBuy = levels[i - 1].buy_vol;
      const r = aboveBuy > 0 ? levels[i].sell_vol / aboveBuy : Infinity;
      if (r > strongestRatio) { strongestRatio = r; strongestSide = 'sell'; }
    }
  }
  return { side: strongestSide, isStack: false };
}

interface FootprintBar {
  time:     number;        // candle open-time in ms
  decimals?: number;      // decimal places for level price labels (backend-derived from its bucket step)
  step:     number;       // price gap between adjacent levels — backend zero-fills live bars to this step (see isTrueNeighbor)
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
  const replayActive     = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);

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
      // Replay: skip bars later than the replay cursor — the live WS keeps
      // filling barsRef in the background the whole time (see the WS effect
      // below), so this is purely a draw-time filter, not a data gate.
      if (replayActive && (replayCursorTime == null || bar.time > replayCursorTime)) continue;

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
      const edgeW      = 3; // width of the per-side diagonal-imbalance accent stripe

      // ── Clip to candle boundaries — nothing can overflow ─────────────
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftX, topY, candleWidth, candleHeight);
      ctx.clip();

      let prevRowTop: number | null = null;

      // Diagonal flags for every row, computed once per bar so the per-row
      // highlight loop and the Stacked Imbalance pass below agree exactly.
      const { buy: buyDiag, sell: sellDiag } = computeDiagonalFlags(levels, bar.step, imbalanceRatio);

      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
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

        // Diagonal (ATAS-style) Imbalance highlight — buy-diagonal (this
        // row's ask vs. the row BELOW's bid) and sell-diagonal (this row's
        // bid vs. the row ABOVE's ask) are independent, so a row can show
        // either, both, or neither, unlike the old same-level model which
        // treated them as mutually exclusive. Each side draws its own tint/
        // edge-stripe/chip on its own half of the row, so both can render
        // together without colliding.
        const buyIsDiagonal  = buyDiag[i];
        const sellIsDiagonal = sellDiag[i];

        if (buyIsDiagonal) {
          ctx.fillStyle = 'rgba(0,255,136,0.07)';
          ctx.fillRect(leftX, rowTop, candleWidth, rowH);
          ctx.fillStyle = '#00ff88';
          ctx.fillRect(leftX, rowTop, edgeW, rowH);

          ctx.font = boldFont;
          const textW = ctx.measureText(buyStr).width;
          const boxH  = Math.min(rowH - 2, fontSize + 6);
          ctx.fillStyle = 'rgba(0,255,136,0.16)';
          ctx.fillRect(leftX + 1 + edgeW, y - boxH / 2, textW + pad * 2, boxH);
        }

        if (sellIsDiagonal) {
          ctx.fillStyle = 'rgba(255,68,68,0.07)';
          ctx.fillRect(leftX, rowTop, candleWidth, rowH);
          ctx.fillStyle = '#ff4444';
          ctx.fillRect(rightX - edgeW, rowTop, edgeW, rowH);

          ctx.font = boldFont;
          const textW = ctx.measureText(sellStr).width;
          const boxH  = Math.min(rowH - 2, fontSize + 6);
          ctx.fillStyle = 'rgba(255,68,68,0.16)';
          ctx.fillRect(rightX - 1 - edgeW - textW - pad * 2, y - boxH / 2, textW + pad * 2, boxH);
        }

        // Buy volume — LEFT, green
        ctx.font = buyIsDiagonal ? boldFont : normalFont;
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
        ctx.font = sellIsDiagonal ? boldFont : normalFont;
        ctx.fillStyle = '#ff4444';
        ctx.textAlign = 'right';
        ctx.fillText(sellStr, rightX - pad, y);
      }

      // ── Stacked Imbalance — bracket around runs of >= stackSize consecutive ──
      // same-side diagonally-imbalanced levels (built on the same diagonal
      // flags used above). Drawn after the per-level pass so the bracket
      // sits on top of it.
      const stackRuns = findStackRuns(buyDiag, sellDiag, stackSize);
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

        // "STACK" tag — a small horizontal chip sitting exactly on the box's
        // top border (a seam BETWEEN two rows, not any row's own vertically-
        // centered number text), so it can't land on top of the buy/sell
        // numbers regardless of candle width. Was previously a vertical tag
        // inside the row content area next to the buy/sell column, which
        // collided with the numbers once taller rows (readability fix) let
        // fontSize grow — this replaces that placement rather than the box,
        // which is unchanged. Skipped entirely (box-only) when the row is
        // too short to hold the chip without touching the neighboring row's
        // number — the box alone already communicates "this is a stack".
        const tagFontSize = Math.max(MIN_FONT_PX, Math.min(fontSize, 10));
        const chipH = tagFontSize + 4;
        if (chipH + fontSize + 4 <= rowH) {
          ctx.font = `bold ${tagFontSize}px "Courier New", monospace`;
          const tagText = 'STACK';
          const chipW   = ctx.measureText(tagText).width + 8;
          const chipY   = runTopY;

          ctx.fillStyle = `${accent}33`;
          ctx.fillRect(centerX - chipW / 2, chipY - chipH / 2, chipW, chipH);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1;
          ctx.strokeRect(centerX - chipW / 2, chipY - chipH / 2, chipW, chipH);

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = accent;
          ctx.fillText(tagText, centerX, chipY);
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

  // Redraw on every replay step/entry/exit — the chart's own range-change
  // event usually covers this too (ReplayEngine moves the visible range on
  // every step), but this makes the redraw explicit rather than incidental.
  useEffect(() => {
    scheduleDraw();
  }, [replayActive, replayCursorTime, scheduleDraw]);

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
    useFootprintSignalStore.getState().setSignal(null, false, null);
    scheduleDraw(); // clear immediately — don't wait for the socket to reconnect

    // Mirrors the most recent bar's imbalance/stack signal into
    // footprintSignalStore for the Execution Dashboard — reads live
    // imbalanceRatio/stackSize via getState() so it stays current even
    // though this effect itself only re-runs on symbol/interval change.
    function updateSignalStore() {
      const bars = barsRef.current;
      if (bars.size === 0) return;
      const latestTime = Math.max(...bars.keys());
      const latestBar  = bars.get(latestTime)!;
      const { imbalanceRatio: ratio, stackSize: size } = useChartStore.getState();
      const { side, isStack } = summarizeBarSignal(latestBar.levels, latestBar.step, ratio, size);

      const store = useFootprintSignalStore.getState();
      if (store.side !== side || store.isStack !== isStack || store.barTime !== latestTime) {
        store.setSignal(side, isStack, latestTime);
      }
    }

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

          updateSignalStore();
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
