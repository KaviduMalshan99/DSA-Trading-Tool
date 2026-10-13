import { createContext, useContext } from 'react';
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

/** "Remove all drawings": clears every registered pane, each as its own undo step. */
export function clearAllPanes(): void {
  for (const pane of panes.values()) {
    if (pane.store.getState().drawings.length) pane.store.getState().clearAll();
  }
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
  const activePaneId = useDrawingTools((s) => s.activePaneId);
  return useStore((panes.get(activePaneId) ?? mainPane).store, selector);
}

/** localStorage key for one pane's drawings. Main keeps the original
 * `dsa_drawings_<symbol>_<interval>` key; other panes append `_<paneId>`. */
export function drawingsStorageKey(symbol: string, interval: string, paneId: string): string {
  const base = `dsa_drawings_${symbol}_${interval}`;
  return paneId === MAIN_PANE_ID ? base : `${base}_${paneId}`;
}
