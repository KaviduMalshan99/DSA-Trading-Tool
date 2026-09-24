/**
 * BollingerOverlay — Bollinger Bands (SMA-20 middle, ±2σ upper/lower) drawn as
 * three lightweight-charts line series, modelled on EMAOverlay.
 *
 * Computed client-side from marketStore's candles
 * (utils/klineAnalytics.computeBollinger) — no fetch or poll; the bands simply
 * recompute whenever the candles change.
 */

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { toChartTime } from '../../utils/chartTime';
import { decimalsForPrice } from '../../utils/priceFormat';
import { computeBollinger, type BollingerPoint } from '../../utils/klineAnalytics';

const BB_PERIOD = 20;
const BB_MULT   = 2;

const MIDDLE_COLOR = '#f5c542';
const BAND_COLOR   = '#26c6da';

// Series order: middle, upper, lower.
const BB_LINES = [
  { key: 'middle', color: MIDDLE_COLOR },
  { key: 'upper',  color: BAND_COLOR },
  { key: 'lower',  color: BAND_COLOR },
] as const satisfies readonly { key: keyof Omit<BollingerPoint, 'time'>; color: string }[];

export interface BollingerOverlayProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function BollingerOverlay({ sharedChartRef }: BollingerOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  // Latest band values (null = fewer than BB_PERIOD candles so far).
  const [current, setCurrent]   = useState<BollingerPoint | null>(null);
  const [decimals, setDecimals] = useState(2);

  const candles          = useMarketStore((s) => s.candles);
  const replayActive     = useReplayStore((s) => s.isActive);
  const replayCursorTime = useReplayStore((s) => s.cursorTime);

  // ── Line series lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;

    const series = BB_LINES.map(({ color }) =>
      chart.addLineSeries({
        color,
        lineWidth: 1,
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

    const points = computeBollinger(visible, BB_PERIOD, BB_MULT);
    BB_LINES.forEach(({ key }, i) => {
      series[i].setData(points.map((p) => ({ time: toChartTime(p.time), value: p[key] })));
      series[i].applyOptions({
        priceFormat: { type: 'price', precision: dec, minMove: Math.pow(10, -dec) },
      });
    });

    setDecimals(dec);
    setCurrent(points.at(-1) ?? null);
  }, [candles, replayActive, replayCursorTime]);

  if (!current) return null;

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  // Offset below EMAOverlay's legend (top-14, up to four rows) so they never overlap.
  return (
    <div className="absolute top-[8.5rem] left-3 z-10 flex items-center gap-1.5 pointer-events-none select-none text-xs font-mono">
      <span className="w-3 h-0.5 rounded" style={{ background: BAND_COLOR }} />
      <span className="font-semibold" style={{ color: BAND_COLOR }}>BB ({BB_PERIOD},{BB_MULT})</span>
      <span style={{ color: BAND_COLOR }}>{fmt(current.upper)}</span>
      <span style={{ color: MIDDLE_COLOR }}>{fmt(current.middle)}</span>
      <span style={{ color: BAND_COLOR }}>{fmt(current.lower)}</span>
    </div>
  );
}
