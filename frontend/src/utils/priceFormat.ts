/**
 * Decimal places appropriate for displaying a live price of this magnitude
 * (e.g. BTC ~63,494 -> 2, XRP ~2.34 -> 2, PEPE ~0.00000812 -> 8) so sub-cent
 * coins don't round to "0.00". Sized off the raw price for direct display —
 * unlike price_step.py's price_decimals_for() on the backend, which sizes a
 * chart *bucket step*, not a literal price.
 */
export function decimalsForPrice(price: number): number {
  const abs = Math.abs(price);
  if (!Number.isFinite(abs) || abs === 0) return 2;
  if (abs >= 1) return 2;
  return Math.max(2, -Math.floor(Math.log10(abs)) + 2);
}

export function formatPrice(price: number): string {
  const decimals = decimalsForPrice(price);
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
