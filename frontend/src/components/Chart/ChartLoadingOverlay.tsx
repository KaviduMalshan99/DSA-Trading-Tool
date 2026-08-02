import { useMarketStore } from '../../store/marketStore';

// candles is cleared to [] synchronously on both symbol and interval switch
// (see marketStore's setActiveSymbol/setActiveInterval), so "no candles yet"
// is a reliable proxy for "fetch in flight" without needing a separate flag.
export function ChartLoadingOverlay() {
  const hasCandles = useMarketStore((s) => s.candles.length > 0);
  if (hasCandles) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Loading...
      </div>
    </div>
  );
}
