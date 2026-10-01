import { useMarketStore } from '../../store/marketStore';
import { CHART_TZ_LABEL, CHART_TZ_CITY } from '../../utils/chartTime';

export function StatusBar() {
  const { activeSymbol, activeInterval, isLoading, candles } = useMarketStore();

  return (
    <footer className="flex items-center gap-4 px-4 py-1 bg-[var(--bg-panel)] border-t border-[var(--border-color)] text-xs text-[var(--text-muted)] select-none">
      <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
      <span>{activeSymbol}</span>
      <span>{activeInterval}</span>
      <span>{candles.length} candles</span>
      <span className="ml-auto" title="Chart timezone">{CHART_TZ_LABEL} · {CHART_TZ_CITY}</span>
      <span>DSA Trading Tool v1.0</span>
    </footer>
  );
}
