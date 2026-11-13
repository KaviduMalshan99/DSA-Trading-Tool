import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { TAG_COLORS, useWatchlistStore } from '../../store/watchlistStore';
import { api } from '../../services/api';
import type { MarketType } from '../../types/market';
import { CoinIcon } from '../UI/CoinIcon';
import { CoinTagFlag } from './CoinTagFlag';
import { getExchange } from '../../utils/exchange';
import { isPerp } from '../../utils/symbol';

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
  const { symbols: watchlist, tagColors, addSymbol } = useWatchlistStore();
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
        // Keep results consistent with the rest of the app, which only deals in
        // USDT pairs — spot (BTCUSDT) and USD-M perpetuals (BTCUSDT.P).
        const filtered = found.filter((s) => s.endsWith('USDT') || s.endsWith('USDT.P'));
        if (!cancelled) setResults(filtered);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, activeMarket]);

  // Display-only ordering: tagged coins first, grouped by colour in TAG_COLORS
  // order, then untagged. The stable sort keeps the saved watchlist order inside
  // each group; the stored array itself is never reordered.
  const { sortedWatchlist, taggedCount } = useMemo(() => {
    const rank = (sym: string) => {
      const c = tagColors[sym];
      if (!c) return Number.MAX_SAFE_INTEGER;
      const i = TAG_COLORS.indexOf(c);
      return i === -1 ? TAG_COLORS.length : i; // unknown/legacy colour: still tagged, after known ones
    };
    const sorted = [...watchlist].sort((a, b) => rank(a) - rank(b));
    return { sortedWatchlist: sorted, taggedCount: sorted.filter((s) => tagColors[s]).length };
  }, [watchlist, tagColors]);

  const list = isSearching ? results : sortedWatchlist;
  // Index of the first untagged row, when a divider should sit above it.
  const dividerAt = !isSearching && taggedCount > 0 && taggedCount < list.length ? taggedCount : -1;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] border-r border-[var(--border-color)]">
      {/* Market tabs */}
      <div className="flex gap-1 p-2 border-b border-[var(--border-color)]">
        {MARKETS.map((m) => (
          <button
            key={m}
            onClick={() => setMarket(m)}
            className={`flex-1 py-1 rounded text-xs capitalize font-medium transition-colors ${
              activeMarket === m
                ? 'bg-blue-600 text-white'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
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
            className="m-2 px-2 py-1 text-sm bg-[var(--bg-panel)] border border-[var(--border-color)] rounded text-[var(--text-secondary)] outline-none focus:border-blue-500 themed-placeholder"
          />

          <div className="flex-1 overflow-y-auto">
            {isSearching && searching && (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Searching…</div>
            )}
            {isSearching && !searching && list.length === 0 && (
              <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No matches</div>
            )}
            {list.map((sym, idx) => {
              const inWatchlist = watchlist.includes(sym);
              // Search results are all Binance, so the exchange label is noise
              // there; watchlist rows keep it.
              const exchange = isSearching ? null : getExchange(sym);
              return (
                <Fragment key={sym}>
                  {idx === dividerAt && (
                    <div role="separator" className="mx-3 border-t border-[var(--border-color)]" />
                  )}
                  <div
                    onClick={() => setActiveSymbol(sym)}
                    className={`group w-full min-w-0 flex items-center gap-2 px-3 py-2 text-sm font-mono transition-colors border-l-2 cursor-pointer ${
                      activeSymbol === sym
                        ? 'bg-blue-600/20 text-blue-300 border-blue-500'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel)] border-transparent'
                    }`}
                  >
                    {/* Only the symbol text may shrink (ellipsis + full name in the
                        tooltip); flag, icon, exchange (watchlist only), PERP badge and the "+" button
                        keep their size so they always stay inside the sidebar. */}
                    <span className="flex flex-1 min-w-0 items-center gap-1.5">
                      {!isSearching && <CoinTagFlag symbol={sym} />}
                      <CoinIcon symbol={sym} size={18} />
                      <span className="min-w-0 truncate" title={sym}>{sym}</span>
                      {exchange && (
                        <span className="flex-shrink-0 text-[10px] font-sans text-[var(--text-muted)]">{exchange}</span>
                      )}
                      {isSearching && isPerp(sym) && (
                        <span
                          className="flex-shrink-0 px-1.5 py-px rounded-full text-[9px] font-sans font-medium leading-tight"
                          style={{ color: 'var(--accent)', background: 'rgba(33,150,243,0.12)' }}
                          title="USD-M perpetual futures"
                        >
                          PERP
                        </span>
                      )}
                    </span>
                    {isSearching && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!inWatchlist) addSymbol(sym); }}
                        disabled={inWatchlist}
                        title={inWatchlist ? 'Already in watchlist' : 'Add to watchlist'}
                        className={`w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 ${
                          inWatchlist ? 'text-emerald-500' : 'text-[var(--text-muted)] hover:text-white hover:bg-blue-600'
                        }`}
                      >
                        {inWatchlist ? <CheckIcon /> : <PlusIcon />}
                      </button>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[var(--text-muted)] text-sm capitalize font-medium mb-1">{activeMarket}</div>
            <div className="text-[var(--text-muted)] text-xs">Coming Soon</div>
          </div>
        </div>
      )}
    </div>
  );
}
