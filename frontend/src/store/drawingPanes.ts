import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import { useStore } from 'zustand';
import {
  createDrawingPaneStore, useDrawingTools,
  type DrawingPaneState, type DrawingPaneStore, type DrawingTool, type PaneKind,
} from './drawingStore';

// Every chart pane that hosts drawings ('main', plus the 'rsi', 'stochrsi' and
// 'macd' indicator sub-panels) gets its own drawing store. Pane ids are at most 8
// lowercase letters/digits with no underscore, so a pane's storage key still
// matches the sync allow-list (see drawingsStorageKey and SYNC_KEY_PATTERN in
// services/persist.ts).
export interface DrawingPane {
  id: string;
  kind: PaneKind;
  store: DrawingPaneStore;
}

const panes = new Map<string, DrawingPane>();

// The only series methods the drawing system calls. Main passes its candlestick
// series; oscillator panes pass their indicator line/histogram series.
export type DrawingSeries = Pick<ISeriesApi<SeriesType>, 'priceToCoordinate' | 'coordinateToPrice' | 'options'>;

/** A pane plus the chart/series its drawings are plotted against. */
export interface PaneContextValue extends DrawingPane {
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<DrawingSeries | null>;
  // Chart whose visible logical range this pane's chart mirrors (sub-panels:
  // the main chart, via subPanelSync). DrawingCanvas won't place a point
  // until the two ranges match, so a click right after the panel opens can't
  // land on a bar from the panel's not-yet-synced default view.
  timeSourceRef?: RefObject<IChartApi | null>;
}

// Provided by DrawingPaneProvider (components/Drawing/DrawingPaneContext.tsx).
export const DrawingPaneContext = createContext<PaneContextValue | null>(null);

export const MAIN_PANE_ID = 'main';

// Created eagerly and never unregistered: the main chart is always mounted,
// and getActivePane falls back to it.
export const mainPane: DrawingPane = { id: MAIN_PANE_ID, kind: 'price', store: createDrawingPaneStore(MAIN_PANE_ID, 'price') };
export const mainPaneStore = mainPane.store;
panes.set(MAIN_PANE_ID, mainPane);

/** The pane registered under `paneId`, creating it on first use. */
export function registerPane(paneId: string, kind: PaneKind): DrawingPane {
  let pane = panes.get(paneId);
  if (!pane) {
    pane = { id: paneId, kind, store: createDrawingPaneStore(paneId, kind) };
    panes.set(paneId, pane);
  }
  return pane;
}

export function getPane(paneId: string): DrawingPane | undefined {
  return panes.get(paneId);
}

/** Whether `paneId`'s DrawingCanvas is mounted (main always is). */
export function isPaneMounted(paneId: string): boolean {
  return paneId === MAIN_PANE_ID || handlers.has(paneId);
}

/** Every registered pane, main first. */
export function getPanes(): DrawingPane[] {
  return [...panes.values()];
}

/** The pane pane-less UI (top toolbar, context menu, sidebar) acts on. */
export function getActivePane(): DrawingPane {
  return panes.get(useDrawingTools.getState().activePaneId) ?? mainPane;
}

// ── mounted panes ───────────────────────────────────────────────────────────
// A pane is "mounted" while its DrawingCanvas is: the canvas registers the
// hooks activatePane needs to tidy it up when another pane takes over. Main
// always counts as mounted (it's the fallback active pane).
export interface PaneHandlers {
  // Commit an open inline text edit.
  flushEdit: () => void;
  // Abandon an in-progress placement (same as Escape mid-placement).
  cancelPlacement: () => void;
}

const handlers = new Map<string, PaneHandlers>();
const mountListeners = new Set<() => void>();
let mountVersion = 0;

function notifyMounts(): void {
  mountVersion++;
  for (const l of mountListeners) l();
}

/** Called by DrawingCanvas on mount; returns the unmount cleanup. */
export function registerPaneHandlers(paneId: string, h: PaneHandlers): () => void {
  handlers.set(paneId, h);
  notifyMounts();
  return () => {
    if (handlers.get(paneId) !== h) return;
    handlers.delete(paneId);
    // An unmounted pane can't stay active: keys and pane-less UI fall back to main.
    if (useDrawingTools.getState().activePaneId === paneId) useDrawingTools.setState({ activePaneId: MAIN_PANE_ID });
    notifyMounts();
  };
}

