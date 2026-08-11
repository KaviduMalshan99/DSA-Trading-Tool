/**
 * VWAPOverlay — session VWAP for the current UTC day, drawn as a real
 * lightweight-charts line series rather than a canvas overlay.
 *
 * Unlike LevelsOverlay (horizontal lines at fixed prices, which canvas draws
 * more directly), VWAP is a time-series line: handing it to the library means
 * it gets time-axis alignment, clipping, and price-scale autoscaling for free
 * and stays glued to the candles through any zoom/pan.
 */

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { api } from '../../services/api';
import { toChartTime } from '../../utils/chartTime';

const VWAP_COLOR = '#ab47bc'; // distinct from the levels palette (grey/orange/cyan)
const POLL_MS = 30_000;       // keeps the still-forming candle's VWAP fresh between bars

export interface VWAPOverlayProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
}

export function VWAPOverlay({ sharedChartRef }: VWAPOverlayProps) {
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [current, setCurrent]   = useState<number | null>(null);
  const [decimals, setDecimals] = useState(2);

  const { activeSymbol, activeInterval } = useMarketStore();

  // Only changes when a *new* bar opens: appendCandle replaces the last candle
  // in place while it's still forming, so ticks within a bar leave `t` alone
  // and don't re-trigger the fetch below.
  const lastCandleTime = useMarketStore((s) => s.candles.at(-1)?.t ?? null);

  // ── Line series lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    const chart = sharedChartRef.current;
    if (!chart) return;

    const series = chart.addLineSeries({
      color: VWAP_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,      // the badge below shows the value instead
      crosshairMarkerVisible: false,
    });
    seriesRef.current = series;

    return () => {
      // Only remove the series if the chart is still the live one. If
      // TradingChart unmounted first it already called chart.remove(), which
      // disposes every series — calling removeSeries on that would throw.
      if (sharedChartRef.current === chart) chart.removeSeries(series);
      seriesRef.current = null;
    };
  }, [sharedChartRef]);

  // ── Fetch the session series (refetch on new bar + poll intra-bar) ────────
  useEffect(() => {
    let stopped = false;
    seriesRef.current?.setData([]); // drop the previous symbol/interval immediately
    setCurrent(null);

    async function fetchVWAP() {
      try {
        const data = await api.getSessionVWAP(activeSymbol, activeInterval);
        if (stopped || !seriesRef.current) return;
        seriesRef.current.setData(
          data.points.map((p) => ({ time: toChartTime(p.time), value: p.vwap }))
        );
        seriesRef.current.applyOptions({
          priceFormat: {
            type: 'price',
            precision: data.decimals,
            minMove: Math.pow(10, -data.decimals),
          },
        });
        setDecimals(data.decimals);
        setCurrent(data.current);
      } catch {
        // No session data yet, or a timeframe of 1d+ where a UTC-day session
        // has nothing to accumulate across — leave the line clear.
        if (!stopped) setCurrent(null);
      }
    }

    fetchVWAP();
    const timer = setInterval(fetchVWAP, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeSymbol, activeInterval, lastCandleTime]);

  if (current === null) return null;

  // Sits just below TradingChart's own symbol/price legend (top-2), using the
  // backend's tick-size-derived decimals so sub-cent coins don't read "0.00".
  return (
    <div className="absolute top-8 left-3 z-10 flex items-center gap-1.5 pointer-events-none select-none text-xs font-mono">
      <span className="w-3 h-0.5 rounded" style={{ background: VWAP_COLOR }} />
      <span className="font-semibold" style={{ color: VWAP_COLOR }}>VWAP</span>
      <span style={{ color: VWAP_COLOR }}>
        {current.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </span>
    </div>
  );
}
