import type { Time } from 'lightweight-charts';
import { useTimezoneStore, zoneOffsetSeconds } from '../store/timezoneStore';

/**
 * lightweight-charts always renders numeric time axis labels in UTC — it has
 * no per-viewer timezone setting. To make every chart on this page read in
 * the user's selected zone (timezoneStore) regardless of the viewer's
 * browser/OS timezone, every raw epoch-ms timestamp coming off the backend is
 * shifted by that zone's offset before being handed to the library as a "UTC"
 * time. All series/overlays must go through this same offset to stay aligned
 * with each other (candles, delta, footprint, heatmap, whale markers, SMC
 * zones, drawings).
 *
 * The offset is read fresh on every call; ChartContainer remounts the chart
 * subtree (key={timezone}) on zone change so everything recomputes with it.
 *
 * Known v1 limitation (DST): zoneOffsetSeconds() returns the zone's CURRENT
 * offset, applied to every bar. For DST zones (London, New York, Sydney), bars
 * on the other side of a past DST transition read 1h off. Colombo (default),
 * UTC, Tokyo, Singapore and Dubai have no DST. Per-bar DST accuracy is a
 * future stage.
 */
// Called per bar on every series rebuild, and zoneOffsetSeconds() builds an
// Intl.DateTimeFormat each time — cache per zone. Deliberately NOT refreshed
// on a timer: a DST flip mid-mount would shift new bars relative to existing
// ones and to drawings. A live DST transition is picked up on page reload.
let cachedTz: string | null = null;
let cachedOffset = 0;

export function getChartTzOffsetSeconds(): number {
  const tz = useTimezoneStore.getState().timezone;
  if (tz !== cachedTz) {
    cachedTz = tz;
    cachedOffset = zoneOffsetSeconds(tz);
  }
  return cachedOffset;
}

/**
 * LEGACY fixed Asia/Colombo offset (UTC+5:30). Pre-timezone-picker data (v1
 * drawings) was always written in Colombo chart time, so migrations must undo
 * exactly this value — never the reactive getChartTzOffsetSeconds().
 */
export const CHART_TZ_OFFSET_SECONDS = 5.5 * 60 * 60; // 19800

/** Raw epoch-ms → shifted chart-time seconds, ready to feed to a series as `time`. */
export function toChartTime(epochMs: number): Time {
  return (Math.floor(epochMs / 1000) + getChartTzOffsetSeconds()) as unknown as Time;
}

/** Same shift, returned as a plain number for internal bucketing/snapping math. */
export function toChartTimeSeconds(epochMs: number): number {
  return Math.floor(epochMs / 1000) + getChartTzOffsetSeconds();
}

/** For sources that already report epoch seconds (not ms), e.g. the heatmap snapshot stream. */
export function shiftEpochSeconds(epochSec: number): number {
  return epochSec + getChartTzOffsetSeconds();
}

/**
 * Raw epoch-ms → "HH:MM:SS" in the chart's zone, for UI readouts outside the
 * chart (tape, alerts) so they match the axis. Shifted then read back as UTC —
 * the same trick the chart itself uses — so the browser's own zone never applies.
 */
export function formatChartClock(epochMs: number): string {
  const d = new Date(epochMs + getChartTzOffsetSeconds() * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
