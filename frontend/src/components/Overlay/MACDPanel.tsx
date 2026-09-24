/**
 * MACDPanel — MACD (12,26,9) in its own chart below the main chart, the third
 * single-slot sub-panel indicator (indicatorStore.activeSubPanel).
 *
 * Same shell as RSIPanel/StochRSIPanel (chart instance, index-based one-way
 * sync, axis-width match, replay filter), but unbounded rather than 0-100:
 * a per-bar colored histogram plus MACD and signal lines on one normally
 * autoscaled right scale, around a single zero line. Computed client-side by
 * utils/klineAnalytics.computeMACD.
 */

import { useEffect, useRef, useState } from 'react';
import {
  createChart, LineStyle,
  type AutoscaleInfo, type IChartApi, type IPriceLine, type ISeriesApi, type LineWidth, type LogicalRange,
} from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { useThemeStore } from '../../store/themeStore';
import { toChartTime } from '../../utils/chartTime';
import { decimalsForPrice } from '../../utils/priceFormat';
import { computeMACD, type EMAPoint } from '../../utils/klineAnalytics';
import { subChartThemeOptions } from './DeltaPanel';
import { AXIS_MIN_WIDTH, refLineColors } from './RSIPanel';

const FAST         = 12;
const SLOW         = 26;
const SIGNAL       = 9;
const MACD_COLOR   = '#2962ff';
const SIGNAL_COLOR = '#ff6d00';
// Histogram: strong color while the bar grows away from zero, pale while it
// shrinks back toward it.
const HIST_UP        = '#26a641';
const HIST_UP_FADE   = '#26a64166';
const HIST_DOWN      = '#f85149';
const HIST_DOWN_FADE = '#f8514966';

interface MACDPanelProps {
  /** Ref to the main candlestick chart — this panel follows its time scale. */
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function MACDPanel({ sharedChartRef }: MACDPanelProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const histSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sigSeriesRef  = useRef<ISeriesApi<'Line'> | null>(null);
  const zeroLineRef   = useRef<IPriceLine | null>(null);
  // Precision last applied to the three series' priceFormat — MACD values are
  // sized off their own magnitude (not price), and only re-applied on change.
  const appliedDecimalsRef = useRef<number | null>(null);

  const [current, setCurrent] = useState<
    { macd: number; signal: number | null; hist: number | null; decimals: number } | null
  >(null);

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

    // Added first so the two lines draw on top of the bars. All three share
    // the default right scale, which autoscales normally (no pinned range).
    const histSeries = chart.addHistogramSeries({
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const lineSeries = (color: string) => chart.addLineSeries({
      color,
      // LineWidth is typed 1-4, but the renderer draws fractional widths fine.
      lineWidth: 1.5 as LineWidth,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    const macdSeries = lineSeries(MACD_COLOR);
    const sigSeries  = lineSeries(SIGNAL_COLOR);

    // Widen the normal autoscale to always include 0, so the zero line stays
    // on screen through a long one-sided trend. The scale merges every
    // series' range, so doing it on one series is enough.
    macdSeries.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const res = original();
        if (!res?.priceRange) return res;
        return {
          ...res,
          priceRange: {
            minValue: Math.min(res.priceRange.minValue, 0),
            maxValue: Math.max(res.priceRange.maxValue, 0),
          },
        };
      },
    });

    // Price lines survive setData, so the zero line is created once — on the
    // MACD line only, so it isn't drawn more than once.
    zeroLineRef.current = macdSeries.createPriceLine({
      price: 0,
      color: refLineColors(theme).mid,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
      title: '',
    });

    chartRef.current      = chart;
    histSeriesRef.current = histSeries;
    macdSeriesRef.current = macdSeries;
    sigSeriesRef.current  = sigSeries;

    // One-directional sync by logical (bar index) range, as in RSIPanel: the
    // data effect pads every series to the candle count, so index N is the
    // same bar on both charts.
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
      chartRef.current      = null;
      histSeriesRef.current = null;
      macdSeriesRef.current = null;
      sigSeriesRef.current  = null;
      zeroLineRef.current   = null;
      appliedDecimalsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedChartRef]);

