import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useMarketStore } from '../../store/marketStore';
import type { MarketType } from '../../types/market';

const MARKETS: MarketType[] = ['crypto', 'forex', 'stocks'];

export function SymbolList() {
  const { activeSymbol, activeMarket, setSymbol, setMarket } = useMarketStore();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getSymbols(activeMarket)
      .then((res) => setSymbols(res.symbols))
      .catch(console.error);
  }, [activeMarket]);

  const filtered = search
    ? symbols.filter((s) => s.includes(search.toUpperCase()))
    : symbols;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#30363d]">
      <div className="flex gap-1 p-2 border-b border-[#30363d]">
        {MARKETS.map((m) => (
          <button
            key={m}
            onClick={() => setMarket(m)}
            className={`flex-1 py-1 rounded text-xs capitalize font-medium transition-colors ${
              activeMarket === m
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-[#21262d]'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="m-2 px-2 py-1 text-sm bg-[#161b22] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-blue-500"
      />

      <div className="flex-1 overflow-y-auto">
        {filtered.slice(0, 100).map((sym) => (
          <button
            key={sym}
            onClick={() => setSymbol(sym)}
            className={`w-full text-left px-3 py-2 text-sm font-mono transition-colors ${
              activeSymbol === sym
                ? 'bg-blue-900/40 text-blue-300'
                : 'text-gray-300 hover:bg-[#161b22]'
            }`}
          >
            {sym}
          </button>
        ))}
      </div>
    </div>
  );
}
