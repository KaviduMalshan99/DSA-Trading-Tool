import { useCallback } from 'react';
import { useChartStore } from '../store/chartStore';

export function useChartSync() {
  const { setVisibleRange, setCrosshair } = useChartStore();

  const onRangeChange = useCallback(
    (from: number, to: number) => setVisibleRange(from, to),
    [setVisibleRange]
  );

  const onCrosshairMove = useCallback(
    (price: number | null, time: number | null) => setCrosshair(price, time),
    [setCrosshair]
  );

  return { onRangeChange, onCrosshairMove };
}
