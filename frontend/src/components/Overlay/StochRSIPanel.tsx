/**
 * StochRSIPanel — Stochastic RSI (14,14,3,3) in its own chart below the main
 * chart, the second single-slot sub-panel indicator (indicatorStore.activeSubPanel).
 *
 * A copy of RSIPanel's pattern (chart instance, index-based one-way sync,
 * 0-100 pinned scale, axis-width match, replay filter) with two line series,
 * %K and %D, computed client-side by utils/klineAnalytics.computeStochRSI.
 */

import { useEffect, useRef, useState } from 'react';
import {
  createChart, LineStyle,
  type IChartApi, type IPriceLine, type ISeriesApi, type LineWidth, type LogicalRange,
} from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { useThemeStore } from '../../store/themeStore';
import { toChartTime } from '../../utils/chartTime';
import { computeStochRSI, type RSIPoint } from '../../utils/klineAnalytics';
import { subChartThemeOptions } from './DeltaPanel';
import { AXIS_MIN_WIDTH, refLineColors } from './RSIPanel';

const RSI_LEN   = 14;
const STOCH_LEN = 14;
const K_SMOOTH  = 3;
const D_SMOOTH  = 3;
const K_COLOR   = '#2962ff';
const D_COLOR   = '#ff6d00';

interface StochRSIPanelProps {
  /** Ref to the main candlestick chart — this panel follows its time scale. */
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function StochRSIPanel({ sharedChartRef }: StochRSIPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const kSeriesRef   = useRef<ISeriesApi<'Line'> | null>(null);
  const dSeriesRef   = useRef<ISeriesApi<'Line'> | null>(null);
  const bandLinesRef = useRef<IPriceLine[]>([]);   // 80 / 20
  const midLineRef   = useRef<IPriceLine | null>(null);  // 50

  const [current, setCurrent] = useState<{ k: number; d: number | null } | null>(null);

  const candles          = useMarketStore((s) => s.candles);
  const theme            = useThemeStore((s) => s.theme);
  const replayActive     = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);

  // Same as RSIPanel: keep this panel's price axis as wide as the main chart's
  // so the two plot areas (and their bars) line up vertically.
  const matchAxisWidth = () => {
    const main  = sharedChartRef.current;
    const chart = chartRef.current;
    if (!main || !chart) return;
    const w = main.priceScale('right').width();
    chart.priceScale('right').applyOptions({ minimumWidth: Math.max(w, AXIS_MIN_WIDTH) });
  };

