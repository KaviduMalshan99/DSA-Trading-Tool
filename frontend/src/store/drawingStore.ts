import { create } from 'zustand';

// The five cursor options exposed in the TradingView-style toolbar.
export type CursorMode = 'cross' | 'dot' | 'arrow' | 'demonstration' | 'eraser';
export const CURSOR_MODES: readonly CursorMode[] = ['cross', 'dot', 'arrow', 'demonstration', 'eraser'];

// The "Trend Line" group in TradingView's toolbar — grouped under one dropdown,
// same pattern as the cursor group. 'ray'/'extendedLine'/'infoLine'/'trendAngle'
// are line-variant tools that reuse TrendLineDrawing's exact price1/time1/
// price2/time2 shape (see the drawing interfaces below) — only their `type`
// tag and renderer differ from the plain Trend Line.
export type TrendTool =
  | 'trendline' | 'ray' | 'extendedLine' | 'infoLine' | 'trendAngle'
  | 'hline' | 'hray' | 'vline' | 'crossline' | 'channel' | 'regression'
  | 'flatChannel' | 'disjointChannel';
export const TREND_TOOLS: readonly TrendTool[] = [
  'trendline', 'ray', 'extendedLine', 'infoLine', 'trendAngle',
  'hline', 'hray', 'vline', 'crossline', 'channel', 'regression',
  'flatChannel', 'disjointChannel',
];

// The "Shapes" group — geometric shapes, arrows, and freehand tools, grouped
// under one dropdown just like Cursor and Trend Line.
// NOTE: the tool key is 'arrowTool', not 'arrow' — 'arrow' is already taken by
// the Cursor group's pointer style (CursorMode), and DrawingTool unions both,
// so reusing the name would make `activeTool === 'arrow'` ambiguous.
export type ShapeTool =
  | 'rectangle' | 'rotatedRectangle' | 'circle' | 'ellipse' | 'path' | 'polyline'
  | 'triangle' | 'arc' | 'curve' | 'doubleCurve'
  | 'arrowMarker' | 'arrowTool' | 'arrowMarkUp' | 'arrowMarkDown' | 'brush' | 'highlighter';
export const SHAPE_TOOLS: readonly ShapeTool[] = [
  'rectangle', 'rotatedRectangle', 'circle', 'ellipse', 'path', 'polyline',
  'triangle', 'arc', 'curve', 'doubleCurve',
  'arrowMarker', 'arrowTool', 'arrowMarkUp', 'arrowMarkDown', 'brush', 'highlighter',
];

// The "Annotation" group — Text and Price Note, grouped under one dropdown
// just like Cursor/Trend Line/Shapes. 'pin'/'flagMark'/'priceLabel'/'signpost'
// are single-click stamp markers modeled on ArrowMarkDrawing (see that type).
// 'note'/'callout'/'comment' are text-box markers that reuse Text/Signpost's
// shared inline-editing machinery (see the generalized editing handlers in
// DrawingCanvas.tsx) — same single-anchor + user-typed text shape as Signpost.
export type AnnotationTool =
  | 'text' | 'priceNote' | 'pin' | 'flagMark' | 'priceLabel' | 'signpost'
  | 'note' | 'callout' | 'comment';
export const ANNOTATION_TOOLS: readonly AnnotationTool[] =
  ['text', 'priceNote', 'pin', 'flagMark', 'priceLabel', 'signpost', 'note', 'callout', 'comment'];

// Standalone action tools: Measure doesn't leave a persisted drawing behind
// (it's a transient readout cleared on tool change), and Zoom In performs an
// action (zooms the chart to the dragged range) then snaps back to the last
// cursor mode — neither belongs in the Drawing union below.
export type ActionTool = 'measure' | 'zoomIn';
export const ACTION_TOOLS: readonly ActionTool[] = ['measure', 'zoomIn'];

// The "Prediction & measurement" group — Long/Short Position projections and
// Price/Date Range brackets, grouped under one dropdown just like the others.
export type PositionRangeTool =
  | 'longPosition' | 'shortPosition' | 'anchoredVwap' | 'priceRange' | 'dateRange' | 'datePriceRange' | 'sector'
  | 'positionForecast';
export const POSITION_RANGE_TOOLS: readonly PositionRangeTool[] = [
  'longPosition', 'shortPosition', 'anchoredVwap', 'priceRange', 'dateRange', 'datePriceRange', 'sector',
  'positionForecast',
];

// The "Fibonacci" group — Fib Retracement plus ratio-table variants (Fib
// Extension, Trend-based Fib Extension, Fib Channel), grouped under one
// dropdown just like Trend Line/Shapes/Annotation/Prediction & measurement.
// 'fibTimeZone', 'fibSpeedFan', 'fibCircles', 'fibSpeedArcs', 'fibWedge' and
// 'pitchfan' are grouped here for the toolbar flyout only — unlike the other
// 4, they have no ratio-table/levels (see FibTimeZoneDrawing/
// FibSpeedFanDrawing/FibCirclesDrawing/FibSpeedArcsDrawing/FibWedgeDrawing/
// PitchfanDrawing below) and are
// deliberately excluded from FibLikeDrawing; fibLevelsFor's FibTool parameter
// never actually receives any of them since every call site narrows d.type to
// the 4 ratio-table literals first.
export type FibTool = 'fibonacci' | 'fibExtension' | 'trendFibExtension' | 'fibChannel' | 'fibTimeZone' | 'fibSpeedFan' | 'fibCircles' | 'fibSpeedArcs' | 'fibWedge' | 'pitchfan';
export const FIB_TOOLS: readonly FibTool[] = ['fibonacci', 'fibExtension', 'trendFibExtension', 'fibChannel', 'fibTimeZone', 'fibSpeedFan', 'fibCircles', 'fibSpeedArcs', 'fibWedge', 'pitchfan'];

