import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useThemeStore, type Theme } from '../../store/themeStore';
import { useDeltaStore } from '../../store/deltaStore';
import { useReplayStore } from '../../store/replayStore';
import { toChartTime } from '../../utils/chartTime';

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

// Mirrors TradingChart.tsx's chartThemeOptions — native lightweight-charts
// canvas colors can't read CSS custom properties, so we hardcode the
// per-theme hex pairs that match the design tokens instead.
function deltaChartThemeOptions(theme: Theme) {
  const grid = theme === 'dark' ? '#161b22' : '#e0e3eb';
  const gridHorz = theme === 'dark' ? '#1a2030' : '#e0e3eb';
  const text = theme === 'dark' ? '#c9d1d9' : '#4b5563';
  const border = theme === 'dark' ? '#21262d' : '#d1d4dc';
  const crosshair = theme === 'dark' ? '#3b82f6' : '#2196f3';
  const crosshairLabelBg = theme === 'dark' ? '#1e3a5f' : '#d6e8fb';
  return {
    layout: {
      background: { color: 'transparent' },
      textColor: text,
    },
    grid: {
      vertLines: { color: grid },
      horzLines: { color: gridHorz },
    },
    crosshair: {
      vertLine: { color: crosshair, labelBackgroundColor: crosshairLabelBg },
      horzLine: { color: crosshair, labelBackgroundColor: crosshairLabelBg },
    },
    leftPriceScale: { borderColor: border },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border },
  };
}

interface DeltaBar {
  time: number;   // ms epoch
  buy_volume: number;
  sell_volume: number;
  delta: number;
  cvd: number;        // == cvd_close, kept for deltaStore/ExecutionDashboard
  cvd_open: number;
  cvd_high: number;
  cvd_low: number;
  cvd_close: number;
}

interface DeltaPanelProps {
  /** Ref to the main candlestick chart — used to sync both time scales. */
  sharedChartRef: React.RefObject<IChartApi | null>;
}

const toSec = toChartTime;