  // ── Chart initialisation + time-scale sync ────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const themeOpts = subChartThemeOptions(theme);
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
        minimumWidth: AXIS_MIN_WIDTH,
      },
      timeScale: {
        borderColor: themeOpts.timeScale.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      // One-way sync (see below) — user drag/zoom here would desync the panel.
      handleScroll: false,
      handleScale: false,
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const lineSeries = (color: string) => chart.addLineSeries({
      color,
      // LineWidth is typed 1-4, but the renderer draws fractional widths fine.
      lineWidth: 1.5 as LineWidth,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      // Pin the scale to the oscillator's full 0-100 range.
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    const kSeries = lineSeries(K_COLOR);
    const dSeries = lineSeries(D_COLOR);

    // Price lines survive setData, so the reference levels are created once —
    // on %K only, so they aren't drawn twice.
    const colors = refLineColors(theme);
    const refLine = (price: number, color: string, lineStyle: LineStyle) =>
      kSeries.createPriceLine({
        price, color, lineWidth: 1, lineStyle, axisLabelVisible: false, title: '',
      });
    bandLinesRef.current = [
      refLine(80, colors.band, LineStyle.Dashed),
      refLine(20, colors.band, LineStyle.Dashed),
    ];
    midLineRef.current = refLine(50, colors.mid, LineStyle.Dotted);

    chartRef.current   = chart;
    kSeriesRef.current = kSeries;
    dSeriesRef.current = dSeries;

    // One-directional sync by logical (bar index) range, as in RSIPanel: the
    // data effect pads both series to the candle count, so index N is the same
    // bar on both charts.
    const mainChart = sharedChartRef.current;

    const onMainRange = (range: LogicalRange | null) => {
      if (!range) return;
      chart.timeScale().setVisibleLogicalRange(range);
      matchAxisWidth();
    };

    if (mainChart) {
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(onMainRange);
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
      // If TradingChart unmounted first its chart.remove() already disposed
      // the main chart — don't touch it (same guard as RSIPanel).
      if (mainChart && sharedChartRef.current === mainChart) {
        mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(onMainRange);
      }
      chart.remove();
      chartRef.current   = null;
      kSeriesRef.current = null;
      dSeriesRef.current = null;
      bandLinesRef.current = [];
      midLineRef.current   = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedChartRef]);

  // Re-skin the native chart (grid/axis/crosshair + reference-line colors) on
  // theme change without recreating it, so data and range survive the switch.
  useEffect(() => {
    if (!chartRef.current) return;
    const themeOpts = subChartThemeOptions(theme);
    chartRef.current.applyOptions({
      layout: themeOpts.layout,
      grid: themeOpts.grid,
      crosshair: themeOpts.crosshair,
      leftPriceScale: { borderColor: themeOpts.leftPriceScale.borderColor },
      rightPriceScale: { borderColor: themeOpts.rightPriceScale.borderColor },
      timeScale: { borderColor: themeOpts.timeScale.borderColor },
    });
    const colors = refLineColors(theme);
    bandLinesRef.current.forEach((l) => l.applyOptions({ color: colors.band }));
    midLineRef.current?.applyOptions({ color: colors.mid });
  }, [theme]);

  // ── Recompute on every candles change (incl. the forming bar's ticks) ─────
  useEffect(() => {
    const kSeries = kSeriesRef.current;
    const dSeries = dSeriesRef.current;
    if (!kSeries || !dSeries) return;

    // In replay, marketStore still holds the full window — slice at the cursor
    // exactly as ReplayEngine does for the main chart, so bar counts match.
    const visible = replayActive && replayCursorTime != null
      ? candles.filter((c) => c.t <= replayCursorTime)
      : candles;

    const { k, d } = computeStochRSI(visible, RSI_LEN, STOCH_LEN, K_SMOOTH, D_SMOOTH);

    // %D starts dSmooth-1 bars after %K, so each series gets its own
    // whitespace padding — both end up exactly visible.length entries long,
    // which keeps them index-aligned with the main chart.
    const padded = (points: RSIPoint[]) => [
      ...visible.slice(0, visible.length - points.length).map((c) => ({ time: toChartTime(c.t) })),
      ...points.map((p) => ({ time: toChartTime(p.time), value: p.value })),
    ];
    kSeries.setData(padded(k));
    dSeries.setData(padded(d));

    // setData can refit this chart's own range — pull it back to the main one.
    const mainRange = sharedChartRef.current?.timeScale().getVisibleLogicalRange();
    if (mainRange) chartRef.current?.timeScale().setVisibleLogicalRange(mainRange);
    matchAxisWidth();

    setCurrent(k.length ? { k: k.at(-1)!.value, d: d.at(-1)?.value ?? null } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, replayActive, replayCursorTime, sharedChartRef]);

  return (
    <div className="relative w-full h-full">
      {/* Stat overlay */}
      <div className="absolute top-1 left-3 z-10 flex items-center gap-1.5 pointer-events-none select-none text-xs font-mono">
        <span className="text-[var(--text-muted)] font-sans">
          Stoch RSI ({RSI_LEN},{STOCH_LEN},{K_SMOOTH},{D_SMOOTH})
        </span>
        {current !== null && (
          <>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--text-muted)] font-sans">K</span>
            <span style={{ color: K_COLOR }}>{current.k.toFixed(2)}</span>
            {current.d !== null && (
              <>
                <span className="text-[var(--text-muted)] font-sans">D</span>
                <span style={{ color: D_COLOR }}>{current.d.toFixed(2)}</span>
              </>
            )}
          </>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