// The "Gann" group — Gann Fan, Gann Box, Gann Square — grouped under one
// dropdown just like Trend Line/Shapes/.../Fibonacci.
export type GannTool = 'gannFan' | 'gannBox' | 'gannSquare';
export const GANN_TOOLS: readonly GannTool[] = ['gannFan', 'gannBox', 'gannSquare'];

// The "Patterns" group — ABCD, XABCD, Cypher, Head & Shoulders, Three Drives —
// grouped under one dropdown just like Trend Line/Shapes/.../Gann. NOTE: the
// Patterns flyout also surfaces a "Triangle" entry, but that reuses the
// existing Geometric/Shapes 'triangle' tool verbatim (same ShapeTool, same
// TriangleDrawing) rather than being its own PatternTool — see PATTERN_ITEMS
// in DrawingToolbar.tsx.
export type PatternTool = 'abcd' | 'xabcd' | 'cypher' | 'threeDrives' | 'headShoulders';
export const PATTERN_TOOLS: readonly PatternTool[] = ['abcd', 'xabcd', 'cypher', 'threeDrives', 'headShoulders'];

// The "Cycles" group — Cyclic Lines, Time Cycles, Sine Line — grouped under
// one dropdown just like Trend Line/Shapes/.../Patterns. All three are
// 2-point tools: the two clicks set an interval (Cyclic Lines/Time Cycles
// repeat vertical lines at that spacing; Sine Line uses it as wavelength +
// amplitude) — see CyclicLinesDrawing/TimeCyclesDrawing/SineLineDrawing below.
export type CyclesTool = 'cyclicLines' | 'timeCycles' | 'sineLine';
export const CYCLES_TOOLS: readonly CyclesTool[] = ['cyclicLines', 'timeCycles', 'sineLine'];

export type DrawingTool =
  | CursorMode | TrendTool | ShapeTool | AnnotationTool | ActionTool | PositionRangeTool | FibTool | GannTool
  | PatternTool | CyclesTool;

export type LineDash = 'solid' | 'dashed' | 'dotted';

// Shared cosmetic style fields exposed on the floating style toolbar.
export interface LineStyle {
  color?: string;
  width?: number;
  dash?: LineDash;
  /** 0–100, defaults to 100 (fully opaque) */
  opacity?: number;
}

// Shared background-fill fields for closed shapes (rectangle, rotated
// rectangle, circle/ellipse).
export interface FillStyle {
  filled?: boolean;
  fillColor?: string;
  /** 0–100, defaults to 100 (fully opaque) */
  fillOpacity?: number;
}

