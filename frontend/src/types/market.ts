export interface Candle {
  symbol: string;
  t: number;      // timestamp (ms)
  o: number;      // open
  h: number;      // high
  l: number;      // low
  c: number;      // close
  v: number;      // volume
  interval: string;
}

export interface Trade {
  symbol: string;
  t: number;
  p: number;      // price
  q: number;      // quantity
  m: boolean;     // is_buyer_maker
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBookDepth {
  symbol: string;
  t: number;
  bids: [number, number][];
  asks: [number, number][];
}

export type MarketType = 'crypto' | 'forex' | 'stocks';

export type CandleInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface Symbol {
  id: string;
  name: string;
  market: MarketType;
}
