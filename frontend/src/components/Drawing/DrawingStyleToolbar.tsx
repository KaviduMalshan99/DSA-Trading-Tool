import { useCallback, useEffect, useRef, useState, memo } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  useDrawingStore, resizeTableCells, TABLE_MAX_DIM, type Drawing, type PositionDrawing,
} from '../../store/drawingStore';
import { useMarketStore } from '../../store/marketStore';
import { priceToY, timeToX, computeParallelOffset, computeRegression, getRotatedRectCorners } from './DrawingCanvas';
import { FibSettingsModal } from './FibSettingsModal';
import {
  MiniWidthPicker, MiniDashPicker, ColorOpacityButton, MiniColorSwatch, MiniSizePicker, COLOR_POPOVER_OVERLAY,
  FillToggleIcon, TrashIcon, GearIcon,
} from './drawingStyleShared';

type MenuKind = 'color' | 'width' | 'dash' | 'settings' | 'fill' | null;

// PositionDrawing's discriminant is a two-literal union ('longPosition' |
// 'shortPosition') on a single interface, which TS's control-flow narrowing
// doesn't fully eliminate from the remaining union after an `a === 'x' || a
// === 'y'` early return — an explicit type predicate sidesteps that.
function isPositionDrawing(d: Drawing): d is PositionDrawing {
  return d.type === 'longPosition' || d.type === 'shortPosition';
}

type DrawingType = Drawing['type'];
type DrawingOfType<T extends DrawingType> = Extract<Drawing, { type: T }>;

// Type-guard membership test over a readonly type list — narrows `d` to the
// union members whose `type` is in `types` (and excludes them on false), so
// long `a === 'x' || a === 'y' || ...` chains stay type-safe as they grow.
function isDrawingOfType<T extends DrawingType>(d: Drawing, types: readonly T[]): d is DrawingOfType<T> {
  return (types as readonly DrawingType[]).includes(d.type);
}

// Toolbar anchor-shape groups (positioning only — controls are picked below).
const TWO_POINT_TYPES = [
  'trendline', 'arrow', 'priceNote',
  'ray', 'extendedLine', 'infoLine', 'trendAngle',
  'fibTimeZone', 'fibSpeedFan', 'fibCircles', 'fibSpiral', 'fibSpeedArcs',
  'gannFan', 'gannBox', 'gannSquare',
  'cyclicLines', 'timeCycles', 'sineLine', 'barsPattern',
] as const;
const THREE_POINT_TYPES = [
  'trendFibExtension', 'sector', 'positionForecast', 'triangle',
  'fibWedge', 'pitchfan', 'arc', 'curve', 'doubleCurve',
] as const;
const POINTS_ARRAY_TYPES = [
  'path', 'brush',
  'polyline', 'highlighter', 'abcd', 'xabcd', 'cypher', 'threeDrives', 'headShoulders',
] as const;
const SINGLE_ANCHOR_TYPES = ['text', 'crossline'] as const;

// Non-LineStyle single-anchor stamps with their own control branches below.
// Defaults mirror the render branches in DrawingCanvas.tsx.
const STAMP_TYPES = ['pin', 'flagMark'] as const; // color + size
const COLOR_ONLY_TYPES = ['priceLabel', 'signpost', 'ghostFeed', 'note', 'callout', 'comment'] as const;
const STAMP_DEFAULT_COLOR: Record<(typeof STAMP_TYPES)[number] | (typeof COLOR_ONLY_TYPES)[number], string> = {
  pin: '#F23645', flagMark: '#2196F3',
  priceLabel: '#2196F3', signpost: '#2196F3', ghostFeed: '#9E9E9E',
  note: '#F4B400', callout: '#2196F3', comment: '#2196F3',
};

// Parallel Channel / Flat Top-Bottom share the shape controls but their
// renderer defaults differ from the rectangle's (width 1.5, fill 8%).
const CHANNEL_TYPES = ['channel', 'flatChannel'] as const;

