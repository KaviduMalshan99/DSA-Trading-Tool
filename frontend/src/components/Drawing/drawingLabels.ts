import type { Drawing, LabelHAlign, LabelVAlign } from '../../store/drawingStore';

// Drawing types that get the TradingView-style settings modal (Style / Text /
// Coordinates) and an optional text label. Excluded on purpose: the
// text-family tools, stamps, positions, fib/gann/cycle tools, brush/
// highlighter and the measure/range tools keep their own UI; Info Line, Trend
// Angle, Sector and Position Forecast already draw a midpoint readout that a
// label would collide with; Double Curve and Price Note aren't in the spec.
export const LABEL_DRAWING_TYPES = [
  'trendline', 'ray', 'extendedLine', 'arrow',
  'hline', 'hray', 'vline', 'crossline',
  'rectangle', 'rotatedRectangle', 'circle', 'ellipse', 'triangle', 'arc', 'curve',
  'channel', 'flatChannel', 'disjointChannel', 'regression',
  'path', 'polyline',
  'abcd', 'xabcd', 'cypher', 'threeDrives', 'headShoulders',
] as const;

export type LabelDrawingType = (typeof LABEL_DRAWING_TYPES)[number];
export type LabelDrawing = Extract<Drawing, { type: LabelDrawingType }>;

export function isLabelDrawing(d: Drawing): d is LabelDrawing {
  return (LABEL_DRAWING_TYPES as readonly string[]).includes(d.type);
}

export const LABEL_DEFAULT_SIZE = 14;
export const LABEL_FONT_SIZES = [10, 11, 12, 14, 16, 20, 24, 28, 32, 40];
// Every LABEL_DRAWING_TYPES renderer defaults its line color to this.
export const LABEL_DEFAULT_LINE_COLOR = '#2196F3';

/** Label color fallback: the drawing's own line color. */
export function labelColorOf(d: LabelDrawing): string {
  return d.labelColor ?? d.color ?? LABEL_DEFAULT_LINE_COLOR;
}

// ── placement math (pure, screen px) ─────────────────────────────────────────

export interface Pt { x: number; y: number }

/** Where the text block goes along its own (rotated) x axis relative to the
 * anchor: 'start' = block starts at the anchor, 'end' = block ends there. */
export type LabelAlign = 'start' | 'center' | 'end';
/** Where the block goes along its own y axis: 'above' = block's bottom edge
 * sits `gap` px above the anchor, 'below' = top edge `gap` px below it,
 * 'on' = centered on the anchor. */
export type LabelSide = 'above' | 'on' | 'below';

export interface LabelPlacement {
  anchor: Pt;
  /** radians, canvas convention (y down); always in [-π/2, π/2) so text reads upright */
  angle: number;
  align: LabelAlign;
  side: LabelSide;
  gap: number;
  /** paint a chart-background box behind the text (text sitting on a line) */
  background: boolean;
}

const LINE_GAP = 4;   // text ↔ line distance
const END_INSET = 4;  // text ↔ segment end distance
const BOX_PAD = 6;    // text ↔ shape bounding-box edge distance

/** Normalizes a line angle into [-π/2, π/2) — rotating text by anything
 * outside that range would draw it upside down. `flipped` tells the caller
 * the reading direction now runs from the segment's end to its start. */
