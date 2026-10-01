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
