import { useChartStore, type ChartType } from '../../store/chartStore';
import { useMarketStore, ALL_INTERVALS } from '../../store/marketStore';
import { TimeframeDropdown } from '../UI/TimeframeDropdown';
import { IndicatorsDropdown, INDICATOR_ITEMS } from '../UI/IndicatorsDropdown';
import { useIndicatorStore } from '../../store/indicatorStore';
import { ReplayControls } from './ReplayControls';

function CandlesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="7" y1="3" x2="7" y2="21" />
      <rect x="4" y="7" width="6" height="9" rx="1" fill="currentColor" />
      <line x1="17" y1="3" x2="17" y2="21" />
      <rect x="14" y="10" width="6" height="7" rx="1" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 14 21 6" />
    </svg>
  );
}

const CHART_TYPES: { key: ChartType; label: string; Icon: () => JSX.Element }[] = [
  { key: 'candle', label: 'Candlesticks', Icon: CandlesIcon },
  { key: 'line',   label: 'Line',         Icon: LineIcon    },
];

function ChartTypeToggle() {
  const chartType    = useChartStore((s) => s.chartType);
  const setChartType = useChartStore((s) => s.setChartType);

  return (
    <div className="flex items-center rounded border border-[var(--border-color)] overflow-hidden">
      {CHART_TYPES.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => setChartType(key)}
          title={label}
          aria-pressed={chartType === key}
          className={`w-7 h-6 flex items-center justify-center transition-colors ${
            chartType === key
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}

// Quick-access pills for the intervals starred in the Timeframe dropdown,
// ordered by duration (ALL_INTERVALS) rather than the order they were starred.
function FavoriteIntervalButtons() {
  const favoriteIntervals = useMarketStore((s) => s.favoriteIntervals);
  const activeInterval    = useMarketStore((s) => s.activeInterval);
  const setActiveInterval = useMarketStore((s) => s.setActiveInterval);

  if (favoriteIntervals.length === 0) return null;
  const sorted = ALL_INTERVALS.filter((iv) => favoriteIntervals.includes(iv));

  return (
    <div className="flex items-center gap-0.5">
      {sorted.map((iv) => (
        <button
          key={iv}
          onClick={() => setActiveInterval(iv)}
          aria-pressed={activeInterval === iv}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            activeInterval === iv
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          {iv}
        </button>
      ))}
    </div>
  );
}

// Quick-access pills for the indicators starred in the Indicators dropdown,
// in menu order (INDICATOR_ITEMS). Each pill does exactly what its menu row
// does: overlays toggle independently, panel pills swap the single sub-panel.
function FavoriteIndicatorButtons() {
  const favoriteIndicators = useIndicatorStore((s) => s.favoriteIndicators);
  const activeIndicators   = useIndicatorStore((s) => s.activeIndicators);
  const activeSubPanel     = useIndicatorStore((s) => s.activeSubPanel);
  const toggleIndicator    = useIndicatorStore((s) => s.toggleIndicator);
  const toggleSubPanel     = useIndicatorStore((s) => s.toggleSubPanel);

  if (favoriteIndicators.length === 0) return null;
  const sorted = INDICATOR_ITEMS.filter((item) => favoriteIndicators.includes(item.key));

  return (
    <div className="flex items-center gap-0.5">
      {sorted.map((item) => {
        const active = item.kind === 'panel'
          ? activeSubPanel === item.key
          : activeIndicators.has(item.key);
        return (
          <button
            key={item.key}
            onClick={() => (item.kind === 'panel' ? toggleSubPanel(item.key) : toggleIndicator(item.key))}
            aria-pressed={active}
            title={item.label}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              active
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {item.short}
          </button>
        );
      })}
    </div>
  );
}

export function ChartToolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
      <TimeframeDropdown />
      <FavoriteIntervalButtons />
      <ChartTypeToggle />
      <IndicatorsDropdown />
      <FavoriteIndicatorButtons />

      <ReplayControls />
    </div>
  );
}