export interface TrendLineDrawing extends LineStyle {
  id: string;
  type: 'trendline';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Ray: identical 2-point shape to Trend Line — rendered extended past point 2
// to the chart edge (still anchored/starting at point 1).
export interface RayDrawing extends LineStyle {
  id: string;
  type: 'ray';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Extended Line: identical 2-point shape to Trend Line — rendered extended
// past both points to the chart edges.
export interface ExtendedLineDrawing extends LineStyle {
  id: string;
  type: 'extendedLine';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Info Line: identical 2-point shape to Trend Line — rendered as the plain
// segment plus a label (price change / % change / bar count).
export interface InfoLineDrawing extends LineStyle {
  id: string;
  type: 'infoLine';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Trend Angle: identical 2-point shape to Trend Line — rendered as the plain
// segment plus a label showing the angle from horizontal (computed in pixel
// space at render time, so it isn't stored here).
export interface TrendAngleDrawing extends LineStyle {
  id: string;
  type: 'trendAngle';
  price1: number; time1: number;
  price2: number; time2: number;
}

export interface HLineDrawing extends LineStyle {
  id: string;
  type: 'hline';
  price: number;
}

export interface HRayDrawing extends LineStyle {
  id: string;
  type: 'hray';
  price: number;
  /** anchor point — the ray extends rightward from this time only */
  time: number;
}

export interface VLineDrawing extends LineStyle {
  id: string;
  type: 'vline';
  time: number;
}

// Crossline: a single anchor point rendered as both a full-width horizontal
// line (at `price`) and a full-height vertical line (at `time`) — like
// overlaying Horizontal Line + Vertical Line at one point.
export interface CrosslineDrawing extends LineStyle {
  id: string;
  type: 'crossline';
  price: number;
  time: number;
}

export interface RectangleDrawing extends LineStyle, FillStyle {
  id: string;
  type: 'rectangle';
  price1: number; time1: number;
  price2: number; time2: number;
}

export interface RotatedRectangleDrawing extends LineStyle, FillStyle {
  id: string;
  type: 'rotatedRectangle';
  // one edge of the rectangle (like a trend line)
  price1: number; time1: number;
  price2: number; time2: number;
  // third click — perpendicular offset that sets the rectangle's width
  price3: number; time3: number;
}

export interface CircleDrawing extends LineStyle, FillStyle {
  id: string;
  type: 'circle';
  // bounding-box corners — TradingView's "Circle" inscribes an ellipse in this box
  price1: number; time1: number;
  price2: number; time2: number;
}

// Ellipse: functionally identical to Circle (both inscribe an ellipse in a
// 2-corner bounding box) — kept as its own labeled tool per the toolbar spec,
// but the shape/render/hitTest/drag are all shared with CircleDrawing.
export interface EllipseDrawing extends LineStyle, FillStyle {
  id: string;
  type: 'ellipse';
  price1: number; time1: number;
  price2: number; time2: number;
}

export interface PathDrawing extends LineStyle {
  id: string;
  type: 'path';
  points: { price: number; time: number }[];
}

// Polyline: identical points[] geometry to Path, minus Path's trailing
// arrowhead — see the `d.type === 'path'` gate in the renderer.
export interface PolylineDrawing extends LineStyle {
  id: string;
  type: 'polyline';
  points: { price: number; time: number }[];
}

export interface BrushDrawing extends LineStyle {
  id: string;
  type: 'brush';
  points: { price: number; time: number }[];
}

// Highlighter: identical freehand points[] geometry to Brush — only its
// creation defaults differ (thicker + translucent, see finalizeFreeform).
export interface HighlighterDrawing extends LineStyle {
  id: string;
  type: 'highlighter';
  points: { price: number; time: number }[];
}

// Triangle: a closed 3-vertex filled polygon — 3 independent clicks (unlike
// Rotated Rectangle's baseline+offset), each vertex independently draggable.
export interface TriangleDrawing extends LineStyle, FillStyle {
  id: string;
  type: 'triangle';
  price1: number; time1: number;
  price2: number; time2: number;
  price3: number; time3: number;
}

// Sector: an angular wedge — identical 3-point shape to Triangle, but p1 is
// the apex and p2/p3 set the directions of the two rays (extended to the
// chart edge at render time), with the pie-wedge between them filled and the
// interior angle labeled (computed in pixel space, so it isn't stored).
export interface SectorDrawing extends LineStyle, FillStyle {
  id: string;
  type: 'sector';
  price1: number; time1: number; // apex
  price2: number; time2: number; // ray A direction
  price3: number; time3: number; // ray B direction
}

// Position Forecast: a projected 2-segment price path — same 3-point shape as
// Sector. p1 is the start, p2 the intermediate pullback, p3 the target; the
// start->target move is shaded and labeled (% / price / bars, computed at
// render time, so nothing derived is stored).
export interface PositionForecastDrawing extends LineStyle, FillStyle {
  id: string;
  type: 'positionForecast';
  price1: number; time1: number; // start
  price2: number; time2: number; // pullback
  price3: number; time3: number; // target
}

// Arc: a single quadratic curve from p1 (start) to p2 (end), bulging toward
// p3 (control point). Same 3-point shape as Curve — kept as a separate
// type/label per the toolbar spec even though the math is identical.
export interface ArcDrawing extends LineStyle {
  id: string;
  type: 'arc';
  price1: number; time1: number; // start
  price2: number; time2: number; // end
  price3: number; time3: number; // control/bulge
}

// Curve: functionally identical to Arc (quadratic curve, p3 is the control
// point) — see the shared quadratic sample/render helper in DrawingCanvas.tsx.
export interface CurveDrawing extends LineStyle {
  id: string;
  type: 'curve';
  price1: number; time1: number; // start
  price2: number; time2: number; // end
  price3: number; time3: number; // control
}

// Double Curve: an S-curve — two joined quadratic segments through p1
// (start), p2 (mid/join), p3 (end). The two segment control points aren't
// stored; they're derived on the fly (perpendicular offsets from each
// segment's midpoint, in opposite directions) from p1/p2/p3 at render/
// hitTest/drag time, so only the 3 anchors need to be draggable.
export interface DoubleCurveDrawing extends LineStyle {
  id: string;
  type: 'doubleCurve';
  price1: number; time1: number;
  price2: number; time2: number;
  price3: number; time3: number;
}

// 'plain' is the ordinary Arrow tool (blue by default); 'marker' is the Arrow
// Marker tool — same 2-point line-plus-arrowhead shape, just a neutral default
// color. (Arrow Mark Up/Down are a different, single-click shape — see
// ArrowMarkDrawing below.)
export type ArrowVariant = 'plain' | 'marker';

export interface ArrowDrawing extends LineStyle {
  id: string;
  type: 'arrow';
  variant?: ArrowVariant;
  price1: number; time1: number; // tail
  price2: number; time2: number; // head — arrowhead is drawn here
}

// Arrow Mark Up/Down: a single click placing a solid "block arrow" icon
// (chunky shaft + triangular head), not a 2-point line. `size` is the one
// overall scale knob — there's no separate width/height for a single-point icon.
export type ArrowMarkVariant = 'up' | 'down';

export interface ArrowMarkDrawing {
  id: string;
  type: 'arrowMark';
  variant: ArrowMarkVariant;
  price: number;
  time: number;
  color?: string;
  size?: number;
}

export interface TextDrawing {
  id: string;
  type: 'text';
  price: number;
  time: number;
  text: string;
  color?: string;
  fontSize?: number;
}

// Price Note: click an anchor point, click a second point, and the second
// point gets a price tag — a two-click line (same shape as Trend Line), not a
// single-click text annotation. The tag always shows point 2's price.
export interface PriceNoteDrawing extends LineStyle {
  id: string;
  type: 'priceNote';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Pin/Flag Mark/Price Label/Signpost: single-click stamp markers modeled on
// ArrowMarkDrawing above — one anchor (price/time), no second point, moved
// as a whole (never resized via drag; `size` is the one scale knob where
// applicable).

export interface PinDrawing {
  id: string;
  type: 'pin';
  price: number;
  time: number;
  color?: string;
  size?: number;
}

export interface FlagMarkDrawing {
  id: string;
  type: 'flagMark';
  price: number;
  time: number;
  color?: string;
  size?: number;
}

// Price Label: like Price Note's price tag, but a single-click stamp rather
// than a 2-click line — the tag's text is always the anchor's own formatted
// price, never user-typed.
export interface PriceLabelDrawing {
  id: string;
  type: 'priceLabel';
  price: number;
  time: number;
  color?: string;
}

// Signpost: the one stamp marker with a user-typed label — reuses the same
// text-editing machinery as TextDrawing (see the generalized editing handlers
// in DrawingCanvas.tsx). `text` is optional/absent only in the instant between
// placement and the first commit; an empty commit deletes it, same as Text.
export interface SignpostDrawing {
  id: string;
  type: 'signpost';
  price: number;
  time: number;
  text?: string;
  color?: string;
}

// Note/Callout/Comment: three more text-box annotation stamps, all modeled
// on SignpostDrawing above — one anchor, optional user-typed text (absent
// only between placement and first commit; empty commit deletes it), same
// shared text-editing machinery. Only their rendering differs (see the
// 'note'/'callout'/'comment' render branches in DrawingCanvas.tsx):
// Note draws a sticky-note icon with the text beside it; Callout draws a
// filled text box offset from the anchor with a leader line back to it;
// Comment draws a speech bubble with a tail pointing at the anchor.
export interface NoteDrawing {
  id: string;
  type: 'note';
  price: number;
  time: number;
  text?: string;
  color?: string;
}

export interface CalloutDrawing {
  id: string;
  type: 'callout';
  price: number;
  time: number;
  text?: string;
  color?: string;
}

export interface CommentDrawing {
  id: string;
  type: 'comment';
  price: number;
  time: number;
  text?: string;
  color?: string;
}

// Long/Short Position: single-click projection tool — entry line splits a
// profit zone (toward targetPrice) from a loss zone (toward stopPrice); the
// box spans time1..time2. For 'longPosition' targetPrice > entryPrice >
// stopPrice; for 'shortPosition' the inequality flips.
export interface PositionDrawing {
  id: string;
  type: 'longPosition' | 'shortPosition';
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  time1: number;
  time2: number;
  profitColor?: string;
  lossColor?: string;
}

// Price Range: click-drag a box between two points — shows the price delta,
// % change, and tick count via a vertical arrow. Same corner-pair shape as
// Rectangle so it reuses the box drag/resize handling.
export interface PriceRangeDrawing extends LineStyle {
  id: string;
  type: 'priceRange';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Date Range: click-drag a box between two points — shows the elapsed time
// and bar count via a horizontal arrow. Same shape as Price Range/Rectangle;
// only the rendering (arrow orientation + label) differs.
export interface DateRangeDrawing extends LineStyle {
  id: string;
  type: 'dateRange';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Date & Price Range: same box shape as Price Range/Date Range — combines
// both readouts (price delta/%/ticks AND bar count/elapsed time) in one
// two-line label instead of picking just one axis.
export interface DatePriceRangeDrawing extends LineStyle {
  id: string;
  type: 'datePriceRange';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Anchored VWAP: single-click anchor, modeled on PinDrawing — one anchor
// (price/time), no second point, moved as a whole. Unlike a stamp marker it
// isn't just a static icon: renderDrawing recomputes a VWAP line forward from
// the anchor out of live candle data on every render (see computeRegression
// for the analogous "derived from candles, not stored" pattern), so it
// auto-extends as new candles stream in.
export interface AnchoredVwapDrawing {
  id: string;
  type: 'anchoredVwap';
  price: number;
  time: number;
  color?: string;
  width?: number;
}

/** one row of the "Levels" list in the Fib settings dialog — enabled toggle,
 * editable ratio, and its own color. Width/dash are shared across all levels. */
export interface FibLevelConfig {
  enabled: boolean;
  pct: number;
  color: string;
}

export type FibExtend = 'none' | 'left' | 'right' | 'both';

export interface FibonacciDrawing {
  id: string;
  type: 'fibonacci';
  priceHigh: number; timeHigh: number;
  priceLow: number;  timeLow: number;
  /** per-level enabled/ratio/color override, parallel to FIB_LEVELS */
  levels?: FibLevelConfig[];
  /** shared line style applied to every level line */
  levelWidth?: number;
  levelDash?: LineDash;
  /** how far the horizontal level lines extend past the two anchor points */
  extend?: FibExtend;
  /** the diagonal line connecting the two anchor points ("Trend line" in TradingView) */
  lineVisible?: boolean;
  lineColor?: string;
  lineWidth?: number;
  lineDash?: LineDash;
}

// Fib Extension: same 2-point high/low shape as Fib Retracement — only its
// ratio table differs (FIB_EXTENSION_LEVELS in DrawingCanvas.tsx vs
// FIB_LEVELS), selected via the type-aware `fibLevelsFor` helper wherever
// FibonacciDrawing's level list is read (render/hitTest/settings modal).
export interface FibExtensionDrawing extends Omit<FibonacciDrawing, 'type'> {
  type: 'fibExtension';
}

// Trend-based Fib Extension: 3-click A (start of move) -> B (end of move) ->
// C (projection origin), unlike Fib Retracement/Extension's 2-point
// high/low anchor. Modeled on ChannelDrawing/TriangleDrawing's price1..3/
// time1..3 3-point shape. Its ratio table is projected forward from C by the
// A->B move (see fibLevelsFor / the render branch in DrawingCanvas.tsx).
export interface TrendFibExtensionDrawing {
  id: string;
  type: 'trendFibExtension';
  price1: number; time1: number; // A
  price2: number; time2: number; // B
  price3: number; time3: number; // C
  levels?: FibLevelConfig[];
  levelWidth?: number;
  levelDash?: LineDash;
  /** the A->B->C connecting lines */
  lineVisible?: boolean;
  lineColor?: string;
  lineWidth?: number;
  lineDash?: LineDash;
}

// Fib Channel: identical baseline+offset storage to ChannelDrawing
// (price1/time1 -> price2/time2 baseline, price3/time3 sets the parallel
// offset) — only the rendering differs: one line per fib ratio between the
// baseline (ratio 0) and the fully-offset parallel line (ratio 1), instead
// of just the 2 outer lines.
export interface FibChannelDrawing {
  id: string;
  type: 'fibChannel';
  price1: number; time1: number;
  price2: number; time2: number;
  price3: number; time3: number;
  levels?: FibLevelConfig[];
  levelWidth?: number;
  levelDash?: LineDash;
}

// Shared alias for the places (settings modal, style toolbar) that treat
// the fib-family tools identically except for which ratio table/geometry
// they resolve to.
export type FibLikeDrawing = FibonacciDrawing | FibExtensionDrawing | TrendFibExtensionDrawing | FibChannelDrawing;

// Fib Time Zone: lives in the Fibonacci flyout but is NOT a ratio-table tool
// (no `levels`, not part of FibLikeDrawing) — geometrically it's identical to
// CyclicLinesDrawing/TimeCyclesDrawing below: price1/time1 -> price2/time2 set
// the pixel spacing, and vertical lines are drawn at Fibonacci-sequence
// multiples (1,2,3,5,8,13,21,34,55) of that spacing from the anchor, each
// labeled with its Fibonacci number (see the 'fibTimeZone' render branch in
// DrawingCanvas.tsx). Prices aren't used for the geometry, kept for symmetry
// with the shared 2-point drag/hitTest machinery.
export interface FibTimeZoneDrawing extends LineStyle {
  id: string;
  type: 'fibTimeZone';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Fib Speed/Resistance Fan: lives in the Fibonacci flyout but, like Fib Time
// Zone, is NOT a ratio-table tool (no `levels`, not part of FibLikeDrawing).
// Identical 2-point shape to GannFanDrawing — price1/time1 is the apex (base
// start), price2/time2 the base end; the fib-ratio rays are derived at render
// time as pixel-space dy-scalings of the base vector (see the 'fibSpeedFan'
// render branch in DrawingCanvas.tsx) rather than stored.
export interface FibSpeedFanDrawing extends LineStyle {
  id: string;
  type: 'fibSpeedFan';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Fib Circles: lives in the Fibonacci flyout but, like Fib Speed/Resistance
// Fan, is NOT a ratio-table tool (no `levels`, not part of FibLikeDrawing).
// price1/time1 is the center, price2/time2 an edge point; the base radius is
// the pixel distance between them, and the fib-ratio rings are true circles
// derived at render time (see the 'fibCircles' render branch in
// DrawingCanvas.tsx) rather than stored — unlike Circle/Ellipse, which
// inscribe an ellipse in a 2-corner bounding box.
export interface FibCirclesDrawing extends LineStyle {
  id: string;
  type: 'fibCircles';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Fib Speed/Resistance Arcs: the half-circle cousin of Fib Circles — also NOT
// a ratio-table tool (no `levels`, not part of FibLikeDrawing). price1/time1
// is the origin, price2/time2 the end; the fib-ratio arcs are fixed
// semicircles around the origin, opening toward p2's side, derived at render
// time (see the 'fibSpeedArcs' render branch in DrawingCanvas.tsx).
export interface FibSpeedArcsDrawing extends LineStyle {
  id: string;
  type: 'fibSpeedArcs';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Fib Wedge: Fib Circles restricted to a Sector's angular sweep — same
// 3-point shape as SectorDrawing, and likewise NOT a ratio-table tool (no
// `levels`, not part of FibLikeDrawing). p1 is the apex, p2 sets edge A and
// the base radius, p3 only sets edge B's angle; the fib-ratio arcs are derived
// at render time (see the 'fibWedge' render branch in DrawingCanvas.tsx).
export interface FibWedgeDrawing extends LineStyle {
  id: string;
  type: 'fibWedge';
  price1: number; time1: number; // apex
  price2: number; time2: number; // edge A (direction + base radius)
  price3: number; time3: number; // edge B (direction only)
}

// Pitchfan: same 3-point shape as FibWedgeDrawing, and likewise NOT a
// ratio-table tool (no `levels`, not part of FibLikeDrawing). p1 is the anchor
// pivot, p2/p3 the two base pivots; the median and fib-ratio rays run from p1
// through points lerped along the p2-p3 base, derived at render time (see the
// 'pitchfan' render branch in DrawingCanvas.tsx).
export interface PitchfanDrawing extends LineStyle {
  id: string;
  type: 'pitchfan';
  price1: number; time1: number; // anchor
  price2: number; time2: number; // base pivot A
  price3: number; time3: number; // base pivot B
}

// Gann Fan: identical 2-point shape to Ray — price1/time1 is the anchor
// (apex), price2/time2 is the point that sets the 1x1 ray's direction. The
// other 6 angle rays (2x1, 3x1, 4x1, 1x2, 1x3, 1x4) are derived at render
// time as pixel-space dy-scalings of the 1x1 vector (see the 'gannFan'
// render branch in DrawingCanvas.tsx) rather than stored.
export interface GannFanDrawing extends LineStyle {
  id: string;
  type: 'gannFan';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Gann Box: same 2-corner box shape as Rectangle — draws a proportional
// grid (horizontal + vertical divisions at the shared Gann ratio set) inside
// the box rather than a filled rectangle, so no FillStyle is needed.
export interface GannBoxDrawing extends LineStyle {
  id: string;
  type: 'gannBox';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Gann Square: same box shape as Gann Box, plus corner-to-corner diagonals
// and a diagonal fan from the top-left corner to each ratio point along the
// opposite edges (see the 'gannSquare' render branch in DrawingCanvas.tsx).
export interface GannSquareDrawing extends LineStyle {
  id: string;
  type: 'gannSquare';
  price1: number; time1: number;
  price2: number; time2: number;
}

export interface ChannelDrawing {
  id: string;
  type: 'channel';
  // baseline (like a trend line)
  price1: number; time1: number;
  price2: number; time2: number;
  // third click — sets the parallel line's offset
  price3: number; time3: number;
}

export interface RegressionDrawing {
  id: string;
  type: 'regression';
  // time range the linear regression + deviation channel is computed over
  time1: number;
  time2: number;
}

// Flat Top/Bottom: same 3-click shape as ChannelDrawing (baseline p1/p2 plus a
// 3rd-click offset point p3), but the two channel lines are HORIZONTAL rather
// than parallel to the baseline — Line A is flat at price1 spanning
// [time1, time2], Line B is flat at price3 spanning the same time window.
// price2 is captured (same click sequence as Parallel Channel) but unused for
// geometry — only its time2 matters, as the right edge of the band.
export interface FlatChannelDrawing {
  id: string;
  type: 'flatChannel';
  price1: number; time1: number;
  price2: number; time2: number;
  price3: number; time3: number;
}

// Disjoint Channel: two independent line segments (not forced parallel like
// Parallel Channel) — line A (a1->a2) and line B (b1->b2), placed with 4
// clicks. Extends LineStyle so both segments share one configurable color/
// width/dash/opacity, unlike Parallel Channel/Flat Top-Bottom which render
// with a fixed color.
export interface DisjointChannelDrawing extends LineStyle {
  id: string;
  type: 'disjointChannel';
  priceA1: number; timeA1: number;
  priceA2: number; timeA2: number;
  priceB1: number; timeB1: number;
  priceB2: number; timeB2: number;
}

// Harmonic/chart pattern tools (ABCD, XABCD, Cypher, Three Drives, Head &
// Shoulders): all five share one points[] shape — same geometry PathDrawing
// uses — rather than named price1..priceN fields, so the generic Path/Polyline
// render/hitTest/vertex-drag code in DrawingCanvas.tsx can be reused as-is for
// any point count (4 for ABCD, 5 for XABCD/Cypher/Head & Shoulders, 6 for
// Three Drives) instead of needing bespoke per-tool geometry handling like
// TriangleDrawing/DisjointChannelDrawing above. Only the `type` tag varies;
// per-type point-count/labels/ratio-legs are resolved in DrawingCanvas.tsx.
export type PatternType = 'abcd' | 'xabcd' | 'cypher' | 'threeDrives' | 'headShoulders';

export interface PatternDrawing extends LineStyle {
  id: string;
  type: PatternType;
  points: { price: number; time: number }[];
}

// Cyclic Lines: same 2-point baseline shape as Trend Line — price1/time1 and
// price2/time2 set the repeating interval (the pixel distance between them),
// rendered as evenly spaced full-height vertical lines (see the 'cyclicLines'
// render branch in DrawingCanvas.tsx). Prices aren't used for the geometry
// (only the time delta matters) but are kept for symmetry with the shared
// 2-point drag/hitTest machinery.
export interface CyclicLinesDrawing extends LineStyle {
  id: string;
  type: 'cyclicLines';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Time Cycles: identical repeating-vertical-line geometry to Cyclic Lines —
// only the render branch differs, labeling each line with its cycle number
// (see DrawingCanvas.tsx).
export interface TimeCyclesDrawing extends LineStyle {
  id: string;
  type: 'timeCycles';
  price1: number; time1: number;
  price2: number; time2: number;
}

// Sine Line: same 2-point shape as Trend Line — the horizontal distance
// between the two anchors sets the wavelength, the vertical distance sets
// the amplitude. Rendered as a sampled sine-wave polyline across the visible
// chart width (see the 'sineLine' render branch in DrawingCanvas.tsx).
export interface SineLineDrawing extends LineStyle {
  id: string;
  type: 'sineLine';
  price1: number; time1: number;
  price2: number; time2: number;
}

export type Drawing =
  | TrendLineDrawing
  | RayDrawing
  | ExtendedLineDrawing
  | InfoLineDrawing
  | TrendAngleDrawing
  | HLineDrawing
  | HRayDrawing
  | VLineDrawing
  | CrosslineDrawing
  | RectangleDrawing
  | RotatedRectangleDrawing
  | CircleDrawing
  | EllipseDrawing
  | PathDrawing
  | PolylineDrawing
  | BrushDrawing
  | HighlighterDrawing
  | TriangleDrawing
  | SectorDrawing
  | FibWedgeDrawing
  | PitchfanDrawing
  | PositionForecastDrawing
  | ArcDrawing
  | CurveDrawing
  | DoubleCurveDrawing
  | ArrowDrawing
  | ArrowMarkDrawing
  | TextDrawing
  | PriceNoteDrawing
  | PinDrawing
  | FlagMarkDrawing
  | PriceLabelDrawing
  | SignpostDrawing
  | NoteDrawing
  | CalloutDrawing
  | CommentDrawing
  | PositionDrawing
  | PriceRangeDrawing
  | DateRangeDrawing
  | DatePriceRangeDrawing
  | AnchoredVwapDrawing
  | FibonacciDrawing
  | FibExtensionDrawing
  | TrendFibExtensionDrawing
  | FibChannelDrawing
  | FibTimeZoneDrawing
  | FibSpeedFanDrawing
  | FibCirclesDrawing
  | FibSpeedArcsDrawing
  | GannFanDrawing
  | GannBoxDrawing
  | GannSquareDrawing
  | ChannelDrawing
  | RegressionDrawing
  | FlatChannelDrawing
  | DisjointChannelDrawing
  | PatternDrawing
  | CyclicLinesDrawing
  | TimeCyclesDrawing
  | SineLineDrawing;

interface DrawingState {
  activeTool: DrawingTool;
  // The cursor-group tool last picked from the dropdown — kept separate from
  // activeTool so the toolbar button icon survives switching to a drawing tool.
  lastCursorMode: CursorMode;
  // Same idea for the Trend Line group's dropdown button icon.
  lastTrendTool: TrendTool;
  // Same idea for the Shapes group's dropdown button icon.
  lastShapeTool: ShapeTool;
  // Same idea for the Annotation group's dropdown button icon.
  lastAnnotationTool: AnnotationTool;
  // Same idea for the Prediction & measurement group's dropdown button icon.
  lastPositionRangeTool: PositionRangeTool;
  // Same idea for the Fibonacci group's dropdown button icon.
  lastFibTool: FibTool;
  // Same idea for the Gann group's dropdown button icon.
  lastGannTool: GannTool;
  // Same idea for the Patterns group's dropdown button icon.
  lastPatternTool: PatternTool;
  // Same idea for the Cycles group's dropdown button icon.
  lastCyclesTool: CyclesTool;
  // Cursor-group tools keep the chart interactive; the legacy magic snap mode is not exposed.
  magnetEnabled: boolean;
  // "Stay in Drawing Mode" — off (default) matches TradingView: finishing a
  // drawing reverts to the last cursor mode. On keeps the same tool selected
  // so you can place several of the same drawing in a row.
  keepToolActive: boolean;
  // "Lock All Drawings" — locked drawings can still be viewed/selected but
  // can't be dragged or deleted (by the eraser or Delete/Backspace).
  drawingsLocked: boolean;
  // "Hide All Drawings" — hidden drawings stay in state but aren't rendered
  // or interactive (can't be selected, dragged, or erased) until shown again.
  drawingsHidden: boolean;
  // Tools starred from a dropdown's item list — shown in the floating
  // Favorites toolbar (toggled via the star tool at the end of the sidebar).
  favoriteTools: DrawingTool[];
  favoritesBarOpen: boolean;
  // Dragged position of the floating Favorites toolbar; null = not moved yet
  // (use the caller's default position).
  favoritesBarPos: { x: number; y: number } | null;
  drawings: Drawing[];
  // Snapshots of `drawings` taken right before each mutating action (add,
  // update, delete, clearAll) — Ctrl+Z pops the last one back into `drawings`.
  // Whole-array snapshots (rather than per-type inverse patches) is what makes
  // undo generic across every drawing kind for free: it doesn't know or care
  // what changed, only what the array looked like a moment ago.
  history: Drawing[][];
  selectedId: string | null;

