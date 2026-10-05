import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useChartStore } from '../../store/chartStore';
import { useDrawingStore } from '../../store/drawingStore';
import { useIndicatorStore } from '../../store/indicatorStore';
import { useMarketStore } from '../../store/marketStore';
import { useReplayStore } from '../../store/replayStore';
import { pasteDrawings } from '../Drawing/DrawingCanvas';
import { nudgeRedraw } from './PriceScaleButtons';

interface ChartContextMenuProps {
  sharedChartRef: React.RefObject<IChartApi | null>;
  sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null>;
  chartAreaRef: React.RefObject<HTMLDivElement>;
}

// Same default view TradingChart uses on symbol load.
const RESET_VISIBLE_BARS = 100;
const RESET_RIGHT_MARGIN = 5;
// Keep the menu this far from the viewport edges.
const EDGE_GAP = 4;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * TradingView "Reset chart view": auto-scale the price axis and reframe the
 * time axis exactly as a fresh load does. View-only — no store writes.
 * Sub-panels follow via their logical-range subscription.
 */
function resetChartView(chart: IChartApi | null) {
  if (!chart) return;
  chart.priceScale('right').applyOptions({ autoScale: true });
  // In replay the series holds only the bars up to the cursor (see ReplayEngine).
  const { isActive, cursorTime } = useReplayStore.getState();
  const candles = useMarketStore.getState().candles;
  const total = isActive && cursorTime != null
    ? candles.filter((c) => c.t <= cursorTime).length
    : candles.length;
  if (total > 0) {
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - RESET_VISIBLE_BARS),
      to: total - 1 + RESET_RIGHT_MARGIN,
    });
  }
  nudgeRedraw(chart);
}

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

/**
 * TradingView-style right-click menu for the chart area. One menu everywhere
 * (over candles, drawings or empty space); the drawing text editor keeps the
 * browser's native menu so copy/paste still works there.
 */
export function ChartContextMenu({ sharedChartRef, sharedSeriesRef, chartAreaRef }: ChartContextMenuProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const drawingCount = useDrawingStore((s) => s.drawings.length);
  const drawingsLocked = useDrawingStore((s) => s.drawingsLocked);
  const clearAll = useDrawingStore((s) => s.clearAll);
  const selectedCount = useDrawingStore((s) => s.selectedIds.length);
  const clipboardCount = useDrawingStore((s) => s.clipboard.length);
  const copySelected = useDrawingStore((s) => s.copySelected);
  const indicatorCount = useIndicatorStore((s) => s.activeIndicators.size + (s.activeSubPanel ? 1 : 0));
  const clearAllIndicators = useIndicatorStore((s) => s.clearAllIndicators);
  const setSettingsOpen = useChartStore((s) => s.setSettingsOpen);

  const close = () => {
    setAnchor(null);
    setPos(null);
  };

  // Open on right-click anywhere in the chart area.
  useEffect(() => {
    const area = chartAreaRef.current;
    if (!area) return;
    const onContextMenu = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-drawing-overlay]')) return;
      e.preventDefault();
      setPos(null);
      setAnchor({ x: e.clientX, y: e.clientY });
    };
    area.addEventListener('contextmenu', onContextMenu);
    return () => area.removeEventListener('contextmenu', onContextMenu);
  }, [chartAreaRef]);

  // Alt+R — same as the menu's "Reset chart". e.code, since Alt changes e.key on macOS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyR' || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      resetChartView(sharedChartRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sharedChartRef]);

  // Flip/clamp so the menu stays fully on-screen.
  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.x;
    let top = anchor.y;
    if (left + width > vw - EDGE_GAP) left = anchor.x - width;
    if (top + height > vh - EDGE_GAP) top = anchor.y - height;
    left = Math.max(EDGE_GAP, Math.min(left, vw - width - EDGE_GAP));
    top = Math.max(EDGE_GAP, Math.min(top, vh - height - EDGE_GAP));
    setPos({ left, top });
  }, [anchor]);

  // Dismiss on click-outside, Escape, wheel, resize or window blur.
  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture phase + stop so DrawingCanvas's Escape (deselect/cancel) doesn't also fire.
      e.stopPropagation();
      close();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [anchor]);

  if (!anchor) return null;

  const items: { key: string; label: string; disabled: boolean; run: () => void }[] = [
    { key: 'copy', label: 'Copy', disabled: selectedCount === 0, run: copySelected },
    {
      key: 'paste',
      label: 'Paste',
      disabled: clipboardCount === 0 || drawingsLocked,
      run: () => pasteDrawings(sharedSeriesRef.current),
    },
    {
      key: 'tools',
      label: `Remove ${plural(drawingCount, 'tool')}`,
      disabled: drawingCount === 0 || drawingsLocked,
      run: clearAll,
    },
    {
      key: 'indicators',
      label: `Remove ${plural(indicatorCount, 'indicator')}`,
      disabled: indicatorCount === 0,
      run: clearAllIndicators,
    },
    { key: 'reset', label: 'Reset chart', disabled: false, run: () => resetChartView(sharedChartRef.current) },
    { key: 'settings', label: 'Settings', disabled: false, run: () => setSettingsOpen(true) },
  ];

  return createPortal(
    <div
      ref={menuRef}
      data-drawing-overlay="context-menu"
      className="py-1 select-none"
      style={{
        position: 'fixed',
        left: pos?.left ?? anchor.x,
        top: pos?.top ?? anchor.y,
        // Hidden until measured so it never flashes off-screen.
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 900,
        minWidth: 180,
        background: 'var(--bg-panel-alt)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map(({ key, label, disabled, run }, i) => (
        <div key={key}>
          {(key === 'tools' || key === 'settings') && i > 0 && <div className="my-1 border-t border-[var(--border-color)]" />}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              close();
              run();
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]"
          >
            {label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
