import { useEffect, useRef, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { decimalsForPrice } from '../../utils/priceFormat';

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

type Level = [number, number]; // [price, qty]

interface DomSnapshot {
  bids: Level[];
  asks: Level[];
}

function Row({ price, qty, maxQty, side, decimals }: {
  price: number;
  qty: number;
  maxQty: number;
  side: 'bid' | 'ask';
  decimals: number;
}) {
  const pct = maxQty > 0 ? Math.min(100, (qty / maxQty) * 100) : 0;
  const isBid = side === 'bid';
  return (
    <div className="relative flex items-center justify-between px-2 py-[1px] text-[11px] font-mono">
      <div
        className="absolute inset-y-0 right-0"
        style={{
          width: `${pct}%`,
          background: isBid ? 'rgba(38,166,65,0.18)' : 'rgba(248,81,73,0.18)',
        }}
      />
      <span className={`relative z-10 ${isBid ? 'text-[#26a641]' : 'text-[#f85149]'}`}>
        {price.toFixed(decimals)}
      </span>
      <span className="relative z-10 text-[var(--text-secondary)]">{qty.toFixed(4)}</span>
    </div>
  );
}

export function DOMPanel() {
  const { activeSymbol } = useMarketStore();
  const replayActive = useReplayStore((s) => s.isActive);
  const [book, setBook] = useState<DomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  const bookRef = useRef<DomSnapshot | null>(null);

  useEffect(() => {
    setBook(null);
    bookRef.current = null;
    setConnected(false);

    let ws: WebSocket | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/dom/${activeSymbol}`);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string } & DomSnapshot;
          if (msg.type === 'snapshot') {
            const snap = { bids: msg.bids, asks: msg.asks };
            bookRef.current = snap;
            setBook(snap);
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(connect, 2_000);
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [activeSymbol]);

  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  const bestBid = bids[0]?.[0];
  const bestAsk = asks[0]?.[0];
  const mid = bestBid !== undefined && bestAsk !== undefined ? (bestBid + bestAsk) / 2 : undefined;
  const decimals = mid !== undefined ? decimalsForPrice(mid) : 2;
  const maxQty = Math.max(0, ...bids.map((l) => l[1]), ...asks.map((l) => l[1]));

  // Asks render top-of-book-last (lowest ask nearest the mid price, at the bottom of the ask block).
  const asksDisplay = [...asks].reverse();

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-xs">
      <div className="flex items-center px-2 py-1.5 border-b border-[var(--border-color-soft)] flex-shrink-0">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
          DOM · {activeSymbol}
        </span>
      </div>

      {replayActive ? (
        <div className="flex-1 flex items-center justify-center text-center px-3 text-[11px] text-[var(--text-muted)] italic">
          Not available in replay — DOM is live-only.
        </div>
      ) : !connected && !book ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-muted)] italic">
          Connecting…
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col justify-end">
            {asksDisplay.length === 0 ? (
              <div className="px-2 py-1 text-[10px] text-[var(--text-muted)] italic">No ask data</div>
            ) : (
              asksDisplay.map(([price, qty]) => (
                <Row key={`ask-${price}`} price={price} qty={qty} maxQty={maxQty} side="ask" decimals={decimals} />
              ))
            )}
          </div>

          <div className="flex-shrink-0 px-2 py-1 text-center border-y border-[var(--border-color-soft)] bg-[var(--bg-panel)]">
            <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">
              {mid !== undefined ? mid.toFixed(decimals) : '—'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {bids.length === 0 ? (
              <div className="px-2 py-1 text-[10px] text-[var(--text-muted)] italic">No bid data</div>
            ) : (
              bids.map(([price, qty]) => (
                <Row key={`bid-${price}`} price={price} qty={qty} maxQty={maxQty} side="bid" decimals={decimals} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
