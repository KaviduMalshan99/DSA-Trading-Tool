// Coin identity helpers: derive a base asset from a trading pair, resolve its
// logo URL, and pick a stable fallback color.

const QUOTE_SUFFIXES = ['USDT', 'FDUSD', 'USDC', 'BUSD', 'TUSD', 'BTC', 'ETH', 'BNB']
  .sort((a, b) => b.length - a.length);

/** "PEPEUSDT" → "PEPE". Returns the full pair if stripping would leave nothing. */
export function baseAsset(pair: string): string {
  const upper = pair.toUpperCase();
  for (const quote of QUOTE_SUFFIXES) {
    if (upper.endsWith(quote)) {
      const base = pair.slice(0, pair.length - quote.length);
      return base.length > 0 ? base : pair;
    }
  }
  return pair;
}

export function coinIconUrl(base: string): string {
  return `https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`;
}

/** djb2 hash → stable HSL color per coin. */
export function colorForSymbol(base: string): string {
  let h = 5381;
  for (let i = 0; i < base.length; i++) {
    h = ((h << 5) + h + base.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360} 55% 45%)`;
}
