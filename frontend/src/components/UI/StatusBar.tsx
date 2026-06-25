import { useMarketStore } from '../../store/marketStore';

export function StatusBar() {
  const { activeSymbol, activeInterval, isLoading, candles } = useMarketStore();

  return (
    <footer className="flex items-center gap-4 px-4 py-1 bg-[#161b22] border-t border-[#30363d] text-xs text-gray-500 select-none">
      <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
      <span>{activeSymbol}</span>
      <span>{activeInterval}</span>
      <span>{candles.length} candles</span>
      <span className="ml-auto">DSA Trading Tool v1.0</span>
    </footer>
  );
}