  setTool: (tool: DrawingTool) => void;
  addDrawing: (drawing: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  deleteDrawing: (id: string) => void;
  selectDrawing: (id: string | null) => void;
  clearAll: () => void;
  loadDrawings: (drawings: Drawing[]) => void;
  undo: () => void;
  toggleKeepToolActive: () => void;
  toggleDrawingsLocked: () => void;
  toggleDrawingsHidden: () => void;
  toggleFavorite: (tool: DrawingTool) => void;
  toggleFavoritesBar: () => void;
  setFavoritesBarPos: (pos: { x: number; y: number }) => void;
}

function isCursorMode(tool: DrawingTool): tool is CursorMode {
  return (CURSOR_MODES as readonly string[]).includes(tool);
}

function isTrendTool(tool: DrawingTool): tool is TrendTool {
  return (TREND_TOOLS as readonly string[]).includes(tool);
}

function isShapeTool(tool: DrawingTool): tool is ShapeTool {
  return (SHAPE_TOOLS as readonly string[]).includes(tool);
}

function isAnnotationTool(tool: DrawingTool): tool is AnnotationTool {
  return (ANNOTATION_TOOLS as readonly string[]).includes(tool);
}

function isPositionRangeTool(tool: DrawingTool): tool is PositionRangeTool {
  return (POSITION_RANGE_TOOLS as readonly string[]).includes(tool);
}

function isFibTool(tool: DrawingTool): tool is FibTool {
  return (FIB_TOOLS as readonly string[]).includes(tool);
}

function isGannTool(tool: DrawingTool): tool is GannTool {
  return (GANN_TOOLS as readonly string[]).includes(tool);
}

function isPatternTool(tool: DrawingTool): tool is PatternTool {
  return (PATTERN_TOOLS as readonly string[]).includes(tool);
}

function isCyclesTool(tool: DrawingTool): tool is CyclesTool {
  return (CYCLES_TOOLS as readonly string[]).includes(tool);
}

// Capped so a long session doesn't grow this unboundedly.
const MAX_HISTORY = 50;

function pushHistory(history: Drawing[][], snapshot: Drawing[]): Drawing[][] {
  const next = [...history, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

// Style pickers (the opacity <input type="range">, Fib settings' price
// number inputs, …) call updateDrawing on every drag tick/keystroke, not just
// on commit. Without coalescing, one slider drag would blow through the
// entire MAX_HISTORY cap on a single gesture and evict real undo-worthy
// history (earlier shapes). Module-level like `latestCandlesForExtrapolation`
// in DrawingCanvas.tsx — pure bookkeeping, doesn't need to be reactive state.
const COALESCE_WINDOW_MS = 400;
let lastMutation: { id: string; at: number } | null = null;

function pushHistoryFor(history: Drawing[][], snapshot: Drawing[], id: string): Drawing[][] {
  const now = Date.now();
  const coalesce = lastMutation != null && lastMutation.id === id && now - lastMutation.at < COALESCE_WINDOW_MS;
  lastMutation = { id, at: now };
  return coalesce ? history : pushHistory(history, snapshot);
}

export const useDrawingStore = create<DrawingState>((set) => ({
  activeTool: 'cross',
  lastCursorMode: 'cross',
  lastTrendTool: 'trendline',
  lastShapeTool: 'rectangle',
  lastAnnotationTool: 'text',
  lastPositionRangeTool: 'longPosition',
  lastFibTool: 'fibonacci',
  lastGannTool: 'gannFan',
  lastPatternTool: 'abcd',
  lastCyclesTool: 'cyclicLines',
  magnetEnabled: false,
  keepToolActive: false,
  drawingsLocked: false,
  drawingsHidden: false,
  favoriteTools: [],
  favoritesBarOpen: false,
  favoritesBarPos: null,
  drawings: [],
  history: [],
  selectedId: null,

  setTool: (tool) =>
    set((s) => {
      const cursorGroup = isCursorMode(tool);
      const trendGroup = isTrendTool(tool);
      const shapeGroup = isShapeTool(tool);
      const annotationGroup = isAnnotationTool(tool);
      const positionRangeGroup = isPositionRangeTool(tool);
      const fibGroup = isFibTool(tool);
      const gannGroup = isGannTool(tool);
      const patternGroup = isPatternTool(tool);
      const cyclesGroup = isCyclesTool(tool);
      // Re-clicking the active drawing tool deselects it back to the last cursor mode.
      const activeTool = !cursorGroup && s.activeTool === tool ? s.lastCursorMode : tool;
      return {
        activeTool,
        lastCursorMode: cursorGroup ? tool : s.lastCursorMode,
        lastTrendTool: trendGroup ? tool : s.lastTrendTool,
        lastShapeTool: shapeGroup ? tool : s.lastShapeTool,
        lastAnnotationTool: annotationGroup ? tool : s.lastAnnotationTool,
        lastPositionRangeTool: positionRangeGroup ? tool : s.lastPositionRangeTool,
        lastFibTool: fibGroup ? tool : s.lastFibTool,
        lastGannTool: gannGroup ? tool : s.lastGannTool,
        lastPatternTool: patternGroup ? tool : s.lastPatternTool,
        lastCyclesTool: cyclesGroup ? tool : s.lastCyclesTool,
        magnetEnabled: cursorGroup ? false : s.magnetEnabled,
      };
    }),
  addDrawing: (drawing) =>
    set((s) => {
      lastMutation = null;
      return { history: pushHistory(s.history, s.drawings), drawings: [...s.drawings, drawing] };
    }),
  updateDrawing: (id, patch) =>
    set((s) => ({
      history: pushHistoryFor(s.history, s.drawings, id),
      drawings: s.drawings.map((d) => (d.id === id ? ({ ...d, ...patch } as Drawing) : d)),
    })),
  deleteDrawing: (id) =>
    set((s) => {
      lastMutation = null;
      return {
        history: pushHistory(s.history, s.drawings),
        drawings: s.drawings.filter((d) => d.id !== id),
        selectedId: null,
      };
    }),
  selectDrawing: (id) => set({ selectedId: id }),
  clearAll: () =>
    set((s) => {
      lastMutation = null;
      return { history: pushHistory(s.history, s.drawings), drawings: [], selectedId: null };
    }),
  // A fresh symbol/interval's persisted drawings aren't part of this session's
  // undo timeline — reset history rather than carrying over stale snapshots.
  loadDrawings: (drawings) => { lastMutation = null; set({ drawings, history: [] }); },
  undo: () =>
    set((s) => {
      if (s.history.length === 0) return {};
      lastMutation = null;
      const prev = s.history[s.history.length - 1];
      return { drawings: prev, history: s.history.slice(0, -1), selectedId: null };
    }),
  toggleKeepToolActive: () => set((s) => ({ keepToolActive: !s.keepToolActive })),
  toggleDrawingsLocked: () => set((s) => ({ drawingsLocked: !s.drawingsLocked })),
  toggleDrawingsHidden: () => set((s) => ({ drawingsHidden: !s.drawingsHidden })),
  toggleFavorite: (tool) =>
    set((s) => {
      const isFav = s.favoriteTools.includes(tool);
      const favoriteTools = isFav ? s.favoriteTools.filter((t) => t !== tool) : [...s.favoriteTools, tool];
      // favoriting a tool reveals the bar; unfavoriting the last one tucks it away again
      return { favoriteTools, favoritesBarOpen: favoriteTools.length > 0 };
    }),
  toggleFavoritesBar: () => set((s) => ({ favoritesBarOpen: !s.favoritesBarOpen })),
  setFavoritesBarPos: (pos) => set({ favoritesBarPos: pos }),
}));
