/**
 * EMAOverlay — four exponential moving averages (20/50/100/200) drawn as real
 * lightweight-charts line series, modelled on VWAPOverlay.
 *
 * Unlike VWAP there's no backend endpoint: every EMA is computed client-side
 * from marketStore's candles (utils/klineAnalytics.computeEMA), so there's no
 * fetch or poll — the lines simply recompute whenever the candles change.
 *
 * Periods and per-line color/width/visibility come from indicatorConfigStore:
 * a period edit recomputes the data, a style edit only re-styles the series.
 */

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, LineWidth } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { toChartTime } from '../../utils/chartTime';
import { decimalsForPrice } from '../../utils/priceFormat';
import { computeEMA } from '../../utils/klineAnalytics';
import { useIndicatorConfigStore } from '../../store/indicatorConfigStore';

export interface EMAOverlayProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function EMAOverlay({ sharedChartRef }: EMAOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const cfg = useIndicatorConfigStore((s) => s.configs.ema);
  // Latest value per line (null = not enough candles for that period yet).
  const [current, setCurrent]   = useState<(number | null)[]>(() => cfg.periods.map(() => null));
  const [decimals, setDecimals] = useState(2);

  const candles          = useMarketStore((s) => s.candles);
  const replayActive     = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);

  // ── Line series lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;

    // Read the config imperatively: edits restyle/recompute the existing series
    // in the effects below rather than recreating them.
    const { lines } = useIndicatorConfigStore.getState().configs.ema;
    const series = lines.map((line) =>
      chart.addLineSeries({
        color: line.color,
        lineWidth: line.width as LineWidth,
        visible: line.visible,
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
  // and whenever the periods are edited.
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

    const latest = cfg.periods.map((period, i) => {
      const points = computeEMA(visible, period);
      series[i].setData(points.map((p) => ({ time: toChartTime(p.time), value: p.value })));
      series[i].applyOptions({
        priceFormat: { type: 'price', precision: dec, minMove: Math.pow(10, -dec) },
      });
      return points.at(-1)?.value ?? null;
    });

    setDecimals(dec);
    setCurrent(latest);
  }, [candles, replayActive, replayCursorTime, cfg.periods]);

  // ── Re-style on color/width/visibility edits (no recompute) ───────────────
  useEffect(() => {
    seriesRef.current.forEach((s, i) => {
      const line = cfg.lines[i];
      if (line) s.applyOptions({ color: line.color, lineWidth: line.width as LineWidth, visible: line.visible });
    });
  }, [cfg.lines]);

  // Index is the stable identity here — two lines may share a period.
  const rows = cfg.periods
    .map((period, i) => ({ i, period, color: cfg.lines[i].color, visible: cfg.lines[i].visible, value: current[i] }))
    .filter((r) => r.visible && r.value != null);
  if (rows.length === 0) return null;

  // Offset below VWAPOverlay's legend row (top-8) so the two never overlap.
  return (
    <div className="absolute top-14 left-3 z-10 flex flex-col gap-0.5 pointer-events-none select-none text-xs font-mono">
      {rows.map(({ i, period, color, value }) => (
        <div key={i} className="flex items-center gap-1.5">
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
