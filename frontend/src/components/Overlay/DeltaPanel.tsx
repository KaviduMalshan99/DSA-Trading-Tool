import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useThemeStore, type Theme } from '../../store/themeStore';

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
  cvd: number;
}

interface DeltaPanelProps {
  /** Ref to the main candlestick chart — used to sync both time scales. */
  sharedChartRef: React.RefObject<IChartApi | null>;
}

type LWTime = import('lightweight-charts').Time;

function toSec(ms: number): LWTime {
  return Math.floor(ms / 1000) as unknown as LWTime;
}

export function DeltaPanel({ sharedChartRef }: DeltaPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const histoRef     = useRef<ISeriesApi<'Histogram'> | null>(null);
  const cvdRef       = useRef<ISeriesApi<'Line'> | null>(null);

  const [currentDelta, setCurrentDelta] = useState<number | null>(null);
  const [currentCvd,   setCurrentCvd]   = useState<number | null>(null);

  const { activeSymbol, activeInterval } = useMarketStore();
  const theme = useThemeStore((s) => s.theme);

  // ── Chart initialisation + time-scale sync ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const themeOpts = deltaChartThemeOptions(theme);
    const chart = createChart(containerRef.current, {
      layout: themeOpts.layout,
      grid: themeOpts.grid,
      crosshair: themeOpts.crosshair,
      leftPriceScale: {
        visible: true,
        borderColor: themeOpts.leftPriceScale.borderColor,
        scaleMargins: { top: 0.05, bottom: 0.05 },
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

    // Delta histogram on the right price scale
    const histo = chart.addHistogramSeries({
      priceScaleId: 'right',
      color: '#26a641',
      priceFormat: { type: 'volume', precision: 2 },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    // CVD line on the left price scale
    const cvdLine = chart.addLineSeries({
      priceScaleId: 'left',
      color: '#f0b90b',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    histoRef.current = histo;
    cvdRef.current   = cvdLine;

    // Bidirectional time-scale sync with the main chart, cycle-guarded
    const mainChart = sharedChartRef.current;
    let syncing = false;

    const onMainRange = (range: { from: number; to: number } | null) => {
      if (syncing || !range) return;
      syncing = true;
      chart.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };

    const onDeltaRange = (range: { from: number; to: number } | null) => {
      if (syncing || !range || !sharedChartRef.current) return;
      syncing = true;
      sharedChartRef.current.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };

    if (mainChart) {
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(onMainRange);
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onDeltaRange);

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
        mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(onMainRange);
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
    histoRef.current?.setData([]);
    cvdRef.current?.setData([]);
    setCurrentDelta(null);
    setCurrentCvd(null);

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

            histoRef.current?.setData(
              bars.map((b) => ({
                time:  toSec(b.time),
                value: b.delta,
                color: b.delta >= 0 ? '#26a64180' : '#f8514980',
              }))
            );

            cvdRef.current?.setData(
              bars.map((b) => ({ time: toSec(b.time), value: b.cvd }))
            );

            // Align time scale with main chart after data loads
            const mainRange = sharedChartRef.current?.timeScale().getVisibleLogicalRange();
            if (mainRange) {
              chartRef.current?.timeScale().setVisibleLogicalRange(mainRange);
            }

            const last = bars.at(-1);
            if (last) {
              setCurrentDelta(last.delta);
              setCurrentCvd(last.cvd);
            }
          } else if (msg.type === 'update' && msg.delta) {
            const b = msg.delta;

            histoRef.current?.update({
              time:  toSec(b.time),
              value: b.delta,
              color: b.delta >= 0 ? '#26a64180' : '#f8514980',
            });

            cvdRef.current?.update({ time: toSec(b.time), value: b.cvd });

            setCurrentDelta(b.delta);
            setCurrentCvd(b.cvd);
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
