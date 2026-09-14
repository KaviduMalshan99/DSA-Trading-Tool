/**
 * LevelsOverlay — canvas overlay drawing institutional reference levels:
 * today's daily open (dashed) and the prior day's high/low, PDH/PDL (solid).
 */

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { api } from '../../services/api';
import { decimalsForPrice } from '../../utils/priceFormat';
import { computeLevelsFromIntraday } from '../../utils/klineAnalytics';
import type { LevelsData } from '../../types/analytics';

const POLL_MS = 5 * 60_000; // levels move at most once a day — a slow refresh is plenty

const LABEL_GAP = 14; // min vertical spacing between adjacent labels so they don't collide

export interface LevelsOverlayProps {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// picks black/white text so the label stays legible against its own colored pill in either theme
function contrastTextColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 150 ? '#111111' : '#ffffff';
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function LevelsOverlay({ sharedChartRef, sharedSeriesRef }: LevelsOverlayProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef       = useRef(0);
  const dataRef      = useRef<LevelsData | null>(null);

  const { activeSymbol } = useMarketStore();
  const replayActive = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);
  const wasReplayActiveRef = useRef(false);

  // "Levels unavailable" indicator — Absorption's "watching" badge pattern
  // applied here: only true once we have NOTHING to show (no last-known data)
  // and the most recent fetch attempt for the current symbol failed, so a
  // genuine outage/404 (new listing with <2 daily candles) reads as visibly
  // broken instead of silently blank.
  const [unavailable, setUnavailable] = useState(false);

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

    const data = dataRef.current;
    if (!data) return;

    // labels sit clear of the right-edge price axis, inside the plotting area
    const axisWidth = chart.priceScale('right').width() || 70;
    const labelRightX = W - axisWidth - 8;

    const drawLine = (price: number, color: string, dashed: boolean): number | null => {
      const y = series.priceToCoordinate(price);
      if (y === null || y < 0 || y > H) return null;

      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      if (dashed) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);

