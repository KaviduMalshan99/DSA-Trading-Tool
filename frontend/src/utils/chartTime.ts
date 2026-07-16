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
