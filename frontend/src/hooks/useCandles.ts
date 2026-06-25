import { useEffect } from 'react';
import { api } from '../services/api';
import { useMarketStore } from '../store/marketStore';

export function useCandles() {
  const { activeSymbol, activeInterval, setCandles, setLoading } = useMarketStore();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const candles = await api.getCandles(activeSymbol, activeInterval);
        if (!cancelled) setCandles(candles);
      } catch (err) {
        console.error('Failed to fetch candles:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activeSymbol, activeInterval, setCandles, setLoading]);
}
