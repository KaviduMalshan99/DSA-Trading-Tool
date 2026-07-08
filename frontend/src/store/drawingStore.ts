import { create } from 'zustand';

// The five cursor options exposed in the TradingView-style toolbar.
export type CursorMode = 'cross' | 'dot' | 'arrow' | 'demonstration' | 'eraser';
export const CURSOR_MODES: readonly CursorMode[] = ['cross', 'dot', 'arrow', 'demonstration', 'eraser'];

// The "Trend Line" group in TradingView's toolbar — grouped under one dropdown,
// same pattern as the cursor group.
export type TrendTool = 'trendline' | 'hline' | 'hray' | 'vline' | 'channel' | 'regression';
export const TREND_TOOLS: readonly TrendTool[] = ['trendline', 'hline', 'hray', 'vline', 'channel', 'regression'];

// The "Shapes" group — geometric shapes, arrows, and freehand tools, grouped
// under one dropdown just like Cursor and Trend Line.
// NOTE: the tool key is 'arrowTool', not 'arrow' — 'arrow' is already taken by
// the Cursor group's pointer style (CursorMode), and DrawingTool unions both,
// so reusing the name would make `activeTool === 'arrow'` ambiguous.
export type ShapeTool =
  | 'rectangle' | 'rotatedRectangle' | 'circle' | 'path'
  | 'arrowMarker' | 'arrowTool' | 'arrowMarkUp' | 'arrowMarkDown' | 'brush';
export const SHAPE_TOOLS: readonly ShapeTool[] = [
  'rectangle', 'rotatedRectangle', 'circle', 'path',
  'arrowMarker', 'arrowTool', 'arrowMarkUp', 'arrowMarkDown', 'brush',
];

// The "Annotation" group — Text and Price Note, grouped under one dropdown
// just like Cursor/Trend Line/Shapes.
export type AnnotationTool = 'text' | 'priceNote';
export const ANNOTATION_TOOLS: readonly AnnotationTool[] = ['text', 'priceNote'];

// Standalone action tools: Measure doesn't leave a persisted drawing behind
// (it's a transient readout cleared on tool change), and Zoom In performs an
// action (zooms the chart to the dragged range) then snaps back to the last
// cursor mode — neither belongs in the Drawing union below.
export type ActionTool = 'measure' | 'zoomIn';
export const ACTION_TOOLS: readonly ActionTool[] = ['measure', 'zoomIn'];

// The "Prediction & measurement" group — Long/Short Position projections and
// Price/Date Range brackets, grouped under one dropdown just like the others.
export type PositionRangeTool = 'longPosition' | 'shortPosition' | 'priceRange' | 'dateRange';
export const POSITION_RANGE_TOOLS: readonly PositionRangeTool[] = [
  'longPosition', 'shortPosition', 'priceRange', 'dateRange',
];

export type DrawingTool =
  | CursorMode | TrendTool | ShapeTool | AnnotationTool | ActionTool | PositionRangeTool | 'fibonacci';

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

export interface PathDrawing extends LineStyle {
  id: string;
  type: 'path';
  points: { price: number; time: number }[];
}

export interface BrushDrawing extends LineStyle {
  id: string;
  type: 'brush';
  points: { price: number; time: number }[];
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

export type Drawing =
  | TrendLineDrawing
  | HLineDrawing
  | HRayDrawing
  | VLineDrawing
  | RectangleDrawing
  | RotatedRectangleDrawing
  | CircleDrawing
  | PathDrawing
  | BrushDrawing
  | ArrowDrawing
  | ArrowMarkDrawing
  | TextDrawing
  | PriceNoteDrawing
  | PositionDrawing
  | PriceRangeDrawing
  | DateRangeDrawing
  | FibonacciDrawing
  | ChannelDrawing
  | RegressionDrawing;

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
  selectedId: string | null;

  setTool: (tool: DrawingTool) => void;
  addDrawing: (drawing: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  deleteDrawing: (id: string) => void;
  selectDrawing: (id: string | null) => void;
  clearAll: () => void;
  loadDrawings: (drawings: Drawing[]) => void;
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

export const useDrawingStore = create<DrawingState>((set) => ({
  activeTool: 'cross',
  lastCursorMode: 'cross',
  lastTrendTool: 'trendline',
  lastShapeTool: 'rectangle',
  lastAnnotationTool: 'text',
  lastPositionRangeTool: 'longPosition',
  magnetEnabled: false,
  keepToolActive: false,
  drawingsLocked: false,
  drawingsHidden: false,
  favoriteTools: [],
  favoritesBarOpen: false,
  favoritesBarPos: null,
  drawings: [],
  selectedId: null,

  setTool: (tool) =>
    set((s) => {
      const cursorGroup = isCursorMode(tool);
      const trendGroup = isTrendTool(tool);
      const shapeGroup = isShapeTool(tool);
      const annotationGroup = isAnnotationTool(tool);
      const positionRangeGroup = isPositionRangeTool(tool);
      // Re-clicking the active drawing tool deselects it back to the last cursor mode.
      const activeTool = !cursorGroup && s.activeTool === tool ? s.lastCursorMode : tool;
      return {
        activeTool,
        lastCursorMode: cursorGroup ? tool : s.lastCursorMode,
        lastTrendTool: trendGroup ? tool : s.lastTrendTool,
        lastShapeTool: shapeGroup ? tool : s.lastShapeTool,
        lastAnnotationTool: annotationGroup ? tool : s.lastAnnotationTool,
        lastPositionRangeTool: positionRangeGroup ? tool : s.lastPositionRangeTool,
        magnetEnabled: cursorGroup ? false : s.magnetEnabled,
      };
    }),
  addDrawing: (drawing) => set((s) => ({ drawings: [...s.drawings, drawing] })),
  updateDrawing: (id, patch) =>
    set((s) => ({
      drawings: s.drawings.map((d) => (d.id === id ? ({ ...d, ...patch } as Drawing) : d)),
    })),
  deleteDrawing: (id) =>
    set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id), selectedId: null })),
  selectDrawing: (id) => set({ selectedId: id }),
  clearAll: () => set({ drawings: [], selectedId: null }),
  loadDrawings: (drawings) => set({ drawings }),
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
