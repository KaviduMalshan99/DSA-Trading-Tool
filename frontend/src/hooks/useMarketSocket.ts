import { useEffect } from 'react';
import { socketService } from '../services/socket';
import { useMarketStore } from '../store/marketStore';
import type { Candle } from '../types/market';

export function useMarketSocket() {
  const { activeSymbol, activeInterval, appendCandle } = useMarketStore();

  useEffect(() => {
    const channel = `candles:${activeSymbol}:${activeInterval}`;

    const unsub = socketService.subscribe(channel, (data) => {
      appendCandle(data as Candle);
    });

    return unsub;
  }, [activeSymbol, activeInterval, appendCandle]);
}
