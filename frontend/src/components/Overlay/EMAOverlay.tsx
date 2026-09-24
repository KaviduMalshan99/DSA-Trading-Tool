/**
 * EMAOverlay — four exponential moving averages (20/50/100/200) drawn as real
 * lightweight-charts line series, modelled on VWAPOverlay.
 *
 * Unlike VWAP there's no backend endpoint: every EMA is computed client-side
 * from marketStore's candles (utils/klineAnalytics.computeEMA), so there's no
 * fetch or poll — the lines simply recompute whenever the candles change.
 */

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, LineWidth } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { toChartTime } from '../../utils/chartTime';
import { decimalsForPrice } from '../../utils/priceFormat';
import { computeEMA } from '../../utils/klineAnalytics';

const EMA_PERIODS = [20, 50, 100, 200] as const;
const EMA_COLORS  = ['#f5c542', '#ff7043', '#26c6da', '#ec407a'] as const;
const EMA_WIDTHS  = [1, 1, 1.5, 2] as const;

export interface EMAOverlayProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function EMAOverlay({ sharedChartRef }: EMAOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  // Latest value per period (null = not enough candles for that period yet).
  const [current, setCurrent]   = useState<(number | null)[]>(() => EMA_PERIODS.map(() => null));
  const [decimals, setDecimals] = useState(2);

  const candles          = useMarketStore((s) => s.candles);
  const replayActive     = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);

  // ── Line series lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;

    const series = EMA_PERIODS.map((_, i) =>
      chart.addLineSeries({
        color: EMA_COLORS[i],
        // LineWidth is typed 1-4, but the renderer draws fractional widths fine.
        lineWidth: EMA_WIDTHS[i] as LineWidth,
        priceLineVisible: false,
        lastValueVisible: false,      // the legend below shows the values instead
        crosshairMarkerVisible: false,
        // Keep far-off EMAs (e.g. EMA200) from stretching the candles' autoscale.
        autoscaleInfoProvider: () => null,
      })
    );
    seriesRef.current = series;

    return () => {
      // Same guard as VWAPOverlay: if TradingChart unmounted first its
      // chart.remove() already disposed these, and removeSeries would throw.
      if (sharedChartRef.current === chart) series.forEach((s) => chart.removeSeries(s));
      seriesRef.current = [];
    };
  }, [sharedChartRef]);

  // ── Recompute on every candles change (incl. the forming bar's ticks) ─────
  useEffect(() => {
    const series = seriesRef.current;
    if (series.length === 0) return;

    // In replay, marketStore still holds the full window — slice at the cursor
    // so the EMAs don't draw past the replayed bar.
    const visible = replayActive && replayCursorTime != null
      ? candles.filter((c) => c.t <= replayCursorTime)
      : candles;

    const last = visible.at(-1);
    const dec = last ? decimalsForPrice(last.c) : 2;

    const latest = EMA_PERIODS.map((period, i) => {
      const points = computeEMA(visible, period);
      series[i].setData(points.map((p) => ({ time: toChartTime(p.time), value: p.value })));
      series[i].applyOptions({
        priceFormat: { type: 'price', precision: dec, minMove: Math.pow(10, -dec) },
      });
      return points.at(-1)?.value ?? null;
    });

    setDecimals(dec);
    setCurrent(latest);
  }, [candles, replayActive, replayCursorTime]);

  const rows = EMA_PERIODS
    .map((period, i) => ({ period, color: EMA_COLORS[i], value: current[i] }))
    .filter((r) => r.value !== null);
  if (rows.length === 0) return null;

  // Offset below VWAPOverlay's legend row (top-8) so the two never overlap.
  return (
    <div className="absolute top-14 left-3 z-10 flex flex-col gap-0.5 pointer-events-none select-none text-xs font-mono">
      {rows.map(({ period, color, value }) => (
        <div key={period} className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded" style={{ background: color }} />
          <span className="font-semibold" style={{ color }}>EMA {period}</span>
          <span style={{ color }}>
            {value!.toLocaleString('en-US', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
