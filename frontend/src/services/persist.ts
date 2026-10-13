// localStorage writes for keys that sync to the user's account (Stage 4).
//
// Leaf module: stores import saveLocal from here, and the sync engine plugs in
// via registerDirtyListener — so stores never import the engine (no cycles).

// Mirrors backend/app/api/sync.py SYNC_KEYS / SYNC_KEY_PATTERN exactly.
export const SYNC_KEYS: readonly string[] = [
  'dsa-watchlist',
  'dsa-watchlist-tags',
  'dsa-timezone',
  'dsa-theme',
  'dsa-candle-style',
  'dsa-indicator-config',
  'dsa-fav-intervals',
  'dsa-fav-indicators',
  'dsa-position-calc',
  'dsa-alerts',
  'dsa-drawing-templates',
];
// Drawings keys: dsa_drawings_<symbol>_<interval> for the main chart, plus
// _<paneId> for sub-panel panes (drawingsStorageKey in store/drawingPanes.ts).
// Pane ids are <= 8 lowercase letters/digits with no underscore, so the pane
// suffix matches the final [A-Za-z0-9]{1,8} group and symbol_interval the first.
export const SYNC_KEY_PATTERN = /^dsa_drawings_[A-Za-z0-9._-]{1,40}_[A-Za-z0-9]{1,8}$/;

export function isSyncedKey(key: string): boolean {
  return SYNC_KEYS.includes(key) || SYNC_KEY_PATTERN.test(key);
}

let dirtyListener: ((key: string) => void) | null = null;
let syncedWritesSuspended = false;

/** The sync engine registers itself here to hear about synced-key writes. */
export function registerDirtyListener(fn: (key: string) => void): void {
  dirtyListener = fn;
}

/**
 * Drop synced-key writes from here on. Called right before a reload that must
 * not be clobbered: stores still hold their pre-reload state, and any write in
 * the moments before unload would overwrite what was just put in localStorage.
 */
export function suspendSyncedWrites(): void {
  syncedWritesSuspended = true;
}

export function saveLocal(key: string, value: string): void {
  const synced = isSyncedKey(key);
  if (synced && syncedWritesSuspended) return;
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // Same as before (never throws), but quota failures are now visible.
    console.warn(`[persist] failed to save "${key}"`, err);
  }
  if (synced) dirtyListener?.(key);
}
