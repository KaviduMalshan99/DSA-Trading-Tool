import { useEffect, useRef, useState } from 'react';
import { type IChartApi } from 'lightweight-charts';
import { useChartStore } from '../../store/chartStore';

interface PriceScaleButtonsProps {
  /** The chart whose right price scale these buttons drive (main chart or a sub-panel). */
  chartRef: React.RefObject<IChartApi | null>;
  /** The "L" toggle drives the main chart's store-backed log mode, so sub-panels omit it. */
  showLog?: boolean;
}

const ACCENT = '#2196F3';
// Used until the chart has laid out its axes.
const FALLBACK_SIZE = { width: 72, height: 26 };

// Every mounted button's re-check, so code that changes autoScale without an
// axis interaction (Reset chart / Alt+R) can refresh the "A" state directly.
const autoListeners = new Set<() => void>();
export function notifyPriceScaleReset() {
  autoListeners.forEach((fn) => fn());
}

/** No-op logical-range change so canvas overlays/drawings re-map prices. */
export function nudgeRedraw(chart: IChartApi) {
  const ts = chart.timeScale();
  const r = ts.getVisibleLogicalRange();
  if (r) {
    ts.setVisibleLogicalRange({ from: r.from + 1e-6, to: r.to });
    ts.setVisibleLogicalRange(r);
  }
}

/**
 * TradingView-style "A" (auto-scale) / "L" (log scale) toggles, sitting in the
 * corner where a chart's price axis meets its time axis. Mount it inside the
 * chart's positioned wrapper, once the chart in `chartRef` exists.
 */
export function PriceScaleButtons({ chartRef, showLog = true }: PriceScaleButtonsProps) {
  const logScale = useChartStore((s) => s.logScale);
  const setLogScale = useChartStore((s) => s.setLogScale);
  const [auto, setAuto] = useState(true);
  const [size, setSize] = useState(FALLBACK_SIZE);
  const rootRef = useRef<HTMLDivElement>(null);

  // Measure the axis corner, and keep the "A" state in sync with axis
  // interactions: dragging the price axis turns autoScale off, double-clicking
  // it turns it back on.
  useEffect(() => {
    const area = rootRef.current?.parentElement;
    if (!area) return;

    const syncAuto = () => {
      const chart = chartRef.current;
      if (chart) setAuto(chart.priceScale('right').options().autoScale);
    };
    const measure = () => {
      const chart = chartRef.current;
      if (!chart) return;
      const width = chart.priceScale('right').width();
      const height = chart.timeScale().height();
      setSize({
        width: width > 0 ? width : FALLBACK_SIZE.width,
        height: height > 0 ? height : FALLBACK_SIZE.height,
      });
    };

    measure();
    syncAuto();
    // The chart re-lays out its axes a frame after a resize, so measure on the
    // next frame rather than synchronously.
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    observer.observe(area);

    area.addEventListener('pointerup', syncAuto, true);
    area.addEventListener('dblclick', syncAuto, true);
    autoListeners.add(syncAuto);
    // Programmatic changes (Reset chart / Alt+R) end with a range nudge.
    const chart = chartRef.current;
    chart?.timeScale().subscribeVisibleLogicalRangeChange(syncAuto);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      // Skip if TradingChart already disposed it (same guard as the sub-panels).
      if (chart && chartRef.current === chart) {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncAuto);
      }
      area.removeEventListener('pointerup', syncAuto, true);
      area.removeEventListener('dblclick', syncAuto, true);
      autoListeners.delete(syncAuto);
    };
  }, [chartRef]);

  const toggleAuto = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const ps = chart.priceScale('right');
    ps.applyOptions({ autoScale: !ps.options().autoScale });
    nudgeRedraw(chart);
    setAuto(ps.options().autoScale);
  };

  const toggleLog = () => {
    setLogScale(!logScale);
    // TradingChart applies the mode in an effect; switching mode can re-enable
    // autoScale, so re-read it once that has run.
    setTimeout(() => {
      const chart = chartRef.current;
      if (chart) setAuto(chart.priceScale('right').options().autoScale);
    }, 0);
  };

  const btnClass =
    'w-5 h-5 flex items-center justify-center rounded text-[10px] font-semibold leading-none hover:bg-[var(--bg-hover)]';

  return (
    <div
      ref={rootRef}
      className="absolute right-0 bottom-0 z-[60] flex items-center justify-center gap-1 pointer-events-auto"
      style={{ width: size.width, height: size.height }}
    >
      <button
        type="button"
        className={btnClass}
        style={{ color: auto ? ACCENT : 'var(--text-muted)' }}
        title="Auto-scale (fit price range)"
        onClick={toggleAuto}
      >
        A
      </button>
      {showLog && (
        <button
          type="button"
          className={btnClass}
          style={{ color: logScale ? ACCENT : 'var(--text-muted)' }}
          title="Logarithmic scale"
          onClick={toggleLog}
        >
          L
        </button>
      )}
    </div>
  );
}
