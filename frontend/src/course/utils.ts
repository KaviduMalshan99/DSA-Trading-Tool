import { siteConfig } from './siteConfig';

export const IS_DEV = import.meta.env.DEV;

/** True when a config value has not been filled in yet. */
export function isTodo(v: string | number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return false;
  const s = v.trim();
  return s === '' || /^todo\b/i.test(s);
}

/** Should an item be rendered? Always in dev (to show the TODO), only when filled in prod. */
export function show(v: string | number | null | undefined): boolean {
  return IS_DEV || !isTodo(v);
}

export function formatLKR(n: number): string {
  return `LKR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "14 days (2 weeks)" style text for the refund window. */
export function refundWindowText(): string {
  const d = siteConfig.refund.windowDays;
  const w = d / 7;
  return Number.isInteger(w) ? `${d} days (${w} week${w === 1 ? '' : 's'})` : `${d} days`;
}

/** One-sentence refund summary used in the FAQ and at checkout. */
export function refundSummary(): string {
  const r = siteConfig.refund;
  return `Refund requests are accepted within ${refundWindowText()} of payment. Approved refunds are processed within ${r.processingDays} working days, back to the original payment method.`;
}

/** Social URL usable as a link ('' / TODO / non-http => decorative icon only). */
export function socialUrl(v: string): string | null {
  return !isTodo(v) && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
}

export function priceText(): string | null {
  return siteConfig.priceLKR === null ? null : formatLKR(siteConfig.priceLKR);
}

/** WhatsApp number as digits, or null if not set / invalid. */
export function whatsappDigits(): string | null {
  const raw = siteConfig.business.whatsapp;
  if (isTodo(raw)) return null;
  const d = raw.replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

/** https://wa.me/<digits>?text=... or null when no number configured. */
export function whatsappLink(message?: string): string | null {
  const d = whatsappDigits();
  if (!d) return null;
  return message ? `https://wa.me/${d}?text=${encodeURIComponent(message)}` : `https://wa.me/${d}`;
}

/**
 * Normalise a Sri Lankan phone number to +94XXXXXXXXX.
 * Accepts 0771234567, 771234567, 94771234567, +94 77 123 4567, 0094..., with spaces/dashes.
 * Returns null if it is not a valid 9-digit national number.
 */
export function normalizeLkPhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.includes('+')) return null;
  if (d.startsWith('0094')) d = d.slice(4);
  else if (d.startsWith('94') && d.length === 11) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^[1-9]\d{8}$/.test(d)) return null;
  return `+94${d}`;
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
