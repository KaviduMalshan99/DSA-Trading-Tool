import { useMarketStore } from '../../store/marketStore';
import { useChartStore } from '../../store/chartStore';

export function MarketInfo() {
  const { activeSymbol, candles } = useMarketStore();
  const { crosshairPrice } = useChartStore();

  const latest = candles.at(-1);
  const prev = candles.at(-2);

  const change = latest && prev ? latest.c - prev.c : 0;
  const changePct = prev && prev.c !== 0 ? (change / prev.c) * 100 : 0;
  const isPositive = change >= 0;

  return (
    <div className="p-3 border-b border-[#30363d] bg-[#0d1117]">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{activeSymbol}</div>
      {latest ? (
        <>
          <div className="text-xl font-mono font-bold text-white">
            {crosshairPrice?.toFixed(2) ?? latest.c.toFixed(2)}
          </div>
          <div className={`text-xs font-mono mt-0.5 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
            <span className="text-gray-500">H</span>
            <span className="text-gray-300 font-mono text-right">{latest.h.toFixed(2)}</span>
            <span className="text-gray-500">L</span>
            <span className="text-gray-300 font-mono text-right">{latest.l.toFixed(2)}</span>
            <span className="text-gray-500">Vol</span>
            <span className="text-gray-300 font-mono text-right">{latest.v.toFixed(2)}</span>
          </div>
        </>
      ) : (
        <div className="text-gray-500 text-sm">No data</div>
      )}
    </div>
  );
}
