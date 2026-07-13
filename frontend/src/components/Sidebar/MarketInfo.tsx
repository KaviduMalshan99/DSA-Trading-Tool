import { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useChartStore } from '../../store/chartStore';

interface Ticker24hr {
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
}

export function MarketInfo() {
  const { activeSymbol } = useMarketStore();
  const { crosshairPrice } = useChartStore();
  const [ticker, setTicker] = useState<Ticker24hr | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function fetchTicker() {
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${activeSymbol}`
        );
        if (!res.ok) return;
        const data = await res.json() as Ticker24hr;
        if (!cancelled) { setTicker(data); setLoading(false); }
      } catch { /* ignore network errors */ }
    }

    fetchTicker();
    const interval = setInterval(fetchTicker, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeSymbol]);

  const price      = ticker ? parseFloat(ticker.lastPrice)         : null;
  const change     = ticker ? parseFloat(ticker.priceChange)       : null;
  const changePct  = ticker ? parseFloat(ticker.priceChangePercent): null;
  const high       = ticker ? parseFloat(ticker.highPrice)         : null;
  const low        = ticker ? parseFloat(ticker.lowPrice)          : null;
  const isPositive = changePct !== null && changePct >= 0;

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const displayPrice = crosshairPrice ?? price;

  return (
    <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-app)]">
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
        {activeSymbol}
      </div>

      {loading ? (
        <div className="text-[var(--text-muted)] text-sm">Loading...</div>
      ) : displayPrice !== null ? (
        <>
          <div className="text-xl font-mono font-bold text-[var(--text-primary)]">
            {fmt(displayPrice)}
          </div>

          {changePct !== null && change !== null && (
            <div className={`text-xs font-mono mt-0.5 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{fmt(change)}
              {' '}({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
            <span className="text-[var(--text-muted)]">24H H</span>
            <span className="text-[var(--text-secondary)] font-mono text-right">{high !== null ? fmt(high) : '—'}</span>
            <span className="text-[var(--text-muted)]">24H L</span>
            <span className="text-[var(--text-secondary)] font-mono text-right">{low !== null ? fmt(low) : '—'}</span>
          </div>
        </>
      ) : (
        <div className="text-[var(--text-muted)] text-sm">No data</div>
      )}
    </div>
  );
}
