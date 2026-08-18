import { useEffect, useRef, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { decimalsForPrice } from '../../utils/priceFormat';

const WS_BASE  = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';
const MAX_ROWS = 150;
const LARGE_TRADE_MULTIPLE = 5; // highlight rows whose notional is >= 5x the visible median

interface Trade {
  price: number;
  qty:   number;
  time:  number;
  side:  'buy' | 'sell';
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function medianNotional(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const notionals = trades.map((t) => t.price * t.qty).sort((a, b) => a - b);
  return notionals[Math.floor(notionals.length / 2)];
}

export function TapePanel() {
  const { activeSymbol } = useMarketStore();
  const replayActive = useReplayStore((s) => s.isActive);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [connected, setConnected] = useState(false);

  const tradesRef = useRef<Trade[]>([]);

  useEffect(() => {
    setTrades([]);
    tradesRef.current = [];
    setConnected(false);

    let ws: WebSocket | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      ws = new WebSocket(`${WS_BASE}/ws/tape/${activeSymbol}`);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; trades: Trade[] };
          if (msg.type === 'historical') {
            // Backend sends oldest→newest; reverse so index 0 is newest.
            const next = [...msg.trades].reverse().slice(0, MAX_ROWS);
            tradesRef.current = next;
            setTrades(next);
          } else if (msg.type === 'trades' && msg.trades.length > 0) {
            // Batch is oldest→newest; reverse so the newest trade in the batch
            // ends up first, then prepend onto the existing newest-first list.
            const batch = [...msg.trades].reverse();
            const next = [...batch, ...tradesRef.current].slice(0, MAX_ROWS);
            tradesRef.current = next;
            setTrades(next);
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

  const decimals = trades[0] !== undefined ? decimalsForPrice(trades[0].price) : 2;
  const median = medianNotional(trades);
  const largeThreshold = median * LARGE_TRADE_MULTIPLE;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-xs">
      <div className="flex items-center px-2 py-1.5 border-b border-[var(--border-color-soft)] flex-shrink-0">
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
          Tape · {activeSymbol}
        </span>
        {trades.length > 0 && (
          <span className="ml-auto text-[9px] text-[var(--text-muted)]">{trades.length}</span>
        )}
      </div>

      <div className="flex items-center justify-between px-2 py-0.5 text-[9px] text-[var(--text-muted)] border-b border-[var(--border-color-soft)] flex-shrink-0">
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
      </div>

      {replayActive ? (
        <div className="flex-1 flex items-center justify-center text-center px-3 text-[11px] text-[var(--text-muted)] italic">
          Not available in replay — tape is live-only.
        </div>
      ) : !connected && trades.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-muted)] italic">
          Connecting…
        </div>
      ) : trades.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--text-muted)] italic">
          Waiting for trades…
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          {trades.map((t, i) => {
            const isBuy = t.side === 'buy';
            const notional = t.price * t.qty;
            const isLarge = largeThreshold > 0 && notional >= largeThreshold;
            return (
              <div
                key={`${t.time}-${i}`}
                className={`flex items-center justify-between px-2 py-[1px] font-mono ${
                  isBuy ? 'text-[#26a641]' : 'text-[#f85149]'
                } ${isLarge ? 'font-bold' : ''}`}
                style={isLarge ? { background: isBuy ? 'rgba(38,166,65,0.10)' : 'rgba(248,81,73,0.10)' } : undefined}
              >
                <span className="text-[var(--text-muted)]">{fmtTime(t.time)}</span>
                <span>{t.price.toFixed(decimals)}</span>
                <span>{t.qty.toFixed(4)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
