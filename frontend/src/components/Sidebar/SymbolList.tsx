import { useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import type { MarketType } from '../../types/market';

const MARKETS: MarketType[] = ['crypto', 'forex', 'stocks'];

const CRYPTO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT',
];

export function SymbolList() {
  const { activeSymbol, activeMarket, setActiveSymbol, setMarket } = useMarketStore();
  const [search, setSearch] = useState('');

  const filtered = search
    ? CRYPTO_SYMBOLS.filter((s) => s.includes(search.toUpperCase()))
    : CRYPTO_SYMBOLS;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#30363d]">
      {/* Market tabs */}
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

      {activeMarket === 'crypto' ? (
        <>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="m-2 px-2 py-1 text-sm bg-[#161b22] border border-[#30363d] rounded text-gray-300 placeholder-gray-600 outline-none focus:border-blue-500"
          />

          <div className="flex-1 overflow-y-auto">
            {filtered.map((sym) => (
              <button
                key={sym}
                onClick={() => setActiveSymbol(sym)}
                className={`w-full text-left px-3 py-2 text-sm font-mono transition-colors border-l-2 ${
                  activeSymbol === sym
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500'
                    : 'text-gray-300 hover:bg-[#161b22] border-transparent'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-gray-500 text-sm capitalize font-medium mb-1">{activeMarket}</div>
            <div className="text-gray-600 text-xs">Coming Soon</div>
          </div>
        </div>
      )}
    </div>
  );
}
