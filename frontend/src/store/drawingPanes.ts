import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import {
  createDrawingPaneStore, useDrawingTools,
  type DrawingPaneState, type DrawingPaneStore, type PaneKind,
} from './drawingStore';

// Every chart pane that hosts drawings ('main' now; 'rsi', 'macd', 'stochrsi'
// sub panels later) gets its own drawing store. Pane ids are at most 8
// lowercase letters/digits with no underscore, so a pane's storage key still
// matches the sync allow-list (see drawingsStorageKey and SYNC_KEY_PATTERN in
// services/persist.ts).
export interface DrawingPane {
  id: string;
  kind: PaneKind;
  store: DrawingPaneStore;
}

const panes = new Map<string, DrawingPane>();

// Provided by DrawingPaneProvider (components/Drawing/DrawingPaneContext.tsx).
export const DrawingPaneContext = createContext<DrawingPane | null>(null);

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
  return getPanes().filter((p) => p.id === MAIN_PANE_ID || handlers.has(p.id));
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

/** Throws outside a DrawingPaneProvider. */
export function usePane(): DrawingPane {
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
