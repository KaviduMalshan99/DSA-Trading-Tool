// Pure screen-space handle math for Parallel Channel, Rotated Rectangle and
// Circle. No chart/series access here: callers convert to/from price/time, so
// the geometry stays unit-testable. All coordinates are canvas pixels.

export interface Pt { x: number; y: number }

// Below this baseline length the normal is undefined — skip normal math.
const MIN_SIDE_PX = 2;

// Unit normal n = (-uy, ux) of the P1→P2 side, or null when degenerate.
export function perpNormal(p1: Pt, p2: Pt): Pt | null {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (!(len >= MIN_SIDE_PX)) return null;
  return { x: -dy / len, y: dx / len };
}

// Signed perpendicular distance h of p3 from the line P1P2 (0 if degenerate).
export function perpWidth(p1: Pt, p2: Pt, p3: Pt): number {
  const n = perpNormal(p1, p2);
  return n ? (p3.x - p1.x) * n.x + (p3.y - p1.y) * n.y : 0;
}

// 'perp' Rotated Rectangle corners: P1, P2, P2 + h·n, P1 + h·n. A degenerate
// side collapses the width (no NaN).
export function perpCorners(p1: Pt, p2: Pt, p3: Pt): [Pt, Pt, Pt, Pt] {
  const n = perpNormal(p1, p2);
  const h = n ? perpWidth(p1, p2, p3) : 0;
  const ox = n ? n.x * h : 0, oy = n ? n.y * h : 0;
  return [
    { x: p1.x, y: p1.y }, { x: p2.x, y: p2.y },
    { x: p2.x + ox, y: p2.y + oy }, { x: p1.x + ox, y: p1.y + oy },
  ];
}

// Handle modes shared by Channel and Rotated Rectangle: 'p1'/'p2' = the P1P2
// side's ends, 'p1b'/'p2b' = the opposite side's corners at those ends,
// 'p3' = opposite-side midpoint (width), 'mb' = P1P2-side midpoint.
export type SixHandleMode = 'move' | 'p1' | 'p2' | 'p1b' | 'p2b' | 'p3' | 'mb';

// 'perp' Rotated Rectangle drag. `orig` is the stored P1/P2/P3 in screen px,
// `delta` the cursor movement since drag start. Returns the new P1/P2/P3,
// where P3 is always re-derived as P1 + h·n so h survives a rotation.
export function dragPerpRect(
  orig: { p1: Pt; p2: Pt; p3: Pt }, mode: SixHandleMode, delta: Pt,
): { p1: Pt; p2: Pt; p3: Pt } {
  const add = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });
  if (mode === 'move') {
    return { p1: add(orig.p1, delta.x, delta.y), p2: add(orig.p2, delta.x, delta.y), p3: add(orig.p3, delta.x, delta.y) };
  }
  const n0 = perpNormal(orig.p1, orig.p2);
  let h = perpWidth(orig.p1, orig.p2, orig.p3);
  let p1 = orig.p1, p2 = orig.p2;
  if (mode === 'p1' || mode === 'p1b') {
    // the corner and its partner across the width move together
    p1 = add(orig.p1, delta.x, delta.y);
  } else if (mode === 'p2' || mode === 'p2b') {
    p2 = add(orig.p2, delta.x, delta.y);
  } else {
    if (!n0) return orig;
    const d = delta.x * n0.x + delta.y * n0.y; // along the normal only
    if (mode === 'p3') {
      h += d;
    } else {
      // P1P2 side moves out by d; the opposite side stays put
      p1 = add(orig.p1, d * n0.x, d * n0.y);
      p2 = add(orig.p2, d * n0.x, d * n0.y);
      h -= d;
    }
  }
  const n = perpNormal(p1, p2);
  // degenerate side: keep P3's original offset from P1 instead of NaN math
  const p3 = n ? add(p1, h * n.x, h * n.y) : add(p1, orig.p3.x - orig.p1.x, orig.p3.y - orig.p1.y);
  return { p1, p2, p3 };
}

// Channel / parallelogram-rectangle corner + baseline-midpoint drags (screen
// part only — the price offset is held constant by the caller). `orig` is the
// computeParallelOffset screen shape. Returns the new baseline ends.
export function dragChannelBaseline(
  orig: { x1: number; y1: number; x2: number; y2: number; y1b: number; y2b: number },
  mode: 'p1' | 'p2' | 'p1b' | 'p2b' | 'mb', cursor: Pt, delta: Pt,
): { x1: number; y1: number; x2: number; y2: number } {
  const { x1, y1, x2, y2, y1b, y2b } = orig;
  switch (mode) {
    case 'p1':  return { x1: cursor.x, y1: cursor.y, x2, y2 };
    case 'p2':  return { x1, y1, x2: cursor.x, y2: cursor.y };
    case 'p1b': return { x1: cursor.x, y1: cursor.y - (y1b - y1), x2, y2 };
    case 'p2b': return { x1, y1, x2: cursor.x, y2: cursor.y - (y2b - y2) };
    case 'mb':  return { x1, y1: y1 + delta.y, x2, y2: y2 + delta.y };
  }
}

