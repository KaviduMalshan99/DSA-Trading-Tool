import type { Time } from 'lightweight-charts';

/**
 * lightweight-charts always renders numeric time axis labels in UTC — it has
 * no per-viewer timezone setting. To make every chart on this page read in
 * Asia/Colombo wall-clock time regardless of the viewer's browser/OS
 * timezone, every raw epoch-ms timestamp coming off the backend is shifted
 * by this fixed offset before being handed to the library as a "UTC" time.
 * All series/overlays must go through this same offset to stay aligned with
 * each other (candles, delta, footprint, heatmap, whale markers, SMC zones,
 * drawings).
 */
export const CHART_TZ_OFFSET_SECONDS = 5.5 * 60 * 60; // Asia/Colombo, UTC+5:30

/** Raw epoch-ms → shifted chart-time seconds, ready to feed to a series as `time`. */
export function toChartTime(epochMs: number): Time {
  return (Math.floor(epochMs / 1000) + CHART_TZ_OFFSET_SECONDS) as unknown as Time;
}

/** Same shift, returned as a plain number for internal bucketing/snapping math. */
export function toChartTimeSeconds(epochMs: number): number {
  return Math.floor(epochMs / 1000) + CHART_TZ_OFFSET_SECONDS;
}

/** For sources that already report epoch seconds (not ms), e.g. the heatmap snapshot stream. */
export function shiftEpochSeconds(epochSec: number): number {
  return epochSec + CHART_TZ_OFFSET_SECONDS;
}

/** Display label for the chart's zone, derived from the offset (19800 → "UTC+5:30"). */
const tzAbsMin = Math.abs(CHART_TZ_OFFSET_SECONDS) / 60;
export const CHART_TZ_LABEL =
  `UTC${CHART_TZ_OFFSET_SECONDS < 0 ? '-' : '+'}${Math.floor(tzAbsMin / 60)}` +
  (tzAbsMin % 60 ? `:${String(tzAbsMin % 60).padStart(2, '0')}` : '');
export const CHART_TZ_CITY = 'Colombo';

/**
 * Raw epoch-ms → "HH:MM:SS" in the chart's zone, for UI readouts outside the
 * chart (tape, alerts) so they match the axis. Shifted then read back as UTC —
 * the same trick the chart itself uses — so the browser's own zone never applies.
 */
export function formatChartClock(epochMs: number): string {
  const d = new Date(epochMs + CHART_TZ_OFFSET_SECONDS * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