// Every drawing type the style toolbar is shown for. Anything not listed here
// (and not a fib/shape/stamp/table/position with its own branch) falls through
// to the plain LineStyle controls, so additions must extend LineStyle.
const STYLE_TOOLBAR_TYPES = [
  ...TWO_POINT_TYPES, ...THREE_POINT_TYPES, ...POINTS_ARRAY_TYPES, ...SINGLE_ANCHOR_TYPES,
  'hline', 'hray', 'vline',
  'fibonacci', 'fibExtension', 'fibChannel',
  'rectangle', 'rotatedRectangle', 'circle', 'ellipse',
  'arrowMark', 'table',
  ...STAMP_TYPES, ...COLOR_ONLY_TYPES, 'anchoredVwap',
  'priceRange', 'dateRange', 'datePriceRange',
  'longPosition', 'shortPosition',
  'disjointChannel', ...CHANNEL_TYPES, 'regression',
] as const;

interface Props {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export const DrawingStyleToolbar = memo(function DrawingStyleToolbar({ sharedChartRef, sharedSeriesRef }: Props) {
  const { drawings, selectedIds, updateDrawing, deleteDrawing, drawingsHidden, drawingsLocked } = useDrawingStore();
  // Toolbar only targets a single selection; hidden for 0 or 2+.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuKind>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const selected = drawings.find((d) => d.id === selectedId);
  const candles = useMarketStore((s) => s.candles);

  const recompute = useCallback(() => {
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    if (!chart || !series || !selected) { setPos(null); return; }

    if (isDrawingOfType(selected, TWO_POINT_TYPES)) {
      const x1 = timeToX(chart, selected.time1);
      const y1 = priceToY(series, selected.price1);
      const x2 = timeToX(chart, selected.time2);
      const y2 = priceToY(series, selected.price2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setPos(null); return; }
      setPos({ x: (x1 + x2) / 2, y: Math.min(y1, y2) - 46 });
      return;
    }

    if (selected.type === 'hline') {
      const y = priceToY(series, selected.price);
      const range = chart.timeScale().getVisibleRange();
      if (y == null || !range) { setPos(null); return; }
      const xL = timeToX(chart, range.from as unknown as number);
      const xR = timeToX(chart, range.to as unknown as number);
      if (xL == null || xR == null) { setPos(null); return; }
      setPos({ x: (xL + xR) / 2, y: y - 46 });
      return;
    }

    if (selected.type === 'hray') {
      const y  = priceToY(series, selected.price);
      const xA = timeToX(chart, selected.time);
      const range = chart.timeScale().getVisibleRange();
      if (y == null || xA == null || !range) { setPos(null); return; }
      const xR = timeToX(chart, range.to as unknown as number);
      if (xR == null) { setPos(null); return; }
      setPos({ x: (Math.max(xA, 0) + xR) / 2, y: y - 46 });
      return;
    }

    if (selected.type === 'vline') {
      const x = timeToX(chart, selected.time);
      if (x == null) { setPos(null); return; }
      setPos({ x, y: 12 });
      return;
    }

    if (selected.type === 'fibonacci' || selected.type === 'fibExtension') {
      const xH = timeToX(chart, selected.timeHigh), yH = priceToY(series, selected.priceHigh);
      const xL = timeToX(chart, selected.timeLow),  yL = priceToY(series, selected.priceLow);
      if (xH == null || yH == null || xL == null || yL == null) { setPos(null); return; }
      setPos({ x: (xH + xL) / 2, y: Math.min(yH, yL) - 46 });
      return;
    }

    if (isDrawingOfType(selected, THREE_POINT_TYPES)) {
      const x1 = timeToX(chart, selected.time1), y1 = priceToY(series, selected.price1);
      const x2 = timeToX(chart, selected.time2), y2 = priceToY(series, selected.price2);
      const x3 = timeToX(chart, selected.time3), y3 = priceToY(series, selected.price3);
      if (x1 == null || y1 == null || x2 == null || y2 == null || x3 == null || y3 == null) { setPos(null); return; }
      setPos({ x: (x1 + x2 + x3) / 3, y: Math.min(y1, y2, y3) - 46 });
      return;
    }

    if (selected.type === 'disjointChannel') {
      const xs = [
        timeToX(chart, selected.timeA1), timeToX(chart, selected.timeA2),
        timeToX(chart, selected.timeB1), timeToX(chart, selected.timeB2),
      ];
      const ys = [
        priceToY(series, selected.priceA1), priceToY(series, selected.priceA2),
        priceToY(series, selected.priceB1), priceToY(series, selected.priceB2),
      ];
      if (xs.some((v) => v == null) || ys.some((v) => v == null)) { setPos(null); return; }
      const xn = xs as number[], yn = ys as number[];
      setPos({ x: xn.reduce((s, v) => s + v, 0) / 4, y: Math.min(...yn) - 46 });
      return;
    }

    if (selected.type === 'fibChannel' || selected.type === 'channel') {
      const lines = computeParallelOffset(
        selected.price1, selected.time1, selected.price2, selected.time2,
        selected.price3, selected.time3, chart, series,
      );
      if (!lines) { setPos(null); return; }
      const minY = Math.min(lines.y1, lines.y2, lines.y1b, lines.y2b);
      setPos({ x: (lines.x1 + lines.x2) / 2, y: minY - 46 });
      return;
    }

    if (selected.type === 'flatChannel') {
      // price2 is unused geometry (only time2 matters), so anchor on the two
      // horizontal lines at price1/price3 instead of computeParallelOffset.
      const x1 = timeToX(chart, selected.time1), x2 = timeToX(chart, selected.time2);
      const y1 = priceToY(series, selected.price1), y3 = priceToY(series, selected.price3);
      if (x1 == null || x2 == null || y1 == null || y3 == null) { setPos(null); return; }
      setPos({ x: (x1 + x2) / 2, y: Math.min(y1, y3) - 46 });
      return;
    }

    if (selected.type === 'regression') {
      const reg = computeRegression(candles, selected.time1, selected.time2);
      const xS = reg ? timeToX(chart, reg.startTime) : null;
      const xE = reg ? timeToX(chart, reg.endTime) : null;
      const yUS = reg ? priceToY(series, reg.upperStart) : null;
      const yUE = reg ? priceToY(series, reg.upperEnd) : null;
      if (xS == null || xE == null) {
        // regression unavailable (no candles in range) — fall back to the
        // anchor times so the toolbar stays reachable for delete
        const x1 = timeToX(chart, selected.time1), x2 = timeToX(chart, selected.time2);
        if (x1 == null || x2 == null) { setPos(null); return; }
        setPos({ x: (x1 + x2) / 2, y: 12 });
        return;
      }
      setPos({ x: (xS + xE) / 2, y: yUS == null || yUE == null ? 12 : Math.min(yUS, yUE) - 46 });
      return;
    }

    if (selected.type === 'rectangle' || selected.type === 'circle' || selected.type === 'ellipse') {
      const x1 = timeToX(chart, selected.time1), y1 = priceToY(series, selected.price1);
      const x2 = timeToX(chart, selected.time2), y2 = priceToY(series, selected.price2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setPos(null); return; }
      setPos({ x: (x1 + x2) / 2, y: Math.min(y1, y2) - 46 });
      return;
    }

    if (selected.type === 'table') {
      const x1 = timeToX(chart, selected.time1), y1 = priceToY(series, selected.price1);
      const x2 = timeToX(chart, selected.time2), y2 = priceToY(series, selected.price2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setPos(null); return; }
      setPos({ x: (x1 + x2) / 2, y: Math.min(y1, y2) - 46 });
      return;
    }

    if (selected.type === 'priceRange' || selected.type === 'dateRange' || selected.type === 'datePriceRange') {
      const x1 = timeToX(chart, selected.time1), y1 = priceToY(series, selected.price1);
      const x2 = timeToX(chart, selected.time2), y2 = priceToY(series, selected.price2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setPos(null); return; }
      // clear the range label bubble rendered just above the box's top edge
      // (Date & Price Range's label is two lines tall, so it needs more clearance)
      const labelClearance = selected.type === 'datePriceRange' ? 88 : 76;
      setPos({ x: (x1 + x2) / 2, y: Math.min(y1, y2) - labelClearance });
      return;
    }

    if (selected.type === 'longPosition' || selected.type === 'shortPosition') {
      const x1 = timeToX(chart, selected.time1), x2 = timeToX(chart, selected.time2);
      const yTarget = priceToY(series, selected.targetPrice);
      const yStop = priceToY(series, selected.stopPrice);
      if (x1 == null || x2 == null || yTarget == null || yStop == null) { setPos(null); return; }
      setPos({ x: (x1 + x2) / 2, y: Math.min(yTarget, yStop) - 46 });
      return;
    }

    if (selected.type === 'rotatedRectangle') {
      // from the 4 corners — for legacy (parallelogram) drawings the corner
      // x-mean is (x1 + x2) / 2 and the min y is unchanged, as before
      const corners = getRotatedRectCorners(selected, chart, series);
      if (!corners) { setPos(null); return; }
      const minY = Math.min(...corners.map((c) => c.y));
      const avgX = corners.reduce((s, c) => s + c.x, 0) / 4;
      setPos({ x: avgX, y: minY - 46 });
      return;
    }

    if (isDrawingOfType(selected, POINTS_ARRAY_TYPES)) {
      const pts = selected.points
        .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
        .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
      if (pts.length === 0) { setPos(null); return; }
      const minY = Math.min(...pts.map((p) => p.y));
      const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      setPos({ x: avgX, y: minY - 46 });
      return;
    }

    if (selected.type === 'arrowMark' || isDrawingOfType(selected, STAMP_TYPES)) {
      const x = timeToX(chart, selected.time);
      const y = priceToY(series, selected.price);
      if (x == null || y == null) { setPos(null); return; }
      const size = selected.size ?? 20;
      setPos({ x, y: y - size - 34 });
      return;
    }

    if (isDrawingOfType(selected, SINGLE_ANCHOR_TYPES) || isDrawingOfType(selected, COLOR_ONLY_TYPES) ||
        selected.type === 'anchoredVwap') {
      const x = timeToX(chart, selected.time);
      const y = priceToY(series, selected.price);
      if (x == null || y == null) { setPos(null); return; }
      setPos({ x, y: y - 46 });
      return;
    }

    setPos(null);
  }, [selected, candles, sharedChartRef, sharedSeriesRef]);

  useEffect(() => {
    recompute();
    const chart = sharedChartRef.current;
    if (!chart) return;
    const cb = () => recompute();
    chart.timeScale().subscribeVisibleLogicalRangeChange(cb);
    chart.subscribeCrosshairMove(cb);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(cb);
      chart.unsubscribeCrosshairMove(cb);
    };
  }, [recompute, sharedChartRef]);

  useEffect(() => { setOpenMenu(null); }, [selectedId]);

  useEffect(() => {
    if (!openMenu) return;
    const onOutsideMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toolbarRef.current?.contains(target)) return;
      // the Fib settings modal renders as a sibling (fixed to the viewport, not
      // anchored under the toolbar), so clicks inside it must not count as "outside"
      if (target instanceof Element && target.closest('[data-drawing-overlay="fib-modal"]')) return;
      // same for the color popovers, which are portaled to <body>
      if (target instanceof Element && target.closest(`[data-drawing-overlay="${COLOR_POPOVER_OVERLAY}"]`)) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', onOutsideMouseDown);
    return () => document.removeEventListener('mousedown', onOutsideMouseDown);
  }, [openMenu]);

