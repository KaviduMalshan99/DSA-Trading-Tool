import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useChartSync } from '../../hooks/useChartSync';
import type { Candle } from '../../types/market';

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

interface TradingChartProps {
  /** Lifted ref so ChartContainer can share it with sibling panels for time-scale sync. */
  sharedChartRef?: React.MutableRefObject<IChartApi | null>;
  /** Lifted ref so FootprintCanvas can call priceToCoordinate on the candlestick series. */
  sharedSeriesRef?: React.MutableRefObject<ISeriesApi<'Candlestick'> | null>;
}

export function TradingChart({ sharedChartRef, sharedSeriesRef }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  const { activeSymbol, activeInterval, setCandles, appendCandle } = useMarketStore();
  const { onRangeChange, onCrosshairMove } = useChartSync();

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'rgba(13,17,23,0)' },
        textColor: '#c9d1d9',
      },
      grid: {
        vertLines: { color: '#161b22' },
        horzLines: { color: '#161b22' },
      },
      crosshair: {
        vertLine: { color: '#3b82f6', labelBackgroundColor: '#1e3a5f' },
        horzLine: { color: '#3b82f6', labelBackgroundColor: '#1e3a5f' },
      },
      rightPriceScale: {
        borderColor: '#21262d',
      },
      timeScale: {
        borderColor: '#21262d',
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series = chart.addCandlestickSeries({
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
    if (sharedChartRef)  sharedChartRef.current  = chart;
    if (sharedSeriesRef) sharedSeriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      if (sharedChartRef)  sharedChartRef.current  = null;
      if (sharedSeriesRef) sharedSeriesRef.current = null;
    };
  }, [onRangeChange, onCrosshairMove, sharedChartRef, sharedSeriesRef]);

  useEffect(() => {
    // Clear stale data immediately so the old symbol doesn't linger
    seriesRef.current?.setData([]);
    setCurrentPrice(null);
    setConnected(false);

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      const url = `${WS_BASE}/ws/candles/${activeSymbol}/${activeInterval}`;
      ws = new WebSocket(url);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            candles?: Candle[];
            candle?: Candle;
          };

          if (msg.type === 'historical' && msg.candles) {
            setCandles(msg.candles);
            if (seriesRef.current) {
              seriesRef.current.setData(
                msg.candles.map((c) => ({
                  time: Math.floor(c.t / 1000) as unknown as import('lightweight-charts').Time,
                  open: c.o,
                  high: c.h,
                  low: c.l,
                  close: c.c,
                }))
              );
              chartRef.current?.timeScale().scrollToRealTime();
            }
            const last = msg.candles.at(-1);
            if (last) setCurrentPrice(last.c);
          } else if (msg.type === 'update' && msg.candle) {
            const c = msg.candle;
            appendCandle(c);
            if (seriesRef.current) {
              seriesRef.current.update({
                time: Math.floor(c.t / 1000) as unknown as import('lightweight-charts').Time,
                open: c.o,
                high: c.h,
                low: c.l,
                close: c.c,
              });
            }
            setCurrentPrice(c.c);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      setConnected(false);
    };
  }, [activeSymbol, activeInterval, setCandles, appendCandle]);

  return (
    <div className="relative w-full h-full z-10">
      <div className="absolute top-2 left-3 z-10 flex items-center gap-3 pointer-events-none select-none">
        <span className="text-[#c9d1d9] text-sm font-semibold tracking-wider">
          {activeSymbol}
        </span>
        <span className="text-[#8b949e] text-xs">{activeInterval}</span>
        {currentPrice !== null && (
          <span className="text-[#26a641] text-sm font-mono font-bold">
            {currentPrice.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        )}
        <span
          className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#26a641]' : 'bg-[#f85149]'}`}
          title={connected ? 'Live' : 'Reconnecting…'}
        />
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
