import { useEffect, useRef, useState, memo } from 'react';
import {
  useDrawingStore,
  CURSOR_MODES,
  TREND_TOOLS,
  SHAPE_TOOLS,
  ANNOTATION_TOOLS,
  POSITION_RANGE_TOOLS,
  type CursorMode,
  type TrendTool,
  type ShapeTool,
  type AnnotationTool,
  type PositionRangeTool,
  type DrawingTool,
} from '../../store/drawingStore';

interface ToolBtn {
  tool: DrawingTool;
  label: string;
  icon: React.ReactNode;
}

function CrossIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 0l16 12-7 1-4 8L4 0z" />
    </svg>
  );
}

function DemonstrationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round">
      <path d="M18 13l-7 7H6l-3-3a2 2 0 0 1 0-2.8L13 4.2a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L18 13z" />
      <line x1="9" y1="21" x2="21" y2="21" />
    </svg>
  );
}

function TrendLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="4" cy="20" r="2" fill="currentColor" />
      <circle cx="20" cy="4" r="2" fill="currentColor" />
    </svg>
  );
}

function RayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <circle cx="4" cy="20" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="20" x2="22" y2="2" />
    </svg>
  );
}

function ExtendedLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="1" y1="23" x2="23" y2="1" />
    </svg>
  );
}

function InfoLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="16" cy="16" r="4" />
      <line x1="16" y1="15" x2="16" y2="18" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="13" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrendAngleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="4" y1="20" x2="20" y2="4" />
      <line x1="4" y1="20" x2="16" y2="20" strokeDasharray="2 2" strokeWidth="1" />
      <path d="M 10 20 A 6 6 0 0 1 8.5 15.5" strokeWidth="1" />
    </svg>
  );
}

function HLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function HRayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <circle cx="4" cy="12" r="2" fill="currentColor" stroke="none" />
      <line x1="6" y1="12" x2="21" y2="12" strokeDasharray="3 2" />
    </svg>
  );
}

function VLineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="3 2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CrosslineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 2" />
      <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="3 2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="3" y1="19" x2="16" y2="6" />
      <line x1="8" y1="21" x2="21" y2="8" />
    </svg>
  );
}

function RegressionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <line x1="3" y1="19" x2="21" y2="7" strokeWidth="2" />
      <line x1="3" y1="14" x2="21" y2="2" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="3" y1="24" x2="21" y2="12" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

function FlatChannelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function DisjointChannelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="3" y1="16" x2="21" y2="8" />
      <line x1="4" y1="21" x2="14" y2="4" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <rect x="3" y="6" width="18" height="12" />
    </svg>
  );
}

function RotatedRectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <polygon points="7,4 21,9 17,20 3,15" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <ellipse cx="12" cy="12" rx="9" ry="7" />
    </svg>
  );
}

// Ellipse is functionally identical to Circle (both inscribe an ellipse in a
// bounding box) — a tilted oval keeps its toolbar icon visually distinct.
function EllipseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <ellipse cx="12" cy="12" rx="9" ry="6" transform="rotate(-25 12 12)" />
    </svg>
  );
}

function PathIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round">
      <polyline points="3,18 9,7 14,15 21,5" />
    </svg>
  );
}

// Polyline is Path's connected-segments geometry minus the trailing
// arrowhead — vertex dots make that distinction visible in the icon itself.
function PolylineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round">
      <polyline points="3,18 9,7 14,15 21,5" />
      <circle cx="3" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="21" cy="5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round">
      <polygon points="12,4 21,19 3,19" />
    </svg>
  );
}

// Arc: a single quadratic curve bulging one way — distinct from Curve's
// icon only by not being labeled "smooth curve"; kept visually near-identical
// since the two tools share the same underlying math.
function ArcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M4 18Q12 4 20 10" />
    </svg>
  );
}

function CurveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M4 16Q10 4 12 12T20 8" />
    </svg>
  );
}

// Double Curve: an S-shape — two opposing bulges, visually distinct from
// Arc/Curve's single bulge.
function DoubleCurveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M4 6Q12 6 12 12T20 18" />
    </svg>
  );
}

function ArrowMarkerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="20" x2="18" y2="6" />
      <polyline points="9,6 18,6 18,15" />
    </svg>
  );
}

function ArrowToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="20" x2="20" y2="4" />
      <polyline points="10,4 20,4 20,14" />
    </svg>
  );
}

function ArrowMarkUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="5" />
      <polyline points="6,11 12,5 18,11" />
    </svg>
  );
}

function ArrowMarkDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="4" x2="12" y2="19" />
      <polyline points="6,13 12,19 18,13" />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20c0-3 2-4 4-4s3 2 5 2 3-2 3-4-1-3-1-5c0-2 1-3 2-4" />
      <path d="M16 5c1-1 2-1 3 0s1 2 0 3l-6 6-3-3z" />
    </svg>
  );
}

// Highlighter: same freehand geometry as Brush, drawn as a chisel-tip marker
// pen to read visually distinct from Brush's paintbrush icon.
function HighlighterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3l4 4-9 9-5 1 1-5z" />
      <line x1="3" y1="21" x2="9" y2="21" strokeWidth="3" />
    </svg>
  );
}

function FibIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
      <line x1="3" y1="4"  x2="21" y2="4" />
      <line x1="3" y1="9"  x2="21" y2="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="3" y1="20" x2="21" y2="20" />
      <line x1="4" y1="4"  x2="4"  y2="20" strokeWidth="1" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="5" />
      <line x1="12" y1="5" x2="12" y2="19" />
    </svg>
  );
}

function PriceNoteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="17" r="2.5" />
      <line x1="6.5" y1="14.5" x2="16" y2="7" />
      <rect x="15" y="3" width="8" height="6" rx="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LongPositionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="7" fill="currentColor" opacity="0.35" stroke="none" />
      <rect x="3" y="14" width="18" height="7" fill="none" strokeOpacity="0.6" />
      <line x1="3" y1="10.5" x2="21" y2="10.5" strokeWidth="2.5" />
    </svg>
  );
}

function ShortPositionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="7" fill="none" strokeOpacity="0.6" />
      <rect x="3" y="14" width="18" height="7" fill="currentColor" opacity="0.35" stroke="none" />
      <line x1="3" y1="13.5" x2="21" y2="13.5" strokeWidth="2.5" />
    </svg>
  );
}

function PriceRangeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M6 4h3M6 4v16M6 20h3" />
      <line x1="6" y1="12" x2="16" y2="12" strokeDasharray="2 2" strokeWidth="1.5" />
      <rect x="15" y="9" width="7" height="6" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DateRangeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M4 6v3M4 6h16M20 6v3" />
      <line x1="12" y1="8" x2="12" y2="17" strokeDasharray="2 2" strokeWidth="1.5" />
      <rect x="8" y="17" width="8" height="6" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MeasureIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="8" rx="1" transform="rotate(-25 12 12)" />
      <path d="M7.5 9.5l1 1.6M10.8 8.2l1 1.6M14.1 6.9l1 1.6" transform="rotate(-25 12 12)" strokeWidth="1.5" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="7" />
      <line x1="21" y1="21" x2="15.5" y2="15.5" />
      <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
      <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 10.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.5l2 3.5H7l2-3.5Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-3.06 4.06M6.5 6.5C3.6 8.4 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 4.5-1.11" />
      <path d="M9.9 9.9a3 3 0 1 0 4.2 4.2" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 7.4-2" />
    </svg>
  );
}

function StarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6-6-3.4-6 3.4 1.4-6.6-5-4.6 6.7-.7L12 2.5Z" />
    </svg>
  );
}

function StarFilledIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6-6-3.4-6 3.4 1.4-6.6-5-4.6 6.7-.7L12 2.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

// Small folded-corner triangle — TradingView's indicator that a toolbar button
// has a flyout list of related tools. Hidden until the button is hovered.
function CornerArrow() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" className="absolute bottom-0.5 right-0.5 pointer-events-none">
      <path d="M0 6L6 6L6 0Z" fill="currentColor" />
    </svg>
  );
}

const CURSOR_ICON: Record<CursorMode, React.ReactNode> = {
  cross: <CrossIcon />,
  dot: <DotIcon />,
  arrow: <ArrowIcon />,
  demonstration: <DemonstrationIcon />,
  eraser: <EraserIcon />,
};

