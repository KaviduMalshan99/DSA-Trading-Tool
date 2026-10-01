/**
 * RSIPanel — Wilder's RSI (14) in its own chart below the main chart, the
 * first of the single-slot sub-panel indicators (indicatorStore.activeSubPanel).
 *
 * Same chart-instance + one-way sync pattern as DeltaPanel, but no WebSocket:
 * like EMAOverlay, the RSI is computed client-side from marketStore's candles
 * (utils/klineAnalytics.computeRSI), so it recomputes whenever they change and
 * follows replay's cursor for free.
 */

import { useEffect, useRef, useState } from 'react';
import {
  createChart, LineStyle,
  type IChartApi, type IPriceLine, type ISeriesApi, type LineWidth, type LogicalRange,
} from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { useThemeStore, type Theme } from '../../store/themeStore';
import { toChartTime } from '../../utils/chartTime';
import { computeRSI, computeRSIMA, type RSIPoint } from '../../utils/klineAnalytics';
import type { Candle } from '../../types/market';
import { subChartThemeOptions } from './DeltaPanel';

const RSI_PERIOD    = 14;
const RSI_MA_PERIOD = 14;
const RSI_COLOR     = '#7e57c2';
const RSI_MA_COLOR  = '#e3b341';
// Fills are faint enough to read on both themes, so they stay constant.
const FILL_OB   = 'rgba(38,166,154,0.25)';   // RSI beyond 70 / 30
const BAND_FILL = 'rgba(126,87,194,0.06)';   // 30-70 band
const CLEAR     = 'rgba(0,0,0,0)';

// Pin the scale to the oscillator's full 0-100 range instead of autoscaling
// to whatever is on screen. Shared by every series on the panel so none of
// them can stretch the scale and knock the others out of line.
const rsi01 = () => ({ priceRange: { minValue: 0, maxValue: 100 } });

// Baseline defaults are loud (3px line, axis label, crosshair dot) — the
// fill-only series turn all of that off.
const FILL_ONLY = {
  lineVisible: false,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
  autoscaleInfoProvider: rsi01,
} as const;

// Matches TradingChart's rightPriceScale.minimumWidth so both plot areas start
// at the same width; see matchAxisWidth for when the main axis grows past it.
export const AXIS_MIN_WIDTH = 72;

export function refLineColors(theme: Theme) {
  return theme === 'dark'
    ? { band: '#6e7681', mid: '#3d444d' }
    : { band: '#9ca3af', mid: '#d1d5db' };
}

// One entry per candle: whitespace (time-only) for the warm-up bars, then the
// points. Keeps every series index-aligned with the main chart, which the
// logical-range sync needs. `points` must end on the last candle.
function padded(visible: Candle[], points: RSIPoint[]) {
  const warmUp = visible.length - points.length;
  return [
    ...visible.slice(0, warmUp).map((c) => ({ time: toChartTime(c.t) })),
    ...points.map((p) => ({ time: toChartTime(p.time), value: p.value })),
  ];
}

interface RSIPanelProps {
  /** Ref to the main candlestick chart — this panel follows its time scale. */
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function RSIPanel({ sharedChartRef }: RSIPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Line'> | null>(null);
  const maRef        = useRef<ISeriesApi<'Line'> | null>(null);
  const bandRef      = useRef<ISeriesApi<'Baseline'> | null>(null);  // 30-70 fill
  const obFillRef    = useRef<ISeriesApi<'Baseline'> | null>(null);  // > 70 fill
  const osFillRef    = useRef<ISeriesApi<'Baseline'> | null>(null);  // < 30 fill
  const bandLinesRef = useRef<IPriceLine[]>([]);   // 70 / 30
  const midLineRef   = useRef<IPriceLine | null>(null);  // 50

  const [current, setCurrent]     = useState<number | null>(null);
  const [currentMA, setCurrentMA] = useState<number | null>(null);

  const candles          = useMarketStore((s) => s.candles);
  const theme            = useThemeStore((s) => s.theme);
  const replayActive     = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);

