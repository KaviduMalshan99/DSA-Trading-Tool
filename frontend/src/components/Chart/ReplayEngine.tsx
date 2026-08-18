/**
 * ReplayEngine — non-visual. Owns the three mechanics that make Replay mode
 * work without touching TradingChart's live WS/pagination logic:
 *
 *  1. Pick-a-bar: while armed (isPicking), listens for a native chart click
 *     and maps its bar time back to a loaded candle to become the replay
 *     start point.
 *  2. Play loop: while isPlaying, advances cursorTime one loaded bar at a
 *     time on a timer paced by `speed`, pausing itself once it catches up
 *     to the newest loaded candle.
 *  3. Series sync: whenever isActive/cursorTime changes, re-renders the
 *     candlestick series from marketStore's candles sliced at cursorTime
 *     (entering/exiting/backward steps use setData + restore the prior
 *     visible logical range, exactly like TradingChart's own scroll-back
 *     prepend does, so pan/zoom doesn't jump).
 *
 * Mounted once in ChartContainer, always-on (not gated by visibleOverlays),
 * right after TradingChart so sharedChartRef/sharedSeriesRef are already
 * populated by the time its effects run (same ordering other overlays rely on).
 */
import { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { toChartTime, CHART_TZ_OFFSET_SECONDS } from '../../utils/chartTime';
import type { Candle } from '../../types/market';

const BASE_MS_PER_BAR = 700; // interval at 1x; divided by speed for 0.5x/2x/4x

function toBar(c: Candle) {
  return { time: toChartTime(c.t), open: c.o, high: c.h, low: c.l, close: c.c };
}

export interface ReplayEngineProps {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export function ReplayEngine({ sharedChartRef, sharedSeriesRef }: ReplayEngineProps) {
  const isPicking   = useReplayStore((s) => s.isPicking);
  const isActive    = useReplayStore((s) => s.isActive);
  const isPlaying   = useReplayStore((s) => s.isPlaying);
  const speed       = useReplayStore((s) => s.speed);
  const cursorTime  = useReplayStore((s) => s.cursorTime);

  const wasActiveRef = useRef(false);

  // ── 1. Pick-a-bar: click-to-start ─────────────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;

    const handleClick = (param: MouseEventParams) => {
      if (!useReplayStore.getState().isPicking || param.time == null) return;
      const flooredSeconds = (param.time as number) - CHART_TZ_OFFSET_SECONDS;
      const candles = useMarketStore.getState().candles;
      const target =
        candles.find((c) => Math.floor(c.t / 1000) === flooredSeconds) ??
        [...candles].reverse().find((c) => Math.floor(c.t / 1000) <= flooredSeconds);
      if (!target) return;
      useReplayStore.getState().startReplay(target.t);
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [sharedChartRef, isPicking]);

  // ── 2. Play loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !isPlaying) return;
    const timer = setInterval(() => {
      const state = useReplayStore.getState();
      if (state.cursorTime == null) return;
      const candles = useMarketStore.getState().candles;
      const idx = candles.findIndex((c) => c.t === state.cursorTime);
      if (idx === -1 || idx >= candles.length - 1) {
        useReplayStore.getState().pause(); // caught up to the newest loaded bar
        return;
      }
      useReplayStore.getState().setCursorTime(candles[idx + 1].t);
    }, BASE_MS_PER_BAR / speed);
    return () => clearInterval(timer);
  }, [isActive, isPlaying, speed]);

  // ── 3. Series sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const series = sharedSeriesRef.current;
    const chart = sharedChartRef.current;
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!series || (!isActive && !wasActive)) return;

    const candles = useMarketStore.getState().candles;

    if (isActive && cursorTime != null) {
      const visible = candles.filter((c) => c.t <= cursorTime);
      if (!wasActive) {
        // Fresh entry — frame the last ~100 bars ending at the start point,
        // same framing TradingChart uses for a fresh historical load.
        series.setData(visible.map(toBar));
        const total = visible.length;
        chart?.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - 100), to: total - 1 + 5 });
      } else {
        // Stepping/playing — only the tail changes, so restore whatever the
        // view was right before this setData instead of letting it refit.
        const prevRange = chart?.timeScale().getVisibleLogicalRange() ?? null;
        series.setData(visible.map(toBar));
        if (prevRange) chart?.timeScale().setVisibleLogicalRange(prevRange);
      }
    } else {
      // Just exited replay — resync to the full live dataset and reframe,
      // same framing TradingChart uses for a fresh historical load.
      series.setData(candles.map(toBar));
      if (chart && candles.length > 0) {
        const total = candles.length;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - 100), to: total - 1 + 5 });
      }
    }
  }, [isActive, cursorTime, sharedSeriesRef, sharedChartRef]);

  return null;
}