      return y;
    };

    type PendingLabel = { y: number; color: string; text: string };
    const pending: PendingLabel[] = [];

    const addLabel = (y: number | null, color: string, label: string, price: number) => {
      if (y === null) return;
      pending.push({ y, color, text: `${label}  ${price.toFixed(data.decimals)}` });
    };

    addLabel(drawLine(data.daily_open, '#9598a1', true), '#9598a1', 'Daily Open', data.daily_open);
    addLabel(drawLine(data.pdh, '#ff9800', false), '#ff9800', 'PDH', data.pdh);
    addLabel(drawLine(data.pdl, '#26c6da', false), '#26c6da', 'PDL', data.pdl);

    // nudge labels apart vertically so close-together levels don't collide
    pending.sort((a, b) => a.y - b.y);
    const placed: number[] = [];
    for (let i = 0; i < pending.length; i++) {
      const minY = i === 0 ? pending[i].y : Math.max(pending[i].y, placed[i - 1] + LABEL_GAP);
      placed.push(minY);
    }

    ctx.font = 'bold 9px sans-serif';
    const PAD_X = 5;
    const PILL_H = 15;

    pending.forEach((p, i) => {
      const labelY = placed[i];
      const textW  = ctx.measureText(p.text).width;
      const pillW  = textW + PAD_X * 2;
      const pillX  = labelRightX - pillW;
      const pillY  = labelY - PILL_H / 2;

      roundedRectPath(ctx, pillX, pillY, pillW, PILL_H, 4);
      ctx.fillStyle = `rgba(${hexToRgb(p.color).join(',')},0.82)`;
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = 1;
      ctx.stroke();

      ctx.fillStyle    = contrastTextColor(p.color);
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, labelRightX - PAD_X, labelY);
    });
  };

  const scheduleDraw = useRef(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawFnRef.current());
  }).current;

  // ── Chart event subscriptions ─────────────────────────────────────────────
  // Retries attaching if sharedChartRef isn't populated yet on this first
  // run instead of permanently giving up — ChartContainer's mount order
  // (LevelsOverlay mounts after TradingChart, see its comment) means the ref
  // is normally already set by now, but a one-shot `if (!chart) return` with
  // no retry would silently and permanently skip subscribing (no re-render,
  // no line redraws on pan/zoom) if that ordering were ever violated. This
  // costs nothing in the normal case — `attach()` succeeds on its first call.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let detach: (() => void) | null = null;

    function attach() {
      if (cancelled) return;
      const chart = sharedChartRef.current;
      if (!chart) {
        pollTimer = setTimeout(attach, 100);
        return;
      }
      const onUpdate = () => scheduleDraw();
      chart.timeScale().subscribeVisibleLogicalRangeChange(onUpdate);
      chart.subscribeCrosshairMove(onUpdate);
      scheduleDraw();
      detach = () => {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onUpdate);
        chart.unsubscribeCrosshairMove(onUpdate);
      };
    }

    attach();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      detach?.();
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

  // ── Poll REST endpoint (levels are daily — no need for a live stream) ──────
  // Deliberately does NOT null dataRef on symbol switch — the old symbol's
  // lines stay visible (and, on an incompatible price scale, simply fail
  // LevelsOverlay's own y-bounds check and stop drawing) until the NEW
  // symbol's fetch actually succeeds, so a transient blip never blanks a
  // working overlay. Only a genuinely empty dataRef (nothing fetched yet for
  // this symbol, or every attempt so far has failed) shows nothing.
  useEffect(() => {
    setUnavailable(false); // fresh symbol — not yet known to be broken
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let failureCount = 0;

    async function fetchLevels() {
      // Don't let the live poll clobber the replay-computed levels while
      // replay is active — the replay effect below owns dataRef until exit.
      if (useReplayStore.getState().isActive || stopped) return;
      try {
        const data = await api.getLevels(activeSymbol);
        if (stopped) return;
        failureCount = 0;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        dataRef.current = data;
        setUnavailable(false);
        scheduleDraw();
      } catch {
        if (stopped) return;
        failureCount++;
        // Nothing to show at all (first-ever fetch for this symbol, or every
        // attempt since has failed) — surface it instead of staying blank
        // with no explanation. A failed *refresh* with stale-but-valid
        // levels already on screen stays silent, per the "keep last-known
        // levels visible" behavior above.
        if (!dataRef.current) setUnavailable(true);
        // Quick retry with backoff (3s/6s/12s/24s, capped at 30s) instead of
        // waiting out the full 5-minute POLL_MS — self-heals a transient
        // blip about as fast as SMC/Structure/VWAP's much shorter poll
        // intervals already do, rather than leaving this overlay dark for
        // minutes on end.
        const delay = Math.min(3_000 * 2 ** (failureCount - 1), 30_000);
        retryTimer = setTimeout(fetchLevels, delay);
      }
    }

    fetchLevels();
    const timer = setInterval(fetchLevels, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [activeSymbol, scheduleDraw]);

  // ── Replay: recompute locally from the truncated candle window ───────────
  // Aggregates the loaded intraday candles by UTC day instead of the backend's
  // real 1d klines — works for intervals that pack multiple bars into a day
  // (1m through 12h/1d); a single 3d/1w/1M bar spans multiple days, so this
  // degrades on those timeframes.
  useEffect(() => {
    if (replayActive && replayCursorTime != null) {
      const candles = useMarketStore.getState().candles;
      const last = [...candles].reverse().find((c) => c.t <= replayCursorTime);
      dataRef.current = last
        ? computeLevelsFromIntraday(candles, decimalsForPrice(last.c), replayCursorTime)
        : null;
      scheduleDraw();
    } else if (wasReplayActiveRef.current) {
      // Just exited — refresh from the live endpoint immediately instead of
      // waiting up to POLL_MS for the background poll to catch up.
      api.getLevels(activeSymbol)
        .then((data) => { dataRef.current = data; scheduleDraw(); })
        .catch(() => { /* keep last-known levels */ });
    }
    wasReplayActiveRef.current = replayActive;
  }, [replayActive, replayCursorTime, activeSymbol, scheduleDraw]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ background: 'transparent' }} />
      {unavailable && (
        <div className="absolute bottom-16 right-3 z-10 select-none text-[10px] text-[var(--text-muted)] bg-[var(--bg-panel)]/80 px-2 py-0.5 rounded">
          Levels unavailable
        </div>
      )}
    </div>
  );
}
