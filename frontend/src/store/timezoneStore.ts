import { create } from 'zustand';

const STORAGE_KEY = 'dsa-timezone';
const DEFAULT_TZ = 'Asia/Colombo';

export interface TimezoneOption {
  tz: string;     // IANA zone name
  label: string;  // short city label for the UI
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { tz: 'UTC', label: 'UTC' },
  { tz: 'Asia/Colombo', label: 'Colombo' },
  { tz: 'Europe/London', label: 'London' },
  { tz: 'America/New_York', label: 'New York' },
  { tz: 'Asia/Tokyo', label: 'Tokyo' },
  { tz: 'Asia/Singapore', label: 'Singapore' },
  { tz: 'Asia/Dubai', label: 'Dubai' },
  { tz: 'Australia/Sydney', label: 'Sydney' },
];

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function loadInitial(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isValidTimezone(raw)) return raw;
  } catch { /* ignore malformed/blocked storage */ }
  return DEFAULT_TZ;
}

/**
 * Offset of `tz` from UTC in seconds at instant `at` (DST-aware), via Intl's
 * longOffset name ("GMT+05:30", "GMT-04:00", or plain "GMT" for zero).
 */
export function zoneOffsetSeconds(tz: string, at: number = Date.now()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(name);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 3600 + Number(m[3] ?? 0) * 60);
}

/** Current offset label for `tz`, e.g. "UTC+5:30", "UTC-4", "UTC+0". */
export function zoneOffsetLabel(tz: string, at: number = Date.now()): string {
  const off = zoneOffsetSeconds(tz, at);
  const absMin = Math.abs(off) / 60;
  return `UTC${off < 0 ? '-' : '+'}${Math.floor(absMin / 60)}` +
    (absMin % 60 ? `:${String(absMin % 60).padStart(2, '0')}` : '');
}

interface TimezoneState {
  timezone: string;
  setTimezone: (tz: string) => void;
}

export const useTimezoneStore = create<TimezoneState>((set) => ({
  timezone: loadInitial(),

  setTimezone: (tz) => {
    if (!isValidTimezone(tz)) return;
    set({ timezone: tz });
    try { localStorage.setItem(STORAGE_KEY, tz); } catch { /* ignore */ }
  },
}));