const CURSOR_ITEMS: { mode: CursorMode; label: string }[] = [
  { mode: 'cross', label: 'Cross' },
  { mode: 'dot', label: 'Dot' },
  { mode: 'arrow', label: 'Arrow' },
  { mode: 'eraser', label: 'Eraser' },
  { mode: 'demonstration', label: 'Demonstration' },
];

const TREND_ICON: Record<TrendTool, React.ReactNode> = {
  trendline: <TrendLineIcon />,
  ray: <RayIcon />,
  extendedLine: <ExtendedLineIcon />,
  infoLine: <InfoLineIcon />,
  trendAngle: <TrendAngleIcon />,
  hline: <HLineIcon />,
  hray: <HRayIcon />,
  vline: <VLineIcon />,
  crossline: <CrosslineIcon />,
  channel: <ChannelIcon />,
  regression: <RegressionIcon />,
  flatChannel: <FlatChannelIcon />,
  disjointChannel: <DisjointChannelIcon />,
};

// The flyout's two labeled sections — "Lines" (2-point/anchor line variants)
// and "Channels" (baseline + offset). TREND_ITEMS below is the flat
// concatenation, kept for ALL_TOOL_ICON/ALL_TOOL_LABEL (the Favorites bar
// doesn't care about section grouping).
const TREND_LINE_ITEMS: { tool: TrendTool; label: string }[] = [
  { tool: 'trendline',    label: 'Trend Line' },
  { tool: 'ray',          label: 'Ray' },
  { tool: 'infoLine',     label: 'Info Line' },
  { tool: 'extendedLine', label: 'Extended Line' },
  { tool: 'trendAngle',   label: 'Trend Angle' },
  { tool: 'hline',        label: 'Horizontal Line' },
  { tool: 'hray',         label: 'Horizontal Ray' },
  { tool: 'vline',        label: 'Vertical Line' },
  { tool: 'crossline',    label: 'Crossline' },
];

const TREND_CHANNEL_ITEMS: { tool: TrendTool; label: string }[] = [
  { tool: 'channel',         label: 'Parallel Channel' },
  { tool: 'regression',      label: 'Regression Trend' },
  { tool: 'flatChannel',     label: 'Flat Top/Bottom' },
  { tool: 'disjointChannel', label: 'Disjoint Channel' },
];

const TREND_ITEMS: { tool: TrendTool; label: string }[] = [...TREND_LINE_ITEMS, ...TREND_CHANNEL_ITEMS];

const SHAPE_ICON: Record<ShapeTool, React.ReactNode> = {
  rectangle: <RectIcon />,
  rotatedRectangle: <RotatedRectIcon />,
  circle: <CircleIcon />,
  ellipse: <EllipseIcon />,
  path: <PathIcon />,
  polyline: <PolylineIcon />,
  triangle: <TriangleIcon />,
  arc: <ArcIcon />,
  curve: <CurveIcon />,
  doubleCurve: <DoubleCurveIcon />,
  arrowMarker: <ArrowMarkerIcon />,
  arrowTool: <ArrowToolIcon />,
  arrowMarkUp: <ArrowMarkUpIcon />,
  arrowMarkDown: <ArrowMarkDownIcon />,
  brush: <BrushIcon />,
  highlighter: <HighlighterIcon />,
};

// The flyout's three labeled sections — "Shapes" (closed/geometric shapes +
// freehand line tools), "Brushes" (freehand strokes), "Arrows" (2-point +
// single-click arrow variants). SHAPE_ITEMS below is the flat concatenation,
// kept for ALL_TOOL_ICON/ALL_TOOL_LABEL/Favorites (same pattern as
// TREND_ITEMS = [...TREND_LINE_ITEMS, ...TREND_CHANNEL_ITEMS]).
const SHAPE_SHAPES_ITEMS: { tool: ShapeTool; label: string }[] = [
  { tool: 'rectangle',        label: 'Rectangle' },
  { tool: 'rotatedRectangle', label: 'Rotated Rectangle' },
  { tool: 'path',             label: 'Path' },
  { tool: 'circle',           label: 'Circle' },
  { tool: 'ellipse',          label: 'Ellipse' },
  { tool: 'polyline',         label: 'Polyline' },
  { tool: 'triangle',         label: 'Triangle' },
  { tool: 'arc',              label: 'Arc' },
  { tool: 'curve',            label: 'Curve' },
  { tool: 'doubleCurve',      label: 'Double Curve' },
];

