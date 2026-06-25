import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useChartSync } from '../../hooks/useChartSync';

export function TradingChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const candles = useMarketStore((s) => s.candles);
  const { onRangeChange, onCrosshairMove } = useChartSync();

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0d1117' }, textColor: '#c9d1d9' },
      grid: { vertLines: { color: '#161b22' }, horzLines: { color: '#161b22' } },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a641',
      downColor: '#f85149',
      borderVisible: false,
      wickUpColor: '#26a641',
      wickDownColor: '#f85149',
    });

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range) onRangeChange(range.from as number, range.to as number);
    });

    chart.subscribeCrosshairMove((param) => {
      const price = param.seriesData.get(series);
      onCrosshairMove(
        price ? (price as { close: number }).close : null,
        param.time ? (param.time as number) : null
      );
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      chart.applyOptions({
        width: containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [onRangeChange, onCrosshairMove]);

  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: Math.floor(c.t / 1000) as unknown as import('lightweight-charts').Time,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      }))
    );
  }, [candles]);

  return <div ref={containerRef} className="w-full h-full" />;
}
