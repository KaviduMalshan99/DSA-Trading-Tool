import { useEffect, useState } from 'react';
import { socketService } from '../../services/socket';
import { useMarketStore } from '../../store/marketStore';

interface WhaleTrade {
  t: number;
  p: number;
  q: number;
  m: boolean;
}

const MAX_MARKERS = 20;

export function WhaleMarkers() {
  const symbol = useMarketStore((s) => s.activeSymbol);
  const [whales, setWhales] = useState<WhaleTrade[]>([]);

  useEffect(() => {
    const unsub = socketService.subscribe(`whales:${symbol}`, (data) => {
      setWhales((prev) => [data as WhaleTrade, ...prev].slice(0, MAX_MARKERS));
    });
    return unsub;
  }, [symbol]);

  if (!whales.length) return null;

  return (
    <div className="absolute top-2 right-20 flex flex-col gap-1 pointer-events-none">
      {whales.map((w, i) => (
        <div
          key={i}
          className={`text-xs px-2 py-0.5 rounded font-mono ${
            w.m ? 'bg-red-900/70 text-red-300' : 'bg-green-900/70 text-green-300'
          }`}
        >
          {w.m ? 'SELL' : 'BUY'} {w.q.toFixed(3)} @ {w.p.toFixed(2)}
        </div>
      ))}
    </div>
  );
}