const SHAPE_BRUSH_ITEMS: { tool: ShapeTool; label: string }[] = [
  { tool: 'brush',       label: 'Brush' },
  { tool: 'highlighter', label: 'Highlighter' },
];

const SHAPE_ARROW_ITEMS: { tool: ShapeTool; label: string }[] = [
  { tool: 'arrowTool',     label: 'Arrow' },
  { tool: 'arrowMarker',   label: 'Arrow Marker' },
  { tool: 'arrowMarkUp',   label: 'Arrow Mark Up' },
  { tool: 'arrowMarkDown', label: 'Arrow Mark Down' },
];

const SHAPE_ITEMS: { tool: ShapeTool; label: string }[] = [
  ...SHAPE_SHAPES_ITEMS, ...SHAPE_BRUSH_ITEMS, ...SHAPE_ARROW_ITEMS,
];

const ANNOTATION_ICON: Record<AnnotationTool, React.ReactNode> = {
  text: <TextIcon />,
  priceNote: <PriceNoteIcon />,
};

const ANNOTATION_ITEMS: { tool: AnnotationTool; label: string }[] = [
  { tool: 'text',      label: 'Text' },
  { tool: 'priceNote', label: 'Price Note' },
];

const POSITION_RANGE_ICON: Record<PositionRangeTool, React.ReactNode> = {
  longPosition: <LongPositionIcon />,
  shortPosition: <ShortPositionIcon />,
  priceRange: <PriceRangeIcon />,
  dateRange: <DateRangeIcon />,
};

const POSITION_RANGE_ITEMS: { tool: PositionRangeTool; label: string }[] = [
  { tool: 'longPosition',  label: 'Long Position' },
  { tool: 'shortPosition', label: 'Short Position' },
  { tool: 'priceRange',    label: 'Price Range' },
  { tool: 'dateRange',     label: 'Date Range' },
];

const FIB_TOOL: ToolBtn = { tool: 'fibonacci', label: 'Fibonacci Retracement', icon: <FibIcon /> };

const MEASURE_TOOLS: ToolBtn[] = [
  { tool: 'measure', label: 'Measure', icon: <MeasureIcon /> },
  { tool: 'zoomIn',  label: 'Zoom In', icon: <ZoomInIcon /> },
];

// Combined lookups covering every favoritable tool — used here for the
// dropdown rows and by the floating Favorites toolbar to render whatever's
// been starred without needing its own copy of every icon.
export const ALL_TOOL_ICON: Partial<Record<DrawingTool, React.ReactNode>> = {
  ...TREND_ICON,
  ...SHAPE_ICON,
  ...ANNOTATION_ICON,
  ...POSITION_RANGE_ICON,
  fibonacci: <FibIcon />,
};

export const ALL_TOOL_LABEL: Partial<Record<DrawingTool, string>> = {
  ...Object.fromEntries(TREND_ITEMS.map(({ tool, label }) => [tool, label])),
  ...Object.fromEntries(SHAPE_ITEMS.map(({ tool, label }) => [tool, label])),
  ...Object.fromEntries(ANNOTATION_ITEMS.map(({ tool, label }) => [tool, label])),
  ...Object.fromEntries(POSITION_RANGE_ITEMS.map(({ tool, label }) => [tool, label])),
  fibonacci: FIB_TOOL.label,
};

