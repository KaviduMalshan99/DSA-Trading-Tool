import { useEffect, useRef, useState } from 'react';
import { type IChartApi } from 'lightweight-charts';
import { useIndicatorStore, MIN_SUBPANEL_RATIO, MAX_SUBPANEL_RATIO } from '../../store/indicatorStore';
import { RSIPanel } from '../Overlay/RSIPanel';
import { StochRSIPanel } from '../Overlay/StochRSIPanel';
import { MACDPanel } from '../Overlay/MACDPanel';

/** Smallest the sub-panel may be dragged, in px (converted to a ratio of the column height). */
const MIN_PANEL_PX = 80;

interface SubPanelSlotProps {
  /** The chart column (chart area + sub-panel); its height is the ratio's denominator. */
  wrapperRef:     React.RefObject<HTMLDivElement>;
  sharedChartRef: React.RefObject<IChartApi | null>;
}

interface DragState {
  startY:     number;
  startRatio: number;
  height:     number;
}

/**
 * Indicator sub-panel (RSI / Stoch RSI / MACD) plus the draggable divider
 * above it. Owns the subPanelRatio subscription so a drag re-renders only this
 * component — the chart area above is flex '1 1 0%' and simply takes the rest,
 * and each panel's own ResizeObserver re-fits its chart.
 */
export function SubPanelSlot({ wrapperRef, sharedChartRef }: SubPanelSlotProps) {
  const activeSubPanel       = useIndicatorStore((s) => s.activeSubPanel);
  const ratio                = useIndicatorStore((s) => s.subPanelRatio);
  const setSubPanelRatio     = useIndicatorStore((s) => s.setSubPanelRatio);
  const persistSubPanelRatio = useIndicatorStore((s) => s.persistSubPanelRatio);

  const [dragging, setDragging] = useState(false);
  const dragRef    = useRef<DragState | null>(null);
  const rafRef     = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const restoreBody = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // If the slot unmounts mid-drag (panel toggled off, timezone remount),
  // don't leave the page stuck with a row-resize cursor / no selection.
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (dragRef.current) restoreBody();
  }, []);

  if (!activeSubPanel) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startY:     e.clientY,
      startRatio: useIndicatorStore.getState().subPanelRatio,
      height:     wrapper.getBoundingClientRect().height,
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.height <= 0) return;
    const minR = Math.min(Math.max(MIN_PANEL_PX / drag.height, MIN_SUBPANEL_RATIO), MAX_SUBPANEL_RATIO);
    // Dragging up (smaller clientY) makes the panel taller.
    const next = drag.startRatio + (drag.startY - e.clientY) / drag.height;
    pendingRef.current = Math.min(Math.max(next, minR), MAX_SUBPANEL_RATIO);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current !== null) setSubPanelRatio(pendingRef.current);
      });
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // Flush any frame still queued so the persisted value is the final one.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingRef.current !== null) {
      setSubPanelRatio(pendingRef.current);
      pendingRef.current = null;
    }
    dragRef.current = null;
    restoreBody();
    setDragging(false);
    persistSubPanelRatio();
  };

  return (
    <>
      {/* Divider — 6px hit area, 1px visible line (highlighted on hover/drag). */}
      <div
        className="group relative shrink-0 w-full"
        style={{ height: 6, cursor: 'row-resize', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px ${
            dragging ? 'bg-[var(--accent)]' : 'bg-[var(--border-color-soft)] group-hover:bg-[var(--accent)]'
          }`}
        />
      </div>

      {/* Keyed by indicator so a swap fully remounts (fresh chart, clean teardown). */}
      <div
        key={activeSubPanel}
        className="relative"
        style={{ flex: `0 0 ${ratio * 100}%`, minHeight: 0 }}
      >
        {activeSubPanel === 'rsi' && <RSIPanel sharedChartRef={sharedChartRef} />}
        {activeSubPanel === 'stochRsi' && <StochRSIPanel sharedChartRef={sharedChartRef} />}
        {activeSubPanel === 'macd' && <MACDPanel sharedChartRef={sharedChartRef} />}
      </div>
    </>
  );
}