/** Every pane whose DrawingCanvas is mounted (main always included), main first. */
export function getMountedPanes(): DrawingPane[] {
  return getPanes().filter((p) => isPaneMounted(p.id));
}

/** Makes `paneId` the active pane (last pointerdown/contextmenu inside it).
 * Every other mounted pane commits its text edit, drops any in-progress
 * placement and loses its selection — selection is exclusive across panes. */
export function activatePane(paneId: string): void {
  if (useDrawingTools.getState().activePaneId !== paneId) useDrawingTools.setState({ activePaneId: paneId });
  for (const [id, h] of handlers) {
    if (id === paneId) continue;
    h.flushEdit();
    h.cancelPlacement();
    const store = panes.get(id)?.store;
    if (store?.getState().selectedIds.length) store.getState().selectDrawing(null);
  }
}

/** True while any pane has a DrawingSettingsModal or Fib settings session open. */
export function anySettingsOpen(): boolean {
  return getMountedPanes().some((p) => {
    const s = p.store.getState();
    return s.settingsDrawingId != null || s.settingsSessionId != null;
  });
}

// Pane that owns the current drag or placement gesture (mousedown → mouseup),
// so other panes' window mousemove handlers leave its cursor alone.
let gesturePaneId: string | null = null;
export function beginGesture(paneId: string): void { gesturePaneId = paneId; }
export function endGesture(): void { gesturePaneId = null; }
export function getGesturePaneId(): string | null { return gesturePaneId; }

/** "Remove all drawings": clears every mounted pane, each as its own undo step. */
export function clearAllPanes(): void {
  for (const pane of getMountedPanes()) {
    if (pane.store.getState().drawings.length) pane.store.getState().clearAll();
  }
}

function totalDrawingCount(): number {
  return getMountedPanes().reduce((n, p) => n + p.store.getState().drawings.length, 0);
}

function subscribeMounts(cb: () => void): () => void {
  mountListeners.add(cb);
  return () => { mountListeners.delete(cb); };
}