// One row in a dropdown flyout (Trend Line / Shapes / Annotation / Prediction
// & measurement) — a star toggles the tool in/out of the Favorites toolbar,
// kept as a separate button (not nested in the row's own button) so clicking
// it doesn't also select the tool.
function FavoritableMenuItem({
  tool, label, icon, active, favorite, onToggleFavorite, onSelect,
}: {
  tool: DrawingTool;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  onSelect: () => void;
}) {
  return (
    <div key={tool} className="w-full flex items-center gap-1 pl-3 pr-1 group/item hover:bg-[var(--accent)]">
      <button
        title={label}
        onClick={onSelect}
        className={`flex-1 flex items-center gap-2 py-2 text-sm text-left transition-colors group-hover/item:text-white ${active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="flex-1">{label}</span>
        {active && <span className="text-xs">✓</span>}
      </button>
      <button
        title={favorite ? 'Remove from Favorites' : 'Add to Favorites'}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className="flex-shrink-0 w-6 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#FFC107] group-hover/item:text-white"
      >
        {favorite ? <StarFilledIcon /> : <StarIcon />}
      </button>
    </div>
  );
}

export const DrawingToolbar = memo(function DrawingToolbar() {
  const {
    activeTool, lastCursorMode, lastTrendTool, lastShapeTool, lastAnnotationTool, lastPositionRangeTool,
    drawings, setTool, selectedId, deleteDrawing, clearAll,
    keepToolActive, drawingsLocked, drawingsHidden, toggleKeepToolActive, toggleDrawingsLocked, toggleDrawingsHidden,
    favoriteTools, favoritesBarOpen, toggleFavorite, toggleFavoritesBar,
  } = useDrawingStore();
  const [cursorDropdownOpen, setCursorDropdownOpen] = useState(false);
  const [trendDropdownOpen, setTrendDropdownOpen] = useState(false);
  const [shapeDropdownOpen, setShapeDropdownOpen] = useState(false);
  const [annotationDropdownOpen, setAnnotationDropdownOpen] = useState(false);
  const [positionRangeDropdownOpen, setPositionRangeDropdownOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const cursorGroupRef = useRef<HTMLDivElement>(null);
  const trendGroupRef = useRef<HTMLDivElement>(null);
  const shapeGroupRef = useRef<HTMLDivElement>(null);
  const annotationGroupRef = useRef<HTMLDivElement>(null);
  const positionRangeGroupRef = useRef<HTMLDivElement>(null);
  const deleteGroupRef = useRef<HTMLDivElement>(null);

  const isCursorGroupActive = (CURSOR_MODES as readonly string[]).includes(activeTool);
  const isTrendGroupActive = (TREND_TOOLS as readonly string[]).includes(activeTool);
  const isShapeGroupActive = (SHAPE_TOOLS as readonly string[]).includes(activeTool);
  const isAnnotationGroupActive = (ANNOTATION_TOOLS as readonly string[]).includes(activeTool);
  const isPositionRangeGroupActive = (POSITION_RANGE_TOOLS as readonly string[]).includes(activeTool);

  useEffect(() => {
    if (!cursorDropdownOpen && !trendDropdownOpen && !shapeDropdownOpen && !annotationDropdownOpen &&
        !positionRangeDropdownOpen && !deleteMenuOpen) return;
    const onOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cursorGroupRef.current && !cursorGroupRef.current.contains(target)) setCursorDropdownOpen(false);
      if (trendGroupRef.current && !trendGroupRef.current.contains(target)) setTrendDropdownOpen(false);
      if (shapeGroupRef.current && !shapeGroupRef.current.contains(target)) setShapeDropdownOpen(false);
      if (annotationGroupRef.current && !annotationGroupRef.current.contains(target)) setAnnotationDropdownOpen(false);
      if (positionRangeGroupRef.current && !positionRangeGroupRef.current.contains(target)) setPositionRangeDropdownOpen(false);
      if (deleteGroupRef.current && !deleteGroupRef.current.contains(target)) setDeleteMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutsideMouseDown);
    return () => document.removeEventListener('mousedown', onOutsideMouseDown);
  }, [cursorDropdownOpen, trendDropdownOpen, shapeDropdownOpen, annotationDropdownOpen, positionRangeDropdownOpen, deleteMenuOpen]);

  return (
    <div className="flex flex-col items-center gap-1 py-2 px-1 bg-[var(--bg-panel)] border-r border-[var(--border-color-soft)] select-none"
         style={{ width: 48 }}>
      <div className="relative group" ref={cursorGroupRef}>
        <button
          title="Cursor"
          onClick={() => { setTool(lastCursorMode); setCursorDropdownOpen(false); }}
          className={`
            relative w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${isCursorGroupActive
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
          `}
        >
          {CURSOR_ICON[lastCursorMode]}
        </button>
        <button
          aria-label="Cursor tool options"
          title="Cursor tool options"
          onClick={() => setCursorDropdownOpen((v) => !v)}
          className={`
            absolute bottom-0 right-0 w-3 h-3 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity
            ${isCursorGroupActive ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}
          `}
        >
          <CornerArrow />
        </button>

        {cursorDropdownOpen && (
          <div
            className="absolute left-full top-0 ml-1 py-1 overflow-hidden"
            style={{
              zIndex: 100,
              width: 180,
              background: 'var(--bg-panel-alt)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {CURSOR_ITEMS.map(({ mode, label }) => (
              <button
                key={mode}
                title={label}
                onClick={() => { setTool(mode); setCursorDropdownOpen(false); }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                  ${activeTool === mode ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
                  hover:bg-[var(--accent)] hover:text-white
                `}
              >
                <span className="flex-shrink-0">{CURSOR_ICON[mode]}</span>
                <span className="flex-1">{label}</span>
                {activeTool === mode && <span className="text-xs">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative group" ref={trendGroupRef}>
        <button
          title="Trend Line tools"
          onClick={() => { setTool(lastTrendTool); setTrendDropdownOpen(false); }}
          className={`
            relative w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${isTrendGroupActive
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
          `}
        >
          {TREND_ICON[lastTrendTool]}
        </button>
        <button
          aria-label="Trend Line tool options"
          title="Trend Line tool options"
          onClick={() => setTrendDropdownOpen((v) => !v)}
          className={`
            absolute bottom-0 right-0 w-3 h-3 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity
            ${isTrendGroupActive ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}
          `}
        >
          <CornerArrow />
        </button>

        {trendDropdownOpen && (
          <div
            className="absolute left-full top-0 ml-1 py-1 overflow-hidden"
            style={{
              zIndex: 100,
              width: 224,
              background: 'var(--bg-panel-alt)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] select-none">
              Lines
            </div>
            {TREND_LINE_ITEMS.map(({ tool, label }) => (
              <FavoritableMenuItem
                key={tool}
                tool={tool}
                label={label}
                icon={TREND_ICON[tool]}
                active={activeTool === tool}
                favorite={favoriteTools.includes(tool)}
                onToggleFavorite={() => toggleFavorite(tool)}
                onSelect={() => { setTool(tool); setTrendDropdownOpen(false); }}
              />
            ))}
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] select-none">
              Channels
            </div>
            {TREND_CHANNEL_ITEMS.map(({ tool, label }) => (
              <FavoritableMenuItem
                key={tool}
                tool={tool}
                label={label}
                icon={TREND_ICON[tool]}
                active={activeTool === tool}
                favorite={favoriteTools.includes(tool)}
                onToggleFavorite={() => toggleFavorite(tool)}
                onSelect={() => { setTool(tool); setTrendDropdownOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative group" ref={shapeGroupRef}>
        <button
          title="Shape tools"
          onClick={() => { setTool(lastShapeTool); setShapeDropdownOpen(false); }}
          className={`
            relative w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${isShapeGroupActive
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
          `}
        >
          {SHAPE_ICON[lastShapeTool]}
        </button>
        <button
          aria-label="Shape tool options"
          title="Shape tool options"
          onClick={() => setShapeDropdownOpen((v) => !v)}
          className={`
            absolute bottom-0 right-0 w-3 h-3 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity
            ${isShapeGroupActive ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}
          `}
        >
          <CornerArrow />
        </button>

        {shapeDropdownOpen && (
          <div
            className="absolute left-full top-0 ml-1 py-1 overflow-hidden"
            style={{
              zIndex: 100,
              width: 224,
              background: 'var(--bg-panel-alt)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] select-none">
              Shapes
            </div>
            {SHAPE_SHAPES_ITEMS.map(({ tool, label }) => (
              <FavoritableMenuItem
                key={tool}
                tool={tool}
                label={label}
                icon={SHAPE_ICON[tool]}
                active={activeTool === tool}
                favorite={favoriteTools.includes(tool)}
                onToggleFavorite={() => toggleFavorite(tool)}
                onSelect={() => { setTool(tool); setShapeDropdownOpen(false); }}
              />
            ))}
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] select-none">
              Brushes
            </div>
            {SHAPE_BRUSH_ITEMS.map(({ tool, label }) => (
              <FavoritableMenuItem
                key={tool}
                tool={tool}
                label={label}
                icon={SHAPE_ICON[tool]}
                active={activeTool === tool}
                favorite={favoriteTools.includes(tool)}
                onToggleFavorite={() => toggleFavorite(tool)}
                onSelect={() => { setTool(tool); setShapeDropdownOpen(false); }}
              />
            ))}
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] select-none">
              Arrows
            </div>
            {SHAPE_ARROW_ITEMS.map(({ tool, label }) => (
              <FavoritableMenuItem
                key={tool}
                tool={tool}
                label={label}
                icon={SHAPE_ICON[tool]}
                active={activeTool === tool}
                favorite={favoriteTools.includes(tool)}
                onToggleFavorite={() => toggleFavorite(tool)}
                onSelect={() => { setTool(tool); setShapeDropdownOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative group" ref={annotationGroupRef}>
        <button
          title="Annotation tools"
          onClick={() => { setTool(lastAnnotationTool); setAnnotationDropdownOpen(false); }}
          className={`
            relative w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${isAnnotationGroupActive
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
          `}
        >
          {ANNOTATION_ICON[lastAnnotationTool]}
        </button>
        <button
          aria-label="Annotation tool options"
          title="Annotation tool options"
          onClick={() => setAnnotationDropdownOpen((v) => !v)}
          className={`
            absolute bottom-0 right-0 w-3 h-3 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity
            ${isAnnotationGroupActive ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}
          `}
        >
          <CornerArrow />
        </button>

        {annotationDropdownOpen && (
          <div
            className="absolute left-full top-0 ml-1 py-1 overflow-hidden"
            style={{
              zIndex: 100,
              width: 200,
              background: 'var(--bg-panel-alt)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {ANNOTATION_ITEMS.map(({ tool, label }) => (
              <FavoritableMenuItem
                key={tool}
                tool={tool}
                label={label}
                icon={ANNOTATION_ICON[tool]}
                active={activeTool === tool}
                favorite={favoriteTools.includes(tool)}
                onToggleFavorite={() => toggleFavorite(tool)}
                onSelect={() => { setTool(tool); setAnnotationDropdownOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-6 border-t border-[var(--border-color-soft)] my-1" />

      <button
        title={FIB_TOOL.label}
        onClick={() => setTool(FIB_TOOL.tool)}
        className={`
          w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
          ${activeTool === FIB_TOOL.tool
            ? 'bg-[var(--accent)] text-white'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
        `}
      >
        {FIB_TOOL.icon}
      </button>

      <div className="relative group" ref={positionRangeGroupRef}>
        <button
          title="Prediction & measurement tools"
          onClick={() => { setTool(lastPositionRangeTool); setPositionRangeDropdownOpen(false); }}
          className={`
            relative w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${isPositionRangeGroupActive
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
          `}
        >
          {POSITION_RANGE_ICON[lastPositionRangeTool]}
        </button>
        <button
          aria-label="Prediction & measurement tool options"
          title="Prediction & measurement tool options"
          onClick={() => setPositionRangeDropdownOpen((v) => !v)}
          className={`
            absolute bottom-0 right-0 w-3 h-3 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity
            ${isPositionRangeGroupActive ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}
          `}
        >
          <CornerArrow />
        </button>

        {positionRangeDropdownOpen && (
          <div
            className="absolute left-full top-0 ml-1 py-1 overflow-hidden"
            style={{
              zIndex: 100,
              width: 210,
              background: 'var(--bg-panel-alt)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {POSITION_RANGE_ITEMS.map(({ tool, label }) => (
              <FavoritableMenuItem
                key={tool}
                tool={tool}
                label={label}
                icon={POSITION_RANGE_ICON[tool]}
                active={activeTool === tool}
                favorite={favoriteTools.includes(tool)}
                onToggleFavorite={() => toggleFavorite(tool)}
                onSelect={() => { setTool(tool); setPositionRangeDropdownOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-6 border-t border-[var(--border-color-soft)] my-1" />

      {MEASURE_TOOLS.map(({ tool, label, icon }) => (
        <button
          key={tool}
          title={label}
          onClick={() => setTool(tool)}
          className={`
            w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${activeTool === tool
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
          `}
        >
          {icon}
        </button>
      ))}

      <div className="w-6 border-t border-[var(--border-color-soft)] my-1" />

      <button
        title={keepToolActive ? 'Stay in Drawing Mode: on' : 'Stay in Drawing Mode: off'}
        onClick={toggleKeepToolActive}
        className={`
          w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
          ${keepToolActive ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
        `}
      >
        <PinIcon />
      </button>

      <button
        title={drawingsHidden ? 'Show All Drawings' : 'Hide All Drawings'}
        disabled={drawings.length === 0}
        onClick={toggleDrawingsHidden}
        className={`
          w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
          ${drawings.length === 0
            ? 'text-[var(--border-color)] cursor-not-allowed'
            : drawingsHidden ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
        `}
      >
        {drawingsHidden ? <EyeOffIcon /> : <EyeIcon />}
      </button>

      <button
        title={drawingsLocked ? 'Unlock All Drawings' : 'Lock All Drawings'}
        disabled={drawings.length === 0}
        onClick={toggleDrawingsLocked}
        className={`
          w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
          ${drawings.length === 0
            ? 'text-[var(--border-color)] cursor-not-allowed'
            : drawingsLocked ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
        `}
      >
        {drawingsLocked ? <LockIcon /> : <UnlockIcon />}
      </button>

      <button
        title={favoriteTools.length === 0 ? 'No favorites yet — star a tool from its options list' : favoritesBarOpen ? 'Hide Favorites Toolbar' : 'Show Favorites Toolbar'}
        disabled={favoriteTools.length === 0}
        onClick={toggleFavoritesBar}
        className={`
          w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
          ${favoriteTools.length === 0
            ? 'text-[var(--border-color)] cursor-not-allowed'
            : favoritesBarOpen ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}
        `}
      >
        {favoriteTools.length > 0 && favoritesBarOpen ? <StarFilledIcon size={20} /> : <StarIcon size={20} />}
      </button>

      <div className="w-6 border-t border-[var(--border-color-soft)] my-1" />

      <div className="relative group" ref={deleteGroupRef}>
        <button
          title={drawingsLocked ? 'Unlock drawings to delete' : 'Delete selected'}
          disabled={!selectedId || drawingsLocked}
          onClick={() => { if (selectedId) deleteDrawing(selectedId); setDeleteMenuOpen(false); }}
          className={`
            relative w-9 h-9 flex items-center justify-center rounded transition-colors [&_svg]:w-5 [&_svg]:h-5
            ${selectedId && !drawingsLocked
              ? 'text-[#f85149] hover:bg-[var(--bg-hover)]'
              : 'text-[var(--border-color)] cursor-not-allowed'}
          `}
        >
          <TrashIcon />
        </button>
        <button
          aria-label="Delete options"
          title="Delete options"
          disabled={drawings.length === 0}
          onClick={() => setDeleteMenuOpen((v) => !v)}
          className={`
            absolute bottom-0 right-0 w-3 h-3 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity
            ${drawings.length > 0 ? 'text-[var(--text-muted)] hover:text-[var(--text-primary)]' : 'text-transparent'}
          `}
        >
          <CornerArrow />
        </button>

        {deleteMenuOpen && (
          <div
            className="absolute left-full bottom-0 ml-1 py-1 overflow-hidden"
            style={{
              zIndex: 100,
              width: 180,
              background: 'var(--bg-panel-alt)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <button
              onClick={() => { if (selectedId) deleteDrawing(selectedId); setDeleteMenuOpen(false); }}
              disabled={!selectedId || drawingsLocked}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                ${selectedId && !drawingsLocked ? 'text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-white' : 'text-[var(--border-color)] cursor-not-allowed'}
              `}
            >
              Remove Selected
            </button>
            <button
              onClick={() => { clearAll(); setDeleteMenuOpen(false); }}
              disabled={drawings.length === 0 || drawingsLocked}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                ${drawings.length > 0 && !drawingsLocked ? 'text-[#f85149] hover:bg-[#f85149] hover:text-white' : 'text-[var(--border-color)] cursor-not-allowed'}
              `}
            >
              Remove All Drawings
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