  // Keep this panel's price axis exactly as wide as the main chart's, so the
  // two plot areas — and therefore their bars — line up vertically. The
  // shared minimumWidth covers the usual case; this catches a main axis whose
  // labels (e.g. a 6-digit price) push it wider than that.
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
      // Sync is one-way (see below), so letting the user drag/zoom this panel
      // would just knock it out of step with the main chart until it next moved.
      handleScroll: false,
      handleScale: false,
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // Series draw in creation order, so fills go first and the RSI line last.
    // The band is a constant 70 over a 30 baseline: a filled 30-70 strip.
    const band = chart.addBaselineSeries({
      ...FILL_ONLY,
      baseValue: { type: 'price', price: 30 },
      topFillColor1: BAND_FILL, topFillColor2: BAND_FILL,
      bottomFillColor1: CLEAR,  bottomFillColor2: CLEAR,
    });
    // RSI itself against a 70 / 30 baseline, filling only the side beyond it.
    const obFill = chart.addBaselineSeries({
      ...FILL_ONLY,
      baseValue: { type: 'price', price: 70 },
      topFillColor1: FILL_OB,  topFillColor2: FILL_OB,
      bottomFillColor1: CLEAR, bottomFillColor2: CLEAR,
    });
    const osFill = chart.addBaselineSeries({
      ...FILL_ONLY,
      baseValue: { type: 'price', price: 30 },
      topFillColor1: CLEAR,      topFillColor2: CLEAR,
      bottomFillColor1: FILL_OB, bottomFillColor2: FILL_OB,
    });
    const ma = chart.addLineSeries({
      color: RSI_MA_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: rsi01,
    });

    const series = chart.addLineSeries({
      color: RSI_COLOR,
      // LineWidth is typed 1-4, but the renderer draws fractional widths fine.
      lineWidth: 1.5 as LineWidth,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      autoscaleInfoProvider: rsi01,
    });

    // Price lines survive setData, so the reference levels are created once.
    const colors = refLineColors(theme);
    const refLine = (price: number, color: string, lineStyle: LineStyle) =>
      series.createPriceLine({
        price, color, lineWidth: 1, lineStyle, axisLabelVisible: false, title: '',
      });
    bandLinesRef.current = [
      refLine(70, colors.band, LineStyle.Dashed),
      refLine(30, colors.band, LineStyle.Dashed),
    ];
    midLineRef.current = refLine(50, colors.mid, LineStyle.Dotted);

    chartRef.current  = chart;
    seriesRef.current = series;
    maRef.current     = ma;
    bandRef.current   = band;
    obFillRef.current = obFill;
    osFillRef.current = osFill;

    // One-directional sync, same reasoning as DeltaPanel's (a two-way sync
    // feeds back on itself). Unlike DeltaPanel this syncs by *logical* (bar
    // index) range: the RSI is computed from the very same candles the main
    // chart holds, and the data effect pads the warm-up with whitespace, so
    // index N is the same bar on both charts. That also carries over the
    // main chart's right-edge offset, which a time range can't express.
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
      // the main chart — don't touch it (same guard as EMAOverlay).
      if (mainChart && sharedChartRef.current === mainChart) {
        mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(onMainRange);
      }
      chart.remove();  // disposes every series on this chart
      chartRef.current  = null;
      seriesRef.current = null;
      maRef.current     = null;
      bandRef.current   = null;
      obFillRef.current = null;
      osFillRef.current = null;
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
    const series = seriesRef.current;
    const ma     = maRef.current;
    const band   = bandRef.current;
    const obFill = obFillRef.current;
    const osFill = osFillRef.current;
    if (!series || !ma || !band || !obFill || !osFill) return;

    // In replay, marketStore still holds the full window — slice at the cursor
    // exactly as ReplayEngine does for the main chart, so bar counts match.
    const visible = replayActive && replayCursorTime != null
      ? candles.filter((c) => c.t <= replayCursorTime)
      : candles;

    const points   = computeRSI(visible, RSI_PERIOD);
    const maPoints = computeRSIMA(visible, RSI_PERIOD, RSI_MA_PERIOD);
    // Every series gets exactly visible.length entries (see padded).
    const rsiData = padded(visible, points);

    // The band has no warm-up — it spans the whole history.
    band.setData(visible.map((c) => ({ time: toChartTime(c.t), value: 70 })));
    obFill.setData(rsiData);
    osFill.setData(rsiData);
    ma.setData(padded(visible, maPoints));
    series.setData(rsiData);

    // setData can refit this chart's own range — pull it back to the main one.
    const mainRange = sharedChartRef.current?.timeScale().getVisibleLogicalRange();
    if (mainRange) chartRef.current?.timeScale().setVisibleLogicalRange(mainRange);
    matchAxisWidth();

    setCurrent(points.at(-1)?.value ?? null);
    setCurrentMA(maPoints.at(-1)?.value ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, replayActive, replayCursorTime, sharedChartRef]);

  return (
    <div className="relative w-full h-full">
      {/* Stat overlay */}
      <div className="absolute top-1 left-3 z-10 flex items-center gap-1.5 pointer-events-none select-none text-xs font-mono">
        <span className="text-[var(--text-muted)] font-sans">RSI {RSI_PERIOD}</span>
        {current !== null && (
          <span style={{ color: RSI_COLOR }}>{current.toFixed(2)}</span>
        )}
        <span className="text-[var(--text-muted)] font-sans">· MA {RSI_MA_PERIOD}</span>
        {currentMA !== null && (
          <span style={{ color: RSI_MA_COLOR }}>{currentMA.toFixed(2)}</span>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
