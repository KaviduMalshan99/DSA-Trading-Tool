/**
 * BollingerOverlay — Bollinger Bands (SMA middle, ±kσ upper/lower) drawn as
 * three lightweight-charts line series, modelled on EMAOverlay.
 *
 * Computed client-side from marketStore's candles
 * (utils/klineAnalytics.computeBollinger) — no fetch or poll; the bands simply
 * recompute whenever the candles change.
 *
 * Period/multiplier and per-line color/width/visibility come from
 * indicatorConfigStore: a param edit recomputes, a style edit only re-styles.
 */

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, LineWidth } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { toChartTime } from '../../utils/chartTime';
import { decimalsForPrice } from '../../utils/priceFormat';
import { computeBollinger, type BollingerPoint } from '../../utils/klineAnalytics';
import { useIndicatorConfigStore } from '../../store/indicatorConfigStore';

// Series order — matches configs.bollinger.lines: middle, upper, lower.
const BB_KEYS = ['middle', 'upper', 'lower'] as const satisfies readonly (keyof Omit<BollingerPoint, 'time'>)[];

// Legend lists upper, middle, lower (price order) — indices into BB_KEYS.
const LEGEND_ORDER = [1, 0, 2] as const;

export interface BollingerOverlayProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function BollingerOverlay({ sharedChartRef }: BollingerOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const cfg = useIndicatorConfigStore((s) => s.configs.bollinger);
  // Latest band values (null = fewer than `period` candles so far).
  const [current, setCurrent]   = useState<BollingerPoint | null>(null);
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
    const { lines } = useIndicatorConfigStore.getState().configs.bollinger;
    const series = lines.map((line) =>
      chart.addLineSeries({
        color: line.color,
        lineWidth: line.width as LineWidth,
        visible: line.visible,
        priceLineVisible: false,
        lastValueVisible: false,      // the legend below shows the values instead
        crosshairMarkerVisible: false,
        // Keep the bands from stretching the candles' autoscale.
        autoscaleInfoProvider: () => null,
      })
    );
    seriesRef.current = series;

    return () => {
      // Same guard as EMAOverlay: if TradingChart unmounted first its
      // chart.remove() already disposed these, and removeSeries would throw.
      if (sharedChartRef.current === chart) series.forEach((s) => chart.removeSeries(s));
      seriesRef.current = [];
    };
  }, [sharedChartRef]);

  // ── Recompute on every candles change (incl. the forming bar's ticks) ─────
  // and whenever period/multiplier are edited.
  useEffect(() => {
    const series = seriesRef.current;
    if (series.length === 0) return;

    // In replay, marketStore still holds the full window — slice at the cursor
    // so the bands don't draw past the replayed bar.
    const visible = replayActive && replayCursorTime != null
      ? candles.filter((c) => c.t <= replayCursorTime)
      : candles;

    const last = visible.at(-1);
    const dec = last ? decimalsForPrice(last.c) : 2;

    const points = computeBollinger(visible, cfg.period, cfg.mult);
    BB_KEYS.forEach((key, i) => {
      series[i].setData(points.map((p) => ({ time: toChartTime(p.time), value: p[key] })));
      series[i].applyOptions({
        priceFormat: { type: 'price', precision: dec, minMove: Math.pow(10, -dec) },
      });
    });

    setDecimals(dec);
    setCurrent(points.at(-1) ?? null);
  }, [candles, replayActive, replayCursorTime, cfg.period, cfg.mult]);

  // ── Re-style on color/width/visibility edits (no recompute) ───────────────
  useEffect(() => {
    seriesRef.current.forEach((s, i) => {
      const line = cfg.lines[i];
      if (line) s.applyOptions({ color: line.color, lineWidth: line.width as LineWidth, visible: line.visible });
    });
  }, [cfg.lines]);

  const rows = LEGEND_ORDER
    .map((i) => ({ key: BB_KEYS[i], line: cfg.lines[i] }))
    .filter(({ line }) => line?.visible);
  if (!current || rows.length === 0) return null;

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // The title takes the first visible line's color.
  const titleColor = rows[0].line.color;

  // Offset below EMAOverlay's legend (top-14, up to four rows) so they never overlap.
  return (
    <div className="absolute top-[8.5rem] left-3 z-10 flex items-center gap-1.5 pointer-events-none select-none text-xs font-mono">
      <span className="w-3 h-0.5 rounded" style={{ background: titleColor }} />
      <span className="font-semibold" style={{ color: titleColor }}>BB ({cfg.period},{cfg.mult})</span>
      {rows.map(({ key, line }) => (
        <span key={key} style={{ color: line.color }}>{fmt(current[key])}</span>
      ))}
    </div>
  );
}
