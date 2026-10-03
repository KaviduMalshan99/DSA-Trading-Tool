import { useEffect, useRef, useState } from 'react';
import { type IChartApi } from 'lightweight-charts';
import { useChartStore } from '../../store/chartStore';

interface PriceScaleButtonsProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
}

const ACCENT = '#2196F3';
// Used until the chart has laid out its axes.
const FALLBACK_SIZE = { width: 72, height: 26 };

/** No-op logical-range change so canvas overlays/drawings re-map prices. */
function nudgeRedraw(chart: IChartApi) {
  const ts = chart.timeScale();
  const r = ts.getVisibleLogicalRange();
  if (r) {
    ts.setVisibleLogicalRange({ from: r.from + 1e-6, to: r.to });
    ts.setVisibleLogicalRange(r);
  }
}

/**
 * TradingView-style "A" (auto-scale) / "L" (log scale) toggles, sitting in the
 * corner where the main chart's price axis meets its time axis.
 */
export function PriceScaleButtons({ sharedChartRef }: PriceScaleButtonsProps) {
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
      const chart = sharedChartRef.current;
      if (chart) setAuto(chart.priceScale('right').options().autoScale);
    };
    const measure = () => {
      const chart = sharedChartRef.current;
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
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      area.removeEventListener('pointerup', syncAuto, true);
      area.removeEventListener('dblclick', syncAuto, true);
    };
  }, [sharedChartRef]);

  const toggleAuto = () => {
    const chart = sharedChartRef.current;
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
      const chart = sharedChartRef.current;
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
      <button
        type="button"
        className={btnClass}
        style={{ color: logScale ? ACCENT : 'var(--text-muted)' }}
        title="Logarithmic scale"
        onClick={toggleLog}
      >
        L
      </button>
    </div>
  );
}