export function uprightAngle(angle: number): { angle: number; flipped: boolean } {
  let a = angle;
  while (a >= Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  if (a >= Math.PI / 2) return { angle: a - Math.PI, flipped: true };
  if (a < -Math.PI / 2) return { angle: a + Math.PI, flipped: true };
  return { angle: a, flipped: false };
}

/** Clips segment a→b to the rect [0,W]×[0,H] (Liang–Barsky), keeping its
 * direction. null when the segment lies entirely outside. */
export function clipSegment(a: Pt, b: Pt, W: number, H: number): [Pt, Pt] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const edges: [number, number][] = [[-dx, a.x], [dx, W - a.x], [-dy, a.y], [dy, H - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else       { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

function sideFromVAlign(v: LabelVAlign): LabelSide {
  return v === 'top' ? 'above' : v === 'bottom' ? 'below' : 'on';
}

/** Text along a line segment (already clipped to the visible area), rotated to
 * the segment and kept upright. HAlign picks the reading-direction left end /
 * middle / right end — for a segment drawn left-to-right that's its start /
 * middle / end; VAlign puts the text above / on (with background) / below it. */
export function segmentLabelPlacement(a: Pt, b: Pt, v: LabelVAlign, h: LabelHAlign): LabelPlacement | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return null;
  const { angle, flipped } = uprightAngle(Math.atan2(b.y - a.y, b.x - a.x));
  // reading-frame left/right ends of the segment
  const L = flipped ? b : a, R = flipped ? a : b;
  const ux = (R.x - L.x) / len, uy = (R.y - L.y) / len;
  const inset = Math.min(END_INSET, len / 2);
  let anchor: Pt, align: LabelAlign;
  if (h === 'left') { anchor = { x: L.x + ux * inset, y: L.y + uy * inset }; align = 'start'; }
  else if (h === 'right') { anchor = { x: R.x - ux * inset, y: R.y - uy * inset }; align = 'end'; }
  else { anchor = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 }; align = 'center'; }
  const side = sideFromVAlign(v);
  return { anchor, angle, align, side, gap: LINE_GAP, background: side === 'on' };
}

/** Vertical line at x spanning the visible height [0, H]: text rotated 90°
 * (reading bottom-to-top). VAlign = top / middle / bottom of the line, HAlign
 * = text on the line's left side / centered on it (with background) / right side.
 * `bottomReserve` keeps clear of the line's own time tag at the bottom. */
export function vlineLabelPlacement(x: number, H: number, v: LabelVAlign, h: LabelHAlign, bottomReserve = 0): LabelPlacement {
  // angle −π/2: the text's +x axis points up the screen, its +y axis (below
  // the text) points screen-right — so 'above' is the line's left side.
  const angle = -Math.PI / 2;
  let anchor: Pt, align: LabelAlign;
  if (v === 'top') { anchor = { x, y: END_INSET }; align = 'end'; }
  else if (v === 'bottom') { anchor = { x, y: H - END_INSET - bottomReserve }; align = 'start'; }
  else { anchor = { x, y: H / 2 }; align = 'center'; }
  const side: LabelSide = h === 'left' ? 'above' : h === 'right' ? 'below' : 'on';
  return { anchor, angle, align, side, gap: LINE_GAP, background: side === 'on' };
}

/** Horizontal text inside an axis-aligned bounding box, inset by a few px. */
export function boxLabelPlacement(
  box: { left: number; top: number; right: number; bottom: number }, v: LabelVAlign, h: LabelHAlign,
): LabelPlacement {
  const pad = BOX_PAD;
  const x = h === 'left' ? box.left + pad : h === 'right' ? box.right - pad : (box.left + box.right) / 2;
  const align: LabelAlign = h === 'left' ? 'start' : h === 'right' ? 'end' : 'center';
  // 'below' the top edge / 'above' the bottom edge keeps the block inside
  const y = v === 'top' ? box.top + pad : v === 'bottom' ? box.bottom - pad : (box.top + box.bottom) / 2;
  const side: LabelSide = v === 'top' ? 'below' : v === 'bottom' ? 'above' : 'on';
  return { anchor: { x, y }, angle: 0, align, side, gap: 0, background: false };
}

/** Horizontal text around a single point (Arc/Curve's on-curve point):
 * VAlign above / on (with background) / below it, HAlign to its left /
 * centered / to its right. */
export function pointLabelPlacement(p: Pt, v: LabelVAlign, h: LabelHAlign): LabelPlacement {
  const align: LabelAlign = h === 'left' ? 'end' : h === 'right' ? 'start' : 'center';
  const side = sideFromVAlign(v);
  return { anchor: p, angle: 0, align, side, gap: LINE_GAP + 2, background: side === 'on' };
}

/** Bounding box of a point set. */
export function boundsOf(pts: Pt[]): { left: number; top: number; right: number; bottom: number } {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** The text block's rect in the label's own rotated frame (origin = anchor). */
export function labelBlockRect(
  blockW: number, blockH: number, align: LabelAlign, side: LabelSide, gap: number,
): { left: number; top: number } {
  const left = align === 'start' ? 0 : align === 'center' ? -blockW / 2 : -blockW;
  const top = side === 'above' ? -gap - blockH : side === 'below' ? gap : -blockH / 2;
  return { left, top };
}

// ── drawing ──────────────────────────────────────────────────────────────────

export interface DrawLabelOpts {
  text: string;
  color: string;
  size: number;
  bold: boolean;
  italic: boolean;
  align: LabelAlign;
  side: LabelSide;
  gap: number;
  /** chart background color for the readability box; null = no box */
  background: string | null;
}

export function labelFont(size: number, bold: boolean, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

/** Draws a (possibly multi-line) label at `anchor`, rotated by `angle`. */
export function drawDrawingLabel(ctx: CanvasRenderingContext2D, anchor: Pt, angle: number, opts: DrawLabelOpts) {
  const lines = opts.text.split('\n');
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  if (angle !== 0) ctx.rotate(angle);
  ctx.font = labelFont(opts.size, opts.bold, opts.italic);
  const lineH = Math.round(opts.size * 1.3);
  const blockW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const blockH = lines.length * lineH;
  const { left, top } = labelBlockRect(blockW, blockH, opts.align, opts.side, opts.gap);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(left - 3, top, blockW + 6, blockH);
  }
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align === 'start' ? 'left' : opts.align === 'center' ? 'center' : 'right';
  ctx.textBaseline = 'middle';
  // textAlign is relative to x, so x is the block's start/center/end edge — 0
  // for every align (labelBlockRect already put the block on that side of it)
  lines.forEach((line, i) => ctx.fillText(line, 0, top + lineH * (i + 0.5)));
  ctx.restore();
}

/** Resolves a drawing's label fields + a placement into drawDrawingLabel's call. */
export function paintLabel(
  ctx: CanvasRenderingContext2D, d: LabelDrawing, placement: LabelPlacement | null,
  chartBg: string, colorOverride?: string,
) {
  if (!placement) return;
  const text = d.labelText ?? '';
  if (!text.trim()) return;
  drawDrawingLabel(ctx, placement.anchor, placement.angle, {
    text: text.replace(/\s+$/, ''),
    color: colorOverride ?? labelColorOf(d),
    size: d.labelSize ?? LABEL_DEFAULT_SIZE,
    bold: d.labelBold === true,
    italic: d.labelItalic === true,
    align: placement.align,
    side: placement.side,
    gap: placement.gap,
    background: placement.background ? chartBg : null,
  });
}
