import type { Drawing } from '../store/drawingStore';

// Matches every drawing time anchor by naming convention: time, time1/2/3,
// timeHigh/timeLow, timeA1/A2/B1/B2 — new tools following it are covered.
const TIME_KEY = /^time(\d+|[A-Z]\w*)?$/;

/**
 * Returns a copy of `drawings` with every time anchor (top-level time* keys and
 * points[i].time) shifted by `deltaSeconds`. Non-time fields are untouched;
 * the input is never mutated.
 */
export function shiftDrawingTimes(drawings: Drawing[], deltaSeconds: number): Drawing[] {
  return drawings.map((d) => {
    const src = d as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = { ...src };
    for (const key of Object.keys(src)) {
      const v = src[key];
      if (TIME_KEY.test(key) && typeof v === 'number') {
        out[key] = v + deltaSeconds;
      } else if (key === 'points' && Array.isArray(v)) {
        out[key] = v.map((p) =>
          p && typeof p === 'object' && typeof (p as { time?: unknown }).time === 'number'
            ? { ...p, time: (p as { time: number }).time + deltaSeconds }
            : p,
        );
      }
    }
    return out as unknown as Drawing;
  });
}

// Price anchors by the same convention: price, price1/2/3, priceA1/…, plus the
// position tools' entry/target/stop prices.
const PRICE_KEY = /^(price(\d+|[A-Z]\w*)?|entryPrice|targetPrice|stopPrice)$/;

/**
 * Price counterpart of shiftDrawingTimes: every price anchor (top-level price*
 * keys, entry/target/stop prices and points[i].price) shifted by `delta`.
 */
export function shiftDrawingPrices(drawings: Drawing[], delta: number): Drawing[] {
  return drawings.map((d) => {
    const src = d as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = { ...src };
    for (const key of Object.keys(src)) {
      const v = src[key];
      if (PRICE_KEY.test(key) && typeof v === 'number') {
        out[key] = v + delta;
      } else if (key === 'points' && Array.isArray(v)) {
        out[key] = v.map((p) =>
          p && typeof p === 'object' && typeof (p as { price?: unknown }).price === 'number'
            ? { ...p, price: (p as { price: number }).price + delta }
            : p,
        );
      }
    }
    return out as unknown as Drawing;
  });
}

/** The first price anchor found on a drawing (used to size pixel offsets), or null. */
export function firstPriceAnchor(d: Drawing): number | null {
  const src = d as unknown as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const v = src[key];
    if (PRICE_KEY.test(key) && typeof v === 'number') return v;
  }
  const pts = src.points;
  if (Array.isArray(pts)) {
    const p = pts.find((q) => q && typeof (q as { price?: unknown }).price === 'number') as { price: number } | undefined;
    if (p) return p.price;
  }
  return null;
}