// Price/time patch for a Channel-style drag of mode p1/p2/p1b/p2b/mb. The
// stored channel offset (price3 − baseline price at time3) is preserved for
// the corner modes; 'mb' adjusts it so the second line doesn't move. P3 is
// re-anchored at the new P1 (priceAt(time1) === price1, so offset is exact).
export function channelDragPatch(
  orig: { price1: number; time1: number; price2: number; time2: number; price3: number; time3: number },
  screen: { x1: number; y1: number; x2: number; y2: number; y1b: number; y2b: number },
  mode: 'p1' | 'p2' | 'p1b' | 'p2b' | 'mb', cursor: Pt, delta: Pt,
  yToPrice: (y: number) => number | null, xToTime: (x: number) => number | null,
): { price1: number; time1: number; price2: number; time2: number; price3: number; time3: number } | null {
  const { price1, time1, price2, time2, price3, time3 } = orig;
  const priceAt = (t: number) =>
    time2 === time1 ? price1 : price1 + (price2 - price1) * (t - time1) / (time2 - time1);
  const offset = price3 - priceAt(time3);
  const nb = dragChannelBaseline(screen, mode, cursor, delta);
  let np1 = price1, nt1 = time1, np2 = price2, nt2 = time2;
  if (mode === 'p1' || mode === 'p1b') {
    const p = yToPrice(nb.y1), t = xToTime(nb.x1);
    if (p == null || t == null) return null;
    np1 = p; nt1 = t;
  } else if (mode === 'p2' || mode === 'p2b') {
    const p = yToPrice(nb.y2), t = xToTime(nb.x2);
    if (p == null || t == null) return null;
    np2 = p; nt2 = t;
  } else {
    const p1 = yToPrice(nb.y1), p2 = yToPrice(nb.y2);
    if (p1 == null || p2 == null) return null;
    np1 = p1; np2 = p2;
  }
  // 'mb': second line fixed at its original price at P1's end
  const newOffset = mode === 'mb' ? price1 + offset - np1 : offset;
  return { price1: np1, time1: nt1, price2: np2, time2: nt2, price3: np1 + newOffset, time3: nt1 };
}

// Circle from center + radius → the two stored bounding-box corners C∓(r, r).
export function circleCorners(c: Pt, r: number): { x1: number; y1: number; x2: number; y2: number } {
  return { x1: c.x - r, y1: c.y - r, x2: c.x + r, y2: c.y + r };
}

// ── Arc / Curve: on-curve control handle ────────────────────────────────────
// The stored third point C is the quadratic's off-curve control point. The
// handle the user sees and drags is the curve's own midpoint
// H = B(½) = (P1 + 2C + P2) / 4, so the curve always passes through it.

export function quadOnCurveHandle(p1: Pt, c: Pt, p2: Pt): Pt {
  return { x: (p1.x + 2 * c.x + p2.x) / 4, y: (p1.y + 2 * c.y + p2.y) / 4 };
}

// Inverse of quadOnCurveHandle: the control point C = 2H − (P1 + P2) / 2.
export function quadControlFromOnCurve(p1: Pt, h: Pt, p2: Pt): Pt {
  return { x: 2 * h.x - (p1.x + p2.x) / 2, y: 2 * h.y - (p1.y + p2.y) / 2 };
}

// ── Long / Short Position clamps ────────────────────────────────────────────
// Screen-y ordering (y grows downward): long  → yTarget < yEntry < yStop,
//                                       short → yStop < yEntry < yTarget.
export const POSITION_MIN_GAP_PX = 2;

export type PositionSide = 'long' | 'short';

// Clamp a dragged target/stop/entry y so the three lines keep their order
// with at least POSITION_MIN_GAP_PX between neighbours. For 'entry', when the
// target/stop gap is already too small to fit it, the entry stays put.
export function clampPositionY(
  side: PositionSide, mode: 'target' | 'stop' | 'entry', y: number,
  ys: { entry: number; target: number; stop: number },
): number {
  const g = POSITION_MIN_GAP_PX;
  // `above` is the line drawn higher on screen (smaller y)
  const above = side === 'long' ? 'target' : 'stop';
  if (mode === 'entry') {
    const lo = (side === 'long' ? ys.target : ys.stop) + g;
    const hi = (side === 'long' ? ys.stop : ys.target) - g;
    if (lo > hi) return ys.entry;
    return Math.min(hi, Math.max(lo, y));
  }
  return mode === above ? Math.min(y, ys.entry - g) : Math.max(y, ys.entry + g);
}

// Right-edge (width) drag: time2 stays at least one bar after time1.
export function clampPositionTime2(time1: number, time2: number, barSec: number): number {
  return Math.max(time2, time1 + barSec);
}
