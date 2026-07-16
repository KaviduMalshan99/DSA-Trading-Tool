import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useChartStore } from '../../store/chartStore';
import { useCandleStyleStore } from '../../store/candleStyleStore';
import { useThemeStore, type Theme } from '../../store/themeStore';
import { useChartSync } from '../../hooks/useChartSync';
import { toChartTime } from '../../utils/chartTime';
import type { Candle } from '../../types/market';

function chartThemeOptions(theme: Theme) {
  const grid = theme === 'dark' ? '#161b22' : '#e0e3eb';
  const text = theme === 'dark' ? '#c9d1d9' : '#4b5563';
  const border = theme === 'dark' ? '#21262d' : '#d1d4dc';
  const crosshair = theme === 'dark' ? '#3b82f6' : '#2196f3';
  const crosshairLabelBg = theme === 'dark' ? '#1e3a5f' : '#d6e8fb';
  return {
    layout: {
      background: { color: 'transparent' },
      textColor: text,
    },
    grid: {
      vertLines: { color: grid },
      horzLines: { color: grid },
    },
    crosshair: {
      vertLine: { color: crosshair, labelBackgroundColor: crosshairLabelBg },
      horzLine: { color: crosshair, labelBackgroundColor: crosshairLabelBg },
    },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border },
  };
}

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

  // Scroll-back pagination state — refs so the logical-range-change listener
  // (subscribed once, on chart mount) always sees the latest values without
  // having to be re-subscribed on every symbol/interval/WS reconnect.
  const wsRef = useRef<WebSocket | null>(null);
  const oldestTimeRef = useRef<number | null>(null);
  const loadingMoreRef = useRef(false);
  const reachedStartRef = useRef(false);

  const { activeSymbol, activeInterval, setCandles, appendCandle, prependCandles } = useMarketStore();
  const { onRangeChange, onCrosshairMove } = useChartSync();
  const { visibleOverlays } = useChartStore();
  const candleStyle = useCandleStyleStore();
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    if (!containerRef.current) return;

    const themeOpts = chartThemeOptions(theme);
    const chart = createChart(containerRef.current, {
      layout: themeOpts.layout,
      grid: themeOpts.grid,
      crosshair: {
        vertLine: { visible: false, ...themeOpts.crosshair.vertLine },
        // labelVisible: false — DrawingCanvas draws its own single price label for the
        // cross/dot cursor modes; leaving this at its true default would render a second,
        // overlapping native price tag on the axis alongside our custom one.
        horzLine: { visible: false, labelVisible: false, ...themeOpts.crosshair.horzLine },
      },
      rightPriceScale: themeOpts.rightPriceScale,
      timeScale: {
        ...themeOpts.timeScale,
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const style = useCandleStyleStore.getState();
    const series = chart.addCandlestickSeries({
      upColor:          style.bodyVisible ? style.upColor : 'rgba(0,0,0,0)',
      downColor:        style.bodyVisible ? style.downColor : 'rgba(0,0,0,0)',
      borderVisible:    style.bordersVisible,
      borderUpColor:    style.borderUpColor,
      borderDownColor:  style.borderDownColor,
      wickVisible:      style.wickVisible,
      wickUpColor:      style.wickUpColor,
      wickDownColor:    style.wickDownColor,
    });

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range) onRangeChange(range.from as number, range.to as number);
    });

    // Scroll-back pagination: once the visible window nears the oldest loaded
    // bar, ask the server for another page of older candles over the same WS.
    // Debounced because setData()'s own "fit content" default plus the
    // scrollToRealTime() that follows it both fire this same event in quick
    // succession right after every historical load — acting on the first
    // (transient, far-left) range instead of the settled one would trigger a
    // spurious loadMore on every page load / symbol switch.
    let loadMoreDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (loadMoreDebounceTimer) clearTimeout(loadMoreDebounceTimer);
      if (!range || range.from > 50) return;
      loadMoreDebounceTimer = setTimeout(() => {
        if (loadingMoreRef.current || reachedStartRef.current) return;
        const oldest = oldestTimeRef.current;
        const socket = wsRef.current;
        if (oldest == null || !socket || socket.readyState !== WebSocket.OPEN) return;
        loadingMoreRef.current = true;
        socket.send(JSON.stringify({ type: 'loadMore', before: oldest }));
      }, 200);
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
      if (loadMoreDebounceTimer) clearTimeout(loadMoreDebounceTimer);
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      if (sharedChartRef)  sharedChartRef.current  = null;
      if (sharedSeriesRef) sharedSeriesRef.current = null;
    };
  }, [onRangeChange, onCrosshairMove, sharedChartRef, sharedSeriesRef]);

  // Re-skin the native chart (grid/axis/crosshair colors) on theme change without
  // recreating the chart, so zoom/pan state and data survive the switch.
  useEffect(() => {
    if (!chartRef.current) return;
    const themeOpts = chartThemeOptions(theme);
    chartRef.current.applyOptions({
      layout: themeOpts.layout,
      grid: themeOpts.grid,
      crosshair: {
        vertLine: { visible: false, ...themeOpts.crosshair.vertLine },
        horzLine: { visible: false, labelVisible: false, ...themeOpts.crosshair.horzLine },
      },
      rightPriceScale: themeOpts.rightPriceScale,
      timeScale: themeOpts.timeScale,
    });
  }, [theme]);

  // Apply user-configured candle colors; dim body/borders (not wicks) when the
  // footprint overlay is active so its per-price-level text reads clearly.
  useEffect(() => {
    if (!seriesRef.current) return;
    const fp = visibleOverlays.has('footprint');
    seriesRef.current.applyOptions({
      upColor:          fp ? 'rgba(0,0,0,0)' : (candleStyle.bodyVisible ? candleStyle.upColor : 'rgba(0,0,0,0)'),
      downColor:        fp ? 'rgba(0,0,0,0)' : (candleStyle.bodyVisible ? candleStyle.downColor : 'rgba(0,0,0,0)'),
      borderVisible:    fp ? false : candleStyle.bordersVisible,
      borderUpColor:    candleStyle.borderUpColor,
      borderDownColor:  candleStyle.borderDownColor,
      wickVisible:      candleStyle.wickVisible,
      wickUpColor:      candleStyle.wickUpColor,
      wickDownColor:    candleStyle.wickDownColor,
    });
  }, [
    visibleOverlays,
    candleStyle.upColor, candleStyle.downColor,
    candleStyle.borderUpColor, candleStyle.borderDownColor,
    candleStyle.wickUpColor, candleStyle.wickDownColor,
    candleStyle.bodyVisible, candleStyle.bordersVisible, candleStyle.wickVisible,
  ]);

  useEffect(() => {
    // Clear stale data immediately so the old symbol doesn't linger
    seriesRef.current?.setData([]);
    setCurrentPrice(null);
    setConnected(false);
    oldestTimeRef.current = null;
    loadingMoreRef.current = false;
    reachedStartRef.current = false;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      if (stopped) return;
      const url = `${WS_BASE}/ws/candles/${activeSymbol}/${activeInterval}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

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
            oldestTimeRef.current = msg.candles[0]?.t ?? null;
            reachedStartRef.current = msg.candles.length === 0;
            if (seriesRef.current) {
              seriesRef.current.setData(
                msg.candles.map((c) => ({
                  time: toChartTime(c.t),
                  open: c.o,
                  high: c.h,
                  low: c.l,
                  close: c.c,
                }))
              );
              // scrollToRealTime() alone isn't reliable here: if the user had
              // zoomed to an extreme bar spacing on a *previous* symbol, that
              // zoom carries over (the chart instance isn't recreated on
              // switch), and scrollToRealTime() can land on a stale position
              // instead of the new dataset's actual last bar. Set the visible
              // range explicitly from the new data's own length instead, which
              // doesn't depend on whatever zoom state the chart was already in.
              const total = msg.candles.length;
              if (total > 0) {
                const visibleBars = 100;
                chartRef.current?.timeScale().setVisibleLogicalRange({
                  from: Math.max(0, total - visibleBars),
                  to: total - 1 + 5,
                });
              }
            }
            const last = msg.candles.at(-1);
            if (last) setCurrentPrice(last.c);
          } else if (msg.type === 'historical_prepend' && msg.candles) {
            const older = msg.candles;
            loadingMoreRef.current = false;

            if (older.length === 0) {
              reachedStartRef.current = true;
              return;
            }

            const beforeCount = useMarketStore.getState().candles.length;
            prependCandles(older);
            const merged = useMarketStore.getState().candles;
            const added = merged.length - beforeCount;

            if (added <= 0) {
              // Every returned candle was already loaded — nothing new to show,
              // treat it the same as having reached the start to avoid
              // re-requesting the same page on every subsequent scroll tick.
              reachedStartRef.current = true;
              return;
            }

            oldestTimeRef.current = merged[0]?.t ?? oldestTimeRef.current;

            if (seriesRef.current && chartRef.current) {
              // Capture the current view before setData, since replacing the
              // series data resets the visible range — then restore it shifted
              // by however many bars were just prepended, so the user's scroll
              // position doesn't jump.
              const prevRange = chartRef.current.timeScale().getVisibleLogicalRange();
              seriesRef.current.setData(
                merged.map((c) => ({
                  time: toChartTime(c.t),
                  open: c.o,
                  high: c.h,
                  low: c.l,
                  close: c.c,
                }))
              );
              if (prevRange) {
                chartRef.current.timeScale().setVisibleLogicalRange({
                  from: prevRange.from + added,
                  to: prevRange.to + added,
                });
              }
            }
          } else if (msg.type === 'update' && msg.candle) {
            const c = msg.candle;
            appendCandle(c);
            if (seriesRef.current) {
              seriesRef.current.update({
                time: toChartTime(c.t),
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
      wsRef.current = null;
      setConnected(false);
    };
  }, [activeSymbol, activeInterval, setCandles, appendCandle, prependCandles]);

  return (
    <div className="relative w-full h-full z-10">
      <div className="absolute top-2 left-3 z-10 flex items-center gap-3 pointer-events-none select-none">
        <span className="text-[var(--chart-text)] text-sm font-semibold tracking-wider">
          {activeSymbol}
        </span>
        <span className="text-[var(--text-muted)] text-xs">{activeInterval}</span>
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
      <div ref={containerRef} data-tv-chart-root className="w-full h-full" />
    </div>
  );
}
