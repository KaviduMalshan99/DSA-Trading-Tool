import { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useWatchlistStore } from '../../store/watchlistStore';
import { api } from '../../services/api';
import type { MarketType } from '../../types/market';

const MARKETS: MarketType[] = ['crypto', 'forex', 'stocks'];
const SEARCH_DEBOUNCE_MS = 300;

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function SymbolList() {
  const { activeSymbol, activeMarket, setActiveSymbol, setMarket } = useMarketStore();
  const { symbols: watchlist, addSymbol } = useWatchlistStore();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  const query = search.trim();
  const isSearching = query.length > 0;

  // Debounced live search against the backend — covers every symbol the
  // exchange offers, not just the ones already in the watchlist.
  useEffect(() => {
    if (!query || activeMarket !== 'crypto') {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { results: found } = await api.searchSymbols(query, activeMarket);
        // Keep results consistent with the rest of the app, which only deals in USDT pairs.
        const filtered = found.filter((s) => s.endsWith('USDT'));
        if (!cancelled) setResults(filtered);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, activeMarket]);

  const list = isSearching ? results : watchlist;

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
            {isSearching && searching && (
              <div className="px-3 py-2 text-xs text-gray-600">Searching…</div>
            )}
            {isSearching && !searching && list.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-600">No matches</div>
            )}
            {list.map((sym) => {
              const inWatchlist = watchlist.includes(sym);
              return (
                <div
                  key={sym}
                  onClick={() => setActiveSymbol(sym)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-mono transition-colors border-l-2 cursor-pointer ${
                    activeSymbol === sym
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500'
                      : 'text-gray-300 hover:bg-[#161b22] border-transparent'
                  }`}
                >
                  <span>{sym}</span>
                  {isSearching && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!inWatchlist) addSymbol(sym); }}
                      disabled={inWatchlist}
                      title={inWatchlist ? 'Already in watchlist' : 'Add to watchlist'}
                      className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                        inWatchlist ? 'text-emerald-500' : 'text-gray-500 hover:text-white hover:bg-blue-600'
                      }`}
                    >
                      {inWatchlist ? <CheckIcon /> : <PlusIcon />}
                    </button>
                  )}
                </div>
              );
            })}
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
