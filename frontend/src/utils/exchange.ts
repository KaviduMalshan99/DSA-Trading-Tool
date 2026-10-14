// Exchange labels for display (watchlist, search, chart legend, MarketInfo).
// The app's live data is crypto from Binance; the stock and forex tables
// mirror the backend's placeholder providers so they're ready for later use.

// backend/app/market/providers/stocks.py — all NASDAQ-listed except SPY.
const STOCK_EXCHANGES: Record<string, string | null> = {
  AAPL: 'NASDAQ',
  MSFT: 'NASDAQ',
  GOOGL: 'NASDAQ',
  AMZN: 'NASDAQ',
  TSLA: 'NASDAQ',
  NVDA: 'NASDAQ',
  META: 'NASDAQ',
  SPY: null, // NYSE Arca ETF; no label until there's a data source for it.
};

// backend/app/market/providers/forex.py — OTC, no single exchange to show.
const FOREX_PAIRS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF']);

/**
 * Exchange to label `symbol` with, or null when there's nothing to show.
 * Anything not in the stock/forex tables is a crypto pair from the Binance
 * symbol list or Binance search, so it falls through to "BINANCE".
 */
export function getExchange(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  if (upper in STOCK_EXCHANGES) return STOCK_EXCHANGES[upper];
  if (FOREX_PAIRS.has(upper)) return null;
  return 'BINANCE';
}
