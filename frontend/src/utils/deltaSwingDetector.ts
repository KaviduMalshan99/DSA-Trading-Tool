/**
 * Coin-relative "large delta swing" edge detector — extracted from
 * ClusterScanner so Alerts can reuse the exact same detection instead of a
 * second, potentially-drifting definition of "large."
 *
 * No fixed absolute threshold: delta's units scale wildly by coin (BTC
 * deltas are single digits, PEPE deltas are in the millions), so "large" is
 * defined relative to a rolling window of recently observed |delta|
 * magnitudes. Fires (returns true from observe()) only on the false->true
 * transition, once a large swing "arms" here, it won't refire again until
 * the magnitude drops back down and crosses the threshold anew — so a
 * sustained large-delta stretch reports once, not every tick.
 */

export const DELTA_WINDOW_SIZE = 20;      // how many recent |delta| samples the rolling average is over
export const DELTA_MIN_SAMPLES = 5;       // no swing detection until this many samples establish a baseline
export const DELTA_SWING_MULTIPLIER = 3;  // |delta| must be >= 3x the rolling average to count as "large"

export interface DeltaSwingDetector {
  /** Feed the latest delta value. Returns true only on the swing's rising edge. */
  observe(delta: number): boolean;
}

export function createDeltaSwingDetector(): DeltaSwingDetector {
  const window: number[] = [];
  let wasLarge = false;
  let seeded = false;

  return {
    observe(delta: number): boolean {
      const mag = Math.abs(delta);

      if (!seeded) {
        seeded = true;
        window.push(mag);
        return false;
      }

      const avg = window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : 0;
      const isLarge = window.length >= DELTA_MIN_SAMPLES && avg > 0 && mag >= avg * DELTA_SWING_MULTIPLIER;
      const fired = isLarge && !wasLarge;
      wasLarge = isLarge;

      window.push(mag);
      if (window.length > DELTA_WINDOW_SIZE) window.shift();

      return fired;
    },
  };
}