export function DeltaPanel({ sharedChartRef }: DeltaPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const histoRef     = useRef<ISeriesApi<'Histogram'> | null>(null);
  const cvdRef       = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // All bars seen so far (historical + live), chronological — the live WS
  // keeps this current in the background even while replay is active, same
  // as FootprintCanvas's barsRef, so exiting replay never needs a refetch.
  const barsRef       = useRef<DeltaBar[]>([]);

  const [currentDelta, setCurrentDelta] = useState<number | null>(null);
  const [currentCvd,   setCurrentCvd]   = useState<number | null>(null);

  const { activeSymbol, activeInterval } = useMarketStore();
  const theme = useThemeStore((s) => s.theme);
  const replayActive     = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);

  // ── Chart initialisation + time-scale sync ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const themeOpts = deltaChartThemeOptions(theme);
    const chart = createChart(containerRef.current, {
      layout: themeOpts.layout,
      grid: themeOpts.grid,
      crosshair: themeOpts.crosshair,
      leftPriceScale: {
        visible: false,
      },
      rightPriceScale: {
        borderColor: themeOpts.rightPriceScale.borderColor,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: themeOpts.timeScale.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // CVD candles are the primary element (client wants TradingView-style
    // CVD candlesticks so divergences vs. price are visible at a glance) —
    // dominant on the right scale, most of the pane height.
    const cvdCandles = chart.addCandlestickSeries({
      priceScaleId: 'right',
      upColor: '#26a641',
      downColor: '#f85149',
      borderUpColor: '#26a641',
      borderDownColor: '#f85149',
      wickUpColor: '#26a641',
      wickDownColor: '#f85149',
      priceFormat: { type: 'volume', precision: 2 },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0.22 } });

    // Per-bar delta histogram stays available but demoted to a thin strip
    // at the bottom of the same pane, on its own hidden scale so it can't
    // fight the CVD candles' scale.
    const histo = chart.addHistogramSeries({
      priceScaleId: 'deltaVol',
      color: '#26a641',
      priceFormat: { type: 'volume', precision: 2 },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('deltaVol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0.02 },
      visible: false,
    });

    chartRef.current = chart;
    histoRef.current = histo;
    cvdRef.current   = cvdCandles;

    // One-directional time-scale sync: this panel always follows the main
    // chart, never the reverse. A bidirectional sync (each side writing the
    // other's range on change) sounds symmetric but isn't safe here —
    // lightweight-charts dispatches range-change events asynchronously
    // (e.g. a ResizeObserver-driven relayout fires a beat after the
    // triggering setData/setVisibleLogicalRange call returns), so a
    // same-tick guard flag doesn't catch the echo. The two charts ended up
    // fighting over the range and settling on neither's intended value —
    // instead of "last 100 bars", the chart opened on an arbitrary ~228-bar
    // window. Only listening one way removes the feedback loop by
    // construction, at the cost of dragging this panel no longer panning
    // the main chart (dragging the main chart still pans both).
    //
    // Synced by *time*, not logical (index) range: the main chart and this
    // panel don't necessarily hold the same number of bars (this panel's
    // historical fetch excludes the still-forming candle, and the two
    // sockets can be a candle apart at the edges, even though both now pull
    // the same ~1000-candle window — see the /ws/delta historical fetch).
    // Index N on one chart isn't the same moment as index N on the other
    // once their lengths diverge, so copying a logical range mis-syncs and
    // looks like the panel "jumps to start." Time is the one axis both
    // charts genuinely share.
    const mainChart = sharedChartRef.current;

    const onMainRange = (range: { from: Time; to: Time } | null) => {
      if (!range) return;
      chart.timeScale().setVisibleRange(range);
    };

    if (mainChart) {
      mainChart.timeScale().subscribeVisibleTimeRangeChange(onMainRange);
    }

    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width:  containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (mainChart) {
        mainChart.timeScale().unsubscribeVisibleTimeRangeChange(onMainRange);
      }
      chart.remove();
      chartRef.current = null;
      histoRef.current = null;
      cvdRef.current   = null;
    };
  }, [sharedChartRef]);

  // Re-skin the native chart (grid/axis/crosshair colors) on theme change without
  // recreating the chart, so zoom/pan state and data survive the switch.
  useEffect(() => {
    if (!chartRef.current) return;
    const themeOpts = deltaChartThemeOptions(theme);
    chartRef.current.applyOptions({
      layout: themeOpts.layout,
      grid: themeOpts.grid,
      crosshair: themeOpts.crosshair,
      leftPriceScale: { borderColor: themeOpts.leftPriceScale.borderColor },
      rightPriceScale: { borderColor: themeOpts.rightPriceScale.borderColor },
      timeScale: { borderColor: themeOpts.timeScale.borderColor },
    });
  }, [theme]);

  // ── WebSocket: historical + live delta updates ─────────────────────────
  useEffect(() => {
    // Clear stale series data immediately on symbol/interval change
    barsRef.current = [];
    histoRef.current?.setData([]);
    cvdRef.current?.setData([]);
    setCurrentDelta(null);
    setCurrentCvd(null);
    useDeltaStore.getState().reset();

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/delta/${activeSymbol}/${activeInterval}`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            deltas?: DeltaBar[];
            delta?: DeltaBar;
          };

          if (msg.type === 'historical' && msg.deltas) {
            const bars = msg.deltas;
            barsRef.current = bars;

            // Don't paint over the replay-truncated view — the dedicated
            // replay effect below owns the series while replay is active;
            // barsRef is already updated above so it'll pick this up.
            if (useReplayStore.getState().isActive) return;

            // setData() on a fresh series auto-fits this chart's own visible
            // range to everything just loaded. Since the sync with the main
            // chart is one-directional (see the init effect), that auto-fit
            // can't leak out and corrupt the main chart's range — but it
            // does leave this panel showing the wrong window until the user
            // next pans the main chart, so pull it back into alignment with
            // whatever range the main chart currently has right away.
            histoRef.current?.setData(
              bars.map((b) => ({
                time:  toSec(b.time),
                value: b.delta,
                color: b.delta >= 0 ? '#26a64180' : '#f8514980',
              }))
            );

            cvdRef.current?.setData(
              bars.map((b) => ({
                time:  toSec(b.time),
                open:  b.cvd_open,
                high:  b.cvd_high,
                low:   b.cvd_low,
                close: b.cvd_close,
              }))
            );

            const mainRange = sharedChartRef.current?.timeScale().getVisibleRange();
            if (mainRange) chartRef.current?.timeScale().setVisibleRange(mainRange);

            const last = bars.at(-1);
            if (last) {
              setCurrentDelta(last.delta);
              setCurrentCvd(last.cvd);
            }
            useDeltaStore.getState().setFromBars(bars);
          } else if (msg.type === 'update' && msg.delta) {
            const b = msg.delta;

            // Keep the background buffer current regardless of replay, same
            // as marketStore.appendCandle during Layer 1 — exiting replay
            // then needs no refetch, just a redraw from barsRef.
            const lastBuffered = barsRef.current.at(-1);
            if (lastBuffered && lastBuffered.time === b.time) {
              barsRef.current = [...barsRef.current.slice(0, -1), b];
            } else {
              // Capped the same way marketStore caps candles — an unbounded
              // live session would otherwise grow this forever.
              barsRef.current = [...barsRef.current, b].slice(-2000);
            }

            // Don't paint this live tick onto the chart while replay is
            // active — mirrors TradingChart's own live-update guard.
            if (useReplayStore.getState().isActive) return;

            histoRef.current?.update({
              time:  toSec(b.time),
              value: b.delta,
              color: b.delta >= 0 ? '#26a64180' : '#f8514980',
            });

            cvdRef.current?.update({
              time:  toSec(b.time),
              open:  b.cvd_open,
              high:  b.cvd_high,
              low:   b.cvd_low,
              close: b.cvd_close,
            });

            setCurrentDelta(b.delta);
            setCurrentCvd(b.cvd);
            useDeltaStore.getState().setDelta(b.delta, b.cvd);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!stopped) reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [activeSymbol, activeInterval, sharedChartRef]);

  // ── Replay: draw from the truncated (or, on exit, full) buffer ───────────
  // barsRef is always current — the live WS above keeps appending to it in
  // the background regardless of replay — so this never needs a refetch,
  // just a redraw: filtered while active, the full buffer once inactive.
  useEffect(() => {
    const bars = replayActive && replayCursorTime != null
      ? barsRef.current.filter((b) => b.time <= replayCursorTime)
      : barsRef.current;

    histoRef.current?.setData(
      bars.map((b) => ({
        time:  toSec(b.time),
        value: b.delta,
        color: b.delta >= 0 ? '#26a64180' : '#f8514980',
      }))
    );
    cvdRef.current?.setData(
      bars.map((b) => ({
        time:  toSec(b.time),
        open:  b.cvd_open,
        high:  b.cvd_high,
        low:   b.cvd_low,
        close: b.cvd_close,
      }))
    );

    const last = bars.at(-1);
    setCurrentDelta(last?.delta ?? null);
    setCurrentCvd(last?.cvd ?? null);
    if (bars.length > 0) useDeltaStore.getState().setFromBars(bars);
  }, [replayActive, replayCursorTime]);

  const fmtNum = (n: number) =>
    (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="relative w-full h-full">
      {/* Stat overlay */}
      <div className="absolute top-1 left-3 z-10 flex items-center gap-3 pointer-events-none select-none text-xs font-mono">
        <span className="text-[var(--text-muted)] font-sans">Δ Delta</span>
        {currentDelta !== null && (
          <span className={currentDelta >= 0 ? 'text-[#26a641]' : 'text-[#f85149]'}>
            {fmtNum(currentDelta)}
          </span>
        )}
        <span className="text-[var(--text-muted)] font-sans ml-1">CVD</span>
        {currentCvd !== null && (
          <span className="text-[#f0b90b]">{fmtNum(currentCvd)}</span>
        )}
      </div>

      {/* Divider label */}
      <div className="absolute top-1 right-3 z-10 text-[10px] text-[var(--text-muted)] select-none pointer-events-none font-sans">
        {activeSymbol} · {activeInterval}
      </div>

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
