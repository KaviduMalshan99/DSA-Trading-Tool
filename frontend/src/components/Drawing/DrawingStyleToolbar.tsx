import { useCallback, useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useDrawingStore, type Drawing, type PositionDrawing } from '../../store/drawingStore';
import { priceToY, timeToX, computeParallelOffset } from './DrawingCanvas';
import { FibSettingsModal } from './FibSettingsModal';
import {
  MiniWidthPicker, MiniDashPicker, ColorOpacityButton, MiniColorSwatch, MiniSizePicker,
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

interface Props {
  sharedChartRef:  React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
}

export function DrawingStyleToolbar({ sharedChartRef, sharedSeriesRef }: Props) {
  const { drawings, selectedId, updateDrawing, deleteDrawing, drawingsHidden, drawingsLocked } = useDrawingStore();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuKind>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const selected = drawings.find((d) => d.id === selectedId);

  const recompute = useCallback(() => {
    const chart  = sharedChartRef.current;
    const series = sharedSeriesRef.current;
    if (!chart || !series || !selected) { setPos(null); return; }

    if (selected.type === 'trendline' || selected.type === 'arrow' || selected.type === 'priceNote') {
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

    if (selected.type === 'fibonacci') {
      const xH = timeToX(chart, selected.timeHigh), yH = priceToY(series, selected.priceHigh);
      const xL = timeToX(chart, selected.timeLow),  yL = priceToY(series, selected.priceLow);
      if (xH == null || yH == null || xL == null || yL == null) { setPos(null); return; }
      setPos({ x: (xH + xL) / 2, y: Math.min(yH, yL) - 46 });
      return;
    }

    if (selected.type === 'rectangle' || selected.type === 'circle') {
      const x1 = timeToX(chart, selected.time1), y1 = priceToY(series, selected.price1);
      const x2 = timeToX(chart, selected.time2), y2 = priceToY(series, selected.price2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setPos(null); return; }
      setPos({ x: (x1 + x2) / 2, y: Math.min(y1, y2) - 46 });
      return;
    }

    if (selected.type === 'priceRange' || selected.type === 'dateRange') {
      const x1 = timeToX(chart, selected.time1), y1 = priceToY(series, selected.price1);
      const x2 = timeToX(chart, selected.time2), y2 = priceToY(series, selected.price2);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setPos(null); return; }
      // clear the range label bubble rendered just above the box's top edge
      setPos({ x: (x1 + x2) / 2, y: Math.min(y1, y2) - 76 });
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
      const lines = computeParallelOffset(
        selected.price1, selected.time1, selected.price2, selected.time2,
        selected.price3, selected.time3, chart, series,
      );
      if (!lines) { setPos(null); return; }
      const minY = Math.min(lines.y1, lines.y2, lines.y1b, lines.y2b);
      setPos({ x: (lines.x1 + lines.x2) / 2, y: minY - 46 });
      return;
    }

    if (selected.type === 'path' || selected.type === 'brush') {
      const pts = selected.points
        .map((p) => ({ x: timeToX(chart, p.time), y: priceToY(series, p.price) }))
        .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
      if (pts.length === 0) { setPos(null); return; }
      const minY = Math.min(...pts.map((p) => p.y));
      const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      setPos({ x: avgX, y: minY - 46 });
      return;
    }

    if (selected.type === 'arrowMark') {
      const x = timeToX(chart, selected.time);
      const y = priceToY(series, selected.price);
      if (x == null || y == null) { setPos(null); return; }
      const size = selected.size ?? 20;
      setPos({ x, y: y - size - 34 });
      return;
    }

    if (selected.type === 'text') {
      const x = timeToX(chart, selected.time);
      const y = priceToY(series, selected.price);
      if (x == null || y == null) { setPos(null); return; }
      setPos({ x, y: y - 46 });
      return;
    }

    setPos(null);
  }, [selected, sharedChartRef, sharedSeriesRef]);

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
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', onOutsideMouseDown);
    return () => document.removeEventListener('mousedown', onOutsideMouseDown);
  }, [openMenu]);

  if (!pos || !selected || drawingsHidden || drawingsLocked) return null;
  if (selected.type !== 'trendline' && selected.type !== 'hline' && selected.type !== 'hray' &&
      selected.type !== 'vline' && selected.type !== 'fibonacci' && selected.type !== 'rectangle' &&
      selected.type !== 'rotatedRectangle' && selected.type !== 'circle' && selected.type !== 'path' &&
      selected.type !== 'brush' && selected.type !== 'arrow' && selected.type !== 'arrowMark' &&
      selected.type !== 'text' && selected.type !== 'priceNote' && selected.type !== 'priceRange' &&
      selected.type !== 'dateRange' && !isPositionDrawing(selected)) return null;

  const toolbarStyle: React.CSSProperties = {
    left: Math.max(4, pos.x),
    top: Math.max(4, pos.y),
    transform: 'translateX(-50%)',
    zIndex: 60,
    background: '#1E222D',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
    border: '1px solid #2a2e39',
  };

  if (selected.type === 'fibonacci') {
    const fib = selected;
    return (
      <>
        <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
          <button
            title="Settings"
            onClick={() => setOpenMenu('settings')}
            className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-white hover:bg-[#2a2e39]"
          >
            <GearIcon />
          </button>
          <div className="w-px h-5 bg-[#2a2e39] mx-0.5" />
          <button
            title="Delete"
            onClick={() => deleteDrawing(fib.id)}
            className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#2a2e39]"
          >
            <TrashIcon />
          </button>
        </div>
        {openMenu === 'settings' && <FibSettingsModal fib={fib} onClose={() => setOpenMenu(null)} />}
      </>
    );
  }

  if (selected.type === 'rectangle' || selected.type === 'rotatedRectangle' || selected.type === 'circle') {
    const shape = selected;
    const color = shape.color ?? '#2196F3';
    const width = shape.width ?? 1;
    const dash = shape.dash ?? 'solid';
    const opacity = shape.opacity ?? 100;
    const filled = shape.filled !== false;
    const fillColor = shape.fillColor ?? color;
    const fillOpacity = shape.fillOpacity ?? 20;

    return (
      <div ref={toolbarRef} data-drawing-overlay="style-toolbar" className="absolute flex items-center gap-0.5 py-1 px-1 select-none" style={toolbarStyle}>
        <ColorOpacityButton
          title="Border color"
          color={color} opacity={opacity}
          onColorChange={(c) => updateDrawing(shape.id, { color: c })}
          onOpacityChange={(o) => updateDrawing(shape.id, { opacity: o })}
        />
        <MiniWidthPicker width={width} onChange={(w) => updateDrawing(shape.id, { width: w })} />
        <MiniDashPicker dash={dash} onChange={(d) => updateDrawing(shape.id, { dash: d })} />

        <div className="w-px h-5 bg-[#2a2e39] mx-0.5" />

        <button
          title={filled ? 'Hide fill' : 'Show fill'}
          onClick={() => updateDrawing(shape.id, { filled: !filled })}
          className={`w-7 h-7 flex items-center justify-center rounded hover:bg-[#2a2e39] ${filled ? 'text-[#2196F3]' : 'text-[#8b949e]'}`}
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

        <div className="w-px h-5 bg-[#2a2e39] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(shape.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#2a2e39]"
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

        <div className="w-px h-5 bg-[#2a2e39] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(mark.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#2a2e39]"
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

        <div className="w-px h-5 bg-[#2a2e39] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(note.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#2a2e39]"
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

        <div className="w-px h-5 bg-[#2a2e39] mx-0.5" />

        <button
          title="Delete"
          onClick={() => deleteDrawing(pos2.id)}
          className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#2a2e39]"
        >
          <TrashIcon />
        </button>
      </div>
    );
  }

  // trendline / hline / hray / vline / path / brush / arrow / priceRange / dateRange — plain line style
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
      {selected.type !== 'brush' && !(selected.type === 'arrow' && selected.variant === 'marker') && (
        <MiniDashPicker dash={dash} onChange={(d) => updateDrawing(selected.id, { dash: d })} />
      )}

      <div className="w-px h-5 bg-[#2a2e39] mx-0.5" />

      <button
        title="Delete"
        onClick={() => deleteDrawing(selected.id)}
        className="w-7 h-7 flex items-center justify-center rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#2a2e39]"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
