import type { ISeriesApi } from 'lightweight-charts';
import { toChartTime } from './chartTime';
import type { Candle } from '../types/market';

/**
 * Single write path for the main chart's price data. The candlestick series
 * is always primary (every overlay uses it for priceToCoordinate); the line
 * series is an additive close-price view shown in 'line' chart mode. Every
 * setData/update goes through here so the two can never drift apart.
 */

export function toCandleBar(c: Candle) {
  return { time: toChartTime(c.t), open: c.o, high: c.h, low: c.l, close: c.c };
}

export function toLinePoint(c: Candle) {
  return { time: toChartTime(c.t), value: c.c };
}

export function setSeriesData(
  candleSeries: ISeriesApi<'Candlestick'> | null,
  lineSeries: ISeriesApi<'Line'> | null,
  candles: Candle[],
) {
  candleSeries?.setData(candles.map(toCandleBar));
  lineSeries?.setData(candles.map(toLinePoint));
}

export function updateSeriesBar(
  candleSeries: ISeriesApi<'Candlestick'> | null,
  lineSeries: ISeriesApi<'Line'> | null,
  c: Candle,
) {
  candleSeries?.update(toCandleBar(c));
  lineSeries?.update(toLinePoint(c));
}
