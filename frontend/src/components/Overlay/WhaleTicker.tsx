import { useWhaleStore, type WhaleTrade } from '../../store/whaleStore';

function fmtNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

function TradeRow({ trade, isNewest }: { trade: WhaleTrade; isNewest: boolean }) {
  const isBuy = trade.side === 'buy';
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono ${
        isBuy ? 'text-[#26a641]' : 'text-[#f85149]'
      }`}
      style={isNewest ? { animation: 'whaleTick 300ms ease-out' } : undefined}
    >
      <span>🐋</span>
      <span className="font-bold w-8 flex-shrink-0">{isBuy ? 'BUY' : 'SELL'}</span>
      <span className="font-semibold">{fmtNotional(trade.notional)}</span>
      <span className="text-[var(--text-muted)]">@</span>
      <span className="text-[var(--text-tertiary)] truncate">
        {trade.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

export function WhaleTicker() {
  const trades = useWhaleStore((s) => s.trades.slice(0, 10));

  return (
    <div
      className="flex-shrink-0 flex flex-col border-t border-[var(--border-color)] bg-[var(--bg-app)]"
      style={{ height: '220px' }}
    >
      <style>{`
        @keyframes whaleTick {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border-color-soft)] flex-shrink-0">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
          🐋 Whale Trades
        </span>
        {trades.length > 0 && (
          <span className="ml-auto text-[9px] text-[var(--text-muted)]">{trades.length}</span>
        )}
      </div>

      {/* Trade list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {trades.length === 0 ? (
          <div className="px-2 py-2 text-[10px] text-[var(--text-muted)] italic">
            Watching for whales…
          </div>
        ) : (
          trades.map((t, i) => (
            <TradeRow key={`${t.time}-${i}`} trade={t} isNewest={i === 0} />
          ))
        )}
      </div>
    </div>
  );
}