/** Drawings across all mounted panes — for remove-all/hide/lock UI. */
export function useTotalDrawingCount(): number {
  const version = useSyncExternalStore(subscribeMounts, () => mountVersion);
  const subscribe = useCallback((cb: () => void) => {
    const unsubs = getMountedPanes().map((p) => p.store.subscribe(cb));
    return () => unsubs.forEach((u) => u());
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(subscribe, totalDrawingCount);
}

/** The active pane, reactive to activePaneId. */
export function useActivePane(): DrawingPane {
  const activePaneId = useDrawingTools((s) => s.activePaneId);
  return panes.get(activePaneId) ?? mainPane;
}

// ── price-scale repaints ────────────────────────────────────────────────────
// Dragging a pane's price axis, its "A" button and Reset chart rescale prices
// without moving the time scale, so no range event fires and drawings/style
// toolbars subscribed to range + crosshair would sit still. usePaneRepaint
// covers that: it calls back every frame while a pointer is pressed inside
// the pane (axis drag, axis double-click) and for a few frames after a
// release, a wheel, or requestPaneRepaint. Each frame's work is a canvas
// redraw (rAF-coalesced) or a position recompute, so this stays cheap.
const repaintListeners = new Set<{ paneId: string; cb: () => void }>();

/** Asks the pane's drawings to re-map prices (all panes if `paneId` is omitted). */
export function requestPaneRepaint(paneId?: string): void {
  for (const l of repaintListeners) if (paneId == null || l.paneId === paneId) l.cb();
}

// Frames kept repainting after a release / wheel / request — the chart can
// apply an auto-scale change a frame after the event that caused it.
const REPAINT_TAIL_FRAMES = 3;

/** Calls `onFrame` on every frame the pane's price scale may be changing. */
export function usePaneRepaint(paneId: string, onFrame: () => void): void {
  const cbRef = useRef(onFrame);
  cbRef.current = onFrame;
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-drawing-pane="${paneId}"]`);
    let pressed = false, tail = 0, raf = 0;
    const tick = () => {
      raf = 0;
      cbRef.current();
      if (pressed || --tail > 0) raf = requestAnimationFrame(tick);
    };
    const kick = (frames: number) => {
      tail = Math.max(tail, frames);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onDown = () => { pressed = true; kick(1); };
    const onUp = () => { if (!pressed) return; pressed = false; kick(REPAINT_TAIL_FRAMES); };
    const onWheel = () => kick(REPAINT_TAIL_FRAMES);
    const listener = { paneId, cb: () => kick(REPAINT_TAIL_FRAMES) };
    repaintListeners.add(listener);
    root?.addEventListener('pointerdown', onDown, true);
    root?.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      cancelAnimationFrame(raf);
      repaintListeners.delete(listener);
      root?.removeEventListener('pointerdown', onDown, true);
      root?.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [paneId]);
}

/** Ends any open settings session in `pane` without keeping its edits (the
 * drawing goes back to its pre-modal state). Returns whether one was open. */
export function cancelPaneSettings(pane: DrawingPane): boolean {
  const s = pane.store.getState();
  let cancelled = false;
  if (s.settingsDrawingId != null) { s.closeDrawingSettings(false); cancelled = true; }
  const fibId = pane.store.getState().settingsSessionId;
  if (fibId != null) { pane.store.getState().endSettingsSession(fibId, false); cancelled = true; }
  return cancelled;
}

/** Throws outside a DrawingPaneProvider. */
export function usePane(): PaneContextValue {
  const pane = useContext(DrawingPaneContext);
  if (!pane) throw new Error('usePane() must be used inside a <DrawingPaneProvider>');
  return pane;
}

/** Selects from the enclosing pane's drawing store. */
export function usePaneDrawings<T>(selector: (s: DrawingPaneState) => T): T {
  return useStore(usePane().store, selector);
}

/** Selects from the active pane's drawing store — for UI outside any pane. */
export function useActivePaneDrawings<T>(selector: (s: DrawingPaneState) => T): T {
  return useStore(useActivePane().store, selector);
}

/** localStorage key for one pane's drawings. Main keeps the original
 * `dsa_drawings_<symbol>_<interval>` key; other panes append `_<paneId>`. */
export function drawingsStorageKey(symbol: string, interval: string, paneId: string): string {
  const base = `dsa_drawings_${symbol}_${interval}`;
  return paneId === MAIN_PANE_ID ? base : `${base}_${paneId}`;
}

// ── tool capability ─────────────────────────────────────────────────────────
/** Every pane kind except the candle chart's is an indicator (oscillator) pane. */
export function isOscillatorKind(kind: PaneKind): boolean {
  return kind !== 'price';
}

export const TOOL_NOT_ALLOWED_TITLE = 'Not available on indicator panels';

// Tools that only make sense against candle prices: they read OHLC/volume,
// size a trade in price units, or label a price. 'magnet' is magnet snapping
// (snaps to candle OHLC), not a tool, but is gated the same way.
const PRICE_ONLY_TOOLS = new Set<DrawingTool | 'magnet'>([
  'longPosition', 'shortPosition', 'positionForecast', 'anchoredVwap', 'regression',
  'barsPattern', 'ghostFeed', 'priceNote', 'priceLabel', 'magnet',
]);

/** Whether `tool` (or 'magnet' snapping) can be used on a pane of `kind`. */
export function isToolAllowed(kind: PaneKind, tool: DrawingTool | 'magnet'): boolean {
  return !isOscillatorKind(kind) || !PRICE_ONLY_TOOLS.has(tool);
}

/** isToolAllowed for the enclosing pane. */
export function useToolAllowed(tool: DrawingTool | 'magnet'): boolean {
  return isToolAllowed(usePane().kind, tool);
}

/** isToolAllowed for the active pane — for the drawing toolbar and favorites bar. */
export function useActivePaneToolAllowed(): (tool: DrawingTool | 'magnet') => boolean {
  const kind = useActivePane().kind;
  return useCallback((tool: DrawingTool | 'magnet') => isToolAllowed(kind, tool), [kind]);
}