  if (!pos || !selected || drawingsHidden || drawingsLocked) return null;
  if (!isDrawingOfType(selected, STYLE_TOOLBAR_TYPES)) return null;

  const toolbarStyle: React.CSSProperties = {
    left: Math.max(4, pos.x),
    top: Math.max(4, pos.y),
    transform: 'translateX(-50%)',
    zIndex: 60,
    background: 'var(--bg-panel-alt)',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
    border: '1px solid var(--border-color-softer)',
  };

  if (selected.type === 'fibonacci' || selected.type === 'fibExtension' ||
      selected.type === 'trendFibExtension' || selected.type === 'fibChannel') {
    const fib = selected;
    return (
      <>
        <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
          <button
            title="Settings"
            onClick={() => setOpenMenu('settings')}
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-alt)]"
          >
            <GearIcon />
          </button>
          <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />
          <button
            title="Delete"
            onClick={() => deleteDrawing(fib.id)}
            className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
          >
            <TrashIcon />
          </button>
        </div>
        {openMenu === 'settings' && <FibSettingsModal fib={fib} onClose={() => setOpenMenu(null)} />}
      </>
    );
  }

  if (selected.type === 'rectangle' || selected.type === 'rotatedRectangle' || selected.type === 'circle' ||
      selected.type === 'sector' || selected.type === 'positionForecast' ||
      selected.type === 'ellipse' || selected.type === 'triangle' || selected.type === 'arc' ||
      isDrawingOfType(selected, CHANNEL_TYPES)) {
    const shape = selected;
    const isChannel = isDrawingOfType(shape, CHANNEL_TYPES);
    // Arc (the only fillable THREE_POINT_TYPES member) draws at width 1.5 and
    // its fill is opt-in (filled === true), unlike the shapes' filled !== false.
    const isArc = shape.type === 'arc';
    const color = shape.color ?? '#2196F3';
    const width = shape.width ?? (isChannel || isArc ? 1.5 : 1);
    const dash = shape.dash ?? 'solid';
    const opacity = shape.opacity ?? 100;
    const filled = isArc ? shape.filled === true : shape.filled !== false;
    const fillColor = shape.fillColor ?? color;
    const fillOpacity = shape.fillOpacity ?? (isChannel ? 8 : 20);

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <ColorOpacityButton
          title={isChannel || isArc ? 'Line color' : 'Border color'}
          color={color} opacity={opacity}
          onColorChange={(c) => updateDrawing(shape.id, { color: c })}
          onOpacityChange={(o) => updateDrawing(shape.id, { opacity: o })}
        />
        <MiniWidthPicker width={width} onChange={(w) => updateDrawing(shape.id, { width: w })} />
        <MiniDashPicker dash={dash} onChange={(d) => updateDrawing(shape.id, { dash: d })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title={filled ? 'Hide fill' : 'Show fill'}
          onClick={() => updateDrawing(shape.id, { filled: !filled })}
          className={`w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-hover-alt)] ${filled ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
        >
          <FillToggleIcon filled={filled} />
        </button>
        {filled && (
          <ColorOpacityButton
            title="Fill color"
            color={fillColor} opacity={fillOpacity}
            onColorChange={(c) => updateDrawing(shape.id, { fillColor: c })}
            onOpacityChange={(o) => updateDrawing(shape.id, { fillOpacity: o })}
          />
        )}

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(shape.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  if (selected.type === 'arrowMark') {
    const mark = selected;
    const defaultColor = mark.variant === 'up' ? '#089981' : '#F23645';
    const color = mark.color ?? defaultColor;
    const size  = mark.size  ?? 20;

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <MiniColorSwatch color={color} onChange={(c) => updateDrawing(mark.id, { color: c })} />
        <MiniSizePicker size={size} onChange={(s) => updateDrawing(mark.id, { size: s })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(mark.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  if (isDrawingOfType(selected, STAMP_TYPES)) {
    const mark = selected;
    const color = mark.color ?? STAMP_DEFAULT_COLOR[mark.type];
    const size  = mark.size  ?? 20;

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <MiniColorSwatch color={color} onChange={(c) => updateDrawing(mark.id, { color: c })} />
        <MiniSizePicker size={size} onChange={(s) => updateDrawing(mark.id, { size: s })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(mark.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  // Label/text-box stamps with only a color field (no size/fontSize).
  if (isDrawingOfType(selected, COLOR_ONLY_TYPES)) {
    const stamp = selected;
    const color = stamp.color ?? STAMP_DEFAULT_COLOR[stamp.type];

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <MiniColorSwatch color={color} onChange={(c) => updateDrawing(stamp.id, { color: c })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(stamp.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  // Anchored VWAP has color + width only (no dash/opacity), so it can't use
  // the LineStyle fallback.
  if (selected.type === 'anchoredVwap') {
    const vwap = selected;
    const color = vwap.color ?? '#f0b90b';
    const width = vwap.width ?? 2;

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <MiniColorSwatch color={color} onChange={(c) => updateDrawing(vwap.id, { color: c })} />
        <MiniWidthPicker width={width} onChange={(w) => updateDrawing(vwap.id, { width: w })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(vwap.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  // Regression Trend: one color drives all three lines + both band fills;
  // width applies to the median only. No dash/opacity, so no LineStyle fallback.
  if (selected.type === 'regression') {
    const reg = selected;
    const color = reg.color ?? '#2196F3';
    const width = reg.width ?? 1.5;

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <MiniColorSwatch color={color} onChange={(c) => updateDrawing(reg.id, { color: c })} />
        <MiniWidthPicker width={width} onChange={(w) => updateDrawing(reg.id, { width: w })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(reg.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  if (selected.type === 'text') {
    const note = selected;
    const color = note.color ?? '#d1d4dc';
    const fontSize = note.fontSize ?? 14;

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <MiniColorSwatch color={color} onChange={(c) => updateDrawing(note.id, { color: c })} />
        <MiniSizePicker size={fontSize} onChange={(s) => updateDrawing(note.id, { fontSize: s })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(note.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  if (selected.type === 'table') {
    const table = selected;
    // Each grid button reads the latest table from the store (not this
    // render's copy) and applies one updateDrawing — one undo step.
    const resize = (dRows: number, dCols: number) => {
      const t = useDrawingStore.getState().drawings.find((d) => d.id === table.id);
      if (t?.type !== 'table') return;
      const rows = Math.min(TABLE_MAX_DIM, Math.max(1, t.rows + dRows));
      const cols = Math.min(TABLE_MAX_DIM, Math.max(1, t.cols + dCols));
      if (rows === t.rows && cols === t.cols) return;
      updateDrawing(t.id, { rows, cols, cells: resizeTableCells(t.cells, t.rows, t.cols, rows, cols) });
    };
    const gridBtn = 'h-7 px-1.5 flex items-center justify-center rounded text-[11px] font-medium text-[var(--text-muted)] ' +
      'hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-alt)] disabled:opacity-40 disabled:pointer-events-none';

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <span title="Grid color" className="px-1">
          <MiniColorSwatch color={table.color ?? '#2196F3'} onChange={(c) => updateDrawing(table.id, { color: c })} />
        </span>
        <span title="Text color" className="px-1">
          <MiniColorSwatch color={table.textColor ?? '#d1d4dc'} onChange={(c) => updateDrawing(table.id, { textColor: c })} />
        </span>

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button title="Add row" className={gridBtn} disabled={table.rows >= TABLE_MAX_DIM} onClick={() => resize(1, 0)}>+Row</button>
        <button title="Remove last row" className={gridBtn} disabled={table.rows <= 1} onClick={() => resize(-1, 0)}>−Row</button>
        <button title="Add column" className={gridBtn} disabled={table.cols >= TABLE_MAX_DIM} onClick={() => resize(0, 1)}>+Col</button>
        <button title="Remove last column" className={gridBtn} disabled={table.cols <= 1} onClick={() => resize(0, -1)}>−Col</button>

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(table.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  if (isPositionDrawing(selected)) {
    const pos2 = selected;
    const profitColor = pos2.profitColor ?? '#089981';
    const lossColor = pos2.lossColor ?? '#F23645';

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <MiniColorSwatch color={profitColor} onChange={(c) => updateDrawing(pos2.id, { profitColor: c })} />
        <MiniColorSwatch color={lossColor} onChange={(c) => updateDrawing(pos2.id, { lossColor: c })} />

        <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(pos2.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  // Everything left is a plain LineStyle drawing (lines, ranges, paths/brushes,
  // fib/gann/cycle line tools, patterns, crossline, disjointChannel). The field
  // reads below only type-check because every remaining member extends LineStyle.
  const defaultColor = '#2196F3';
  const color   = selected.color   ?? defaultColor;
  const width   = selected.width   ?? 1.5;
  const dash    = selected.dash    ?? 'solid';
  const opacity = selected.opacity ?? 100;

  return (
    <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
      <ColorOpacityButton
        color={color} opacity={opacity}
        onColorChange={(c) => updateDrawing(selected.id, { color: c })}
        onOpacityChange={(o) => updateDrawing(selected.id, { opacity: o })}
      />
      {!(selected.type === 'arrow' && selected.variant === 'marker') && (
        <MiniWidthPicker width={width} onChange={(w) => updateDrawing(selected.id, { width: w })} />
      )}
      {selected.type !== 'brush' && selected.type !== 'highlighter' && !(selected.type === 'arrow' && selected.variant === 'marker') && (
        <MiniDashPicker dash={dash} onChange={(d) => updateDrawing(selected.id, { dash: d })} />
      )}

      <div className="w-px h-5 bg-[var(--border-color-softer)] mx-0.5" />

      <button
        title="Delete"
        onClick={() => deleteDrawing(selected.id)}
        className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[#f85149] hover:bg-[var(--bg-hover-alt)]"
      >
        <TrashIcon />
      </button>
    </div>
  );
});