  // Re-skin the native chart (grid/axis/crosshair + zero-line color) on theme
  // change without recreating it, so data and range survive the switch.
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
    zeroLineRef.current?.applyOptions({ color: refLineColors(theme).mid });
  }, [theme]);

  // ── Recompute on every candles change (incl. the forming bar's ticks) ─────
  useEffect(() => {
    const histSeries = histSeriesRef.current;
    const macdSeries = macdSeriesRef.current;
    const sigSeries  = sigSeriesRef.current;
    if (!histSeries || !macdSeries || !sigSeries) return;

    // In replay, marketStore still holds the full window — slice at the cursor
    // exactly as ReplayEngine does for the main chart, so bar counts match.
    const visible = replayActive && replayCursorTime != null
      ? candles.filter((c) => c.t <= replayCursorTime)
      : candles;

    const { macd, signal, hist } = computeMACD(visible, FAST, SLOW, SIGNAL);

    // Size precision off MACD's own magnitude: price-based decimals give 2
    // for anything >= 1, which rounds e.g. XRP's ~±0.005 MACD to 0.00.
    let maxAbs = 0;
    for (const p of macd) maxAbs = Math.max(maxAbs, Math.abs(p.value));
    const dec = decimalsForPrice(maxAbs);
    if (dec !== appliedDecimalsRef.current) {
      appliedDecimalsRef.current = dec;
      const priceFormat = { type: 'price' as const, precision: dec, minMove: Math.pow(10, -dec) };
      histSeries.applyOptions({ priceFormat });
      macdSeries.applyOptions({ priceFormat });
      sigSeries.applyOptions({ priceFormat });
    }

    // MACD starts at index slow-1, signal/hist signal-1 bars later, so each
    // series gets its own whitespace padding — all end up exactly
    // visible.length entries long, keeping them index-aligned with the main chart.
    const warmUp = (count: number) =>
      visible.slice(0, visible.length - count).map((c) => ({ time: toChartTime(c.t) }));
    const padded = (points: EMAPoint[]) => [
      ...warmUp(points.length),
      ...points.map((p) => ({ time: toChartTime(p.time), value: p.value })),
    ];
    const histColor = (v: number, prev: number | undefined) => {
      const rising = prev === undefined || v >= prev;
      return v >= 0
        ? (rising ? HIST_UP : HIST_UP_FADE)
        : (rising ? HIST_DOWN_FADE : HIST_DOWN);
    };

    histSeries.setData([
      ...warmUp(hist.length),
      ...hist.map((p, i) => ({
        time:  toChartTime(p.time),
        value: p.value,
        color: histColor(p.value, hist[i - 1]?.value),
      })),
    ]);
    macdSeries.setData(padded(macd));
    sigSeries.setData(padded(signal));

    // setData can refit this chart's own range — pull it back to the main one.
    const mainRange = sharedChartRef.current?.timeScale().getVisibleLogicalRange();
    if (mainRange) chartRef.current?.timeScale().setVisibleLogicalRange(mainRange);
    matchAxisWidth();

    setCurrent(macd.length
      ? {
          macd: macd.at(-1)!.value,
          signal: signal.at(-1)?.value ?? null,
          hist: hist.at(-1)?.value ?? null,
          decimals: dec,
        }
      : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, replayActive, replayCursorTime, sharedChartRef]);

  return (
    <div className="relative w-full h-full">
      {/* Stat overlay */}
      <div className="absolute top-1 left-3 z-10 flex items-center gap-1.5 pointer-events-none select-none text-xs font-mono">
        <span className="text-[var(--text-muted)] font-sans">
          MACD ({FAST},{SLOW},{SIGNAL})
        </span>
        {current !== null && (
          <>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--text-muted)] font-sans">MACD</span>
            <span style={{ color: MACD_COLOR }}>{current.macd.toFixed(current.decimals)}</span>
            {current.signal !== null && (
              <>
                <span className="text-[var(--text-muted)] font-sans">Signal</span>
                <span style={{ color: SIGNAL_COLOR }}>{current.signal.toFixed(current.decimals)}</span>
              </>
            )}
            {current.hist !== null && (
              <>
                <span className="text-[var(--text-muted)] font-sans">Hist</span>
                <span style={{ color: current.hist >= 0 ? HIST_UP : HIST_DOWN }}>
                  {current.hist.toFixed(current.decimals)}
                </span>
              </>
            )}
          </>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
