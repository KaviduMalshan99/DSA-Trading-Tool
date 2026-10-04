// Account sync engine (Stage 4): mirrors the allowlisted localStorage keys
// (persist.ts) to the logged-in user's account.
//
// - Logged out: nothing here makes a request; localStorage works as before.
// - On login (or page load with a session): loginSync() reconciles local and
//   server per key, writes server data into localStorage and reloads the page
//   so the stores re-read it (no live store replacement).
// - While logged in: synced-key writes (saveLocal) mark keys dirty; flush()
//   uploads them, debounced, with optimistic versioning.
//
// Import direction: this module imports authStore and persist; neither imports
// it back. Stores reach markDirty via persist.registerDirtyListener, and
// authStore.logout reaches flushNow/clearLocalSyncedData via registerSessionHooks.

import { api, ApiError } from './api';
import { useAuthStore, registerSessionHooks, type AuthStatus } from '../store/authStore';
import {
  SYNC_KEYS, SYNC_KEY_PATTERN, registerDirtyListener, suspendSyncedWrites,
} from './persist';

type BatchItem = Parameters<typeof api.syncBatch>[0][number];
type BatchResult = Awaited<ReturnType<typeof api.syncBatch>>['results'][number];
type ServerItem = Awaited<ReturnType<typeof api.syncGet>>['items'][number];

const META_KEY = 'dsa-sync-meta';        // not synced itself
const RELOAD_FLAG_KEY = 'dsa-sync-reload'; // sessionStorage
const RELOAD_LOOP_WINDOW_MS = 30_000;
const LOGIN_RETRY_MS = 30_000;
const DEBOUNCE_MS = 1500;
const RETRY_MIN_MS = 10_000;
const RETRY_MAX_MS = 60_000;
// Client-side mirrors of the server limits (backend/app/api/sync.py), so one bad
// item doesn't make the server reject a whole batch.
const MAX_BATCH_ITEMS = 100;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_VALUE_CHARS = 1_000_000;
const KEEPALIVE_MAX_BYTES = 60 * 1024;

interface MetaEntry {
  /** Server version last confirmed in sync. */
  v: number;
  /** Hash of the (normalized) value last confirmed in sync. */
  h: string;
}

interface Meta {
  userId: number;
  items: Record<string, MetaEntry>;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** cyrb53 (public domain, bryc) — fast 53-bit string hash, as hex. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * The form of a value that is hashed and uploaded. Alerts drop their per-device
 * firing state (triggered/lastFiredAt), so an alert firing never causes an
 * upload or a cross-device conflict. Every other key is stored verbatim.
 */
export function normalize(key: string, raw: string): string {
  if (key !== 'dsa-alerts') return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { alerts?: unknown }).alerts)) {
      return raw;
    }
    const p = parsed as { alerts: unknown[] };
    return JSON.stringify({
      ...p,
      alerts: p.alerts.map((a) =>
        a && typeof a === 'object' ? { ...a, triggered: false, lastFiredAt: null } : a),
    });
  } catch {
    return raw;
  }
}

/**
 * True for a drawings key whose value holds no drawings ({v:2, drawings: []}
 * or a legacy []). The chart saves one of these for every symbol/interval it
 * visits, so they're not worth creating server rows for. Keyed so an empty
 * list under another key (e.g. an emptied watchlist "[]") still syncs.
 */
export function isEmptyDrawings(key: string, raw: string): boolean {
  if (!SYNC_KEY_PATTERN.test(key)) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length === 0;
    const drawings = (parsed as { drawings?: unknown } | null)?.drawings;
    return Array.isArray(drawings) && drawings.length === 0;
  } catch {
    return false;
  }
}

/** Allowlisted keys currently in localStorage (fixed keys + every drawings key). */
export function localSyncedKeys(): string[] {
  const keys: string[] = [];
  try {
    for (const key of SYNC_KEYS) {
      if (localStorage.getItem(key) !== null) keys.push(key);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && SYNC_KEY_PATTERN.test(key)) keys.push(key);
    }
  } catch { /* storage blocked */ }
  return keys;
}

function readLocal(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : normalize(key, raw);
  } catch {
    return undefined;
  }
}

function readMeta(): Meta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Meta> | null;
    if (!parsed || typeof parsed.userId !== 'number' || !parsed.items || typeof parsed.items !== 'object') {
      return null;
    }
    return { userId: parsed.userId, items: parsed.items };
  } catch {
    return null;
  }
}

function writeMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (err) {
    console.warn('[sync] failed to save sync metadata', err);
  }
}

const encoder = new TextEncoder();
const byteLength = (s: string) => encoder.encode(s).length;

/** Split uploads into requests of <= MAX_BATCH_ITEMS items and <= MAX_BATCH_BYTES of JSON. */
function chunkItems(items: BatchItem[]): BatchItem[][] {
  const chunks: BatchItem[][] = [];
  let current: BatchItem[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = byteLength(JSON.stringify(item));
    if (current.length > 0 && (current.length >= MAX_BATCH_ITEMS || bytes + size > MAX_BATCH_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Network failures, 5xx, 408 and 429 are worth retrying; other 4xx would just fail again. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status >= 500 || err.status === 408 || err.status === 429;
}

function tooLarge(key: string, value: string): boolean {
  if (value.length <= MAX_VALUE_CHARS) return false;
  console.warn(`[sync] "${key}" is too large to sync (${value.length} chars)`);
  return true;
}

// ── Engine state ──────────────────────────────────────────────────────────────

let started = false;
/** User whose loginSync completed — uploads are only allowed while this is set. */
let readyUserId: number | null = null;
let syncing = false;
/** A sync-triggered reload is under way: no more writes or uploads. */
let reloading = false;
/** Bumped on every auth transition so stale async work can tell it's been superseded. */
let sessionGen = 0;

const dirty = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let loginRetryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_MIN_MS;
let flight: Promise<void> | null = null;
let flushAgain = false;

function clearTimers(): void {
  for (const t of [debounceTimer, retryTimer, loginRetryTimer]) if (t !== null) clearTimeout(t);
  debounceTimer = retryTimer = loginRetryTimer = null;
}

function reloadPage(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG_KEY));
    if (last && Date.now() - last < RELOAD_LOOP_WINDOW_MS) {
      console.warn('[sync] sync reload loop prevented');
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch { /* sessionStorage blocked — reload anyway */ }
  reloading = true;
  // Stores still hold pre-sync state; don't let them overwrite what was just written.
  suspendSyncedWrites();
  window.location.reload();
}

// ── Login reconciliation ──────────────────────────────────────────────────────

export async function loginSync(userId: number, isRetry = false): Promise<void> {
  const gen = sessionGen;
  syncing = true;

  let server: ServerItem[];
  try {
    server = (await api.syncGet()).items;
  } catch (err) {
    console.warn('[sync] could not load account data; keeping local data', err);
    syncing = false;
    if (!isRetry && gen === sessionGen) {
      loginRetryTimer = setTimeout(() => {
        loginRetryTimer = null;
        if (gen === sessionGen) void loginSync(userId, true);
      }, LOGIN_RETRY_MS);
    }
    return;
  }
  if (gen !== sessionGen) { syncing = false; return; }

  // Every localStorage change is collected here and applied in one synchronous
  // step right before the (possible) reload, so no store write can interleave.
  const writes = new Map<string, string>();
  const removes = new Set<string>();
  let needsReload = false;

  let meta = readMeta();
  let localKeys = localSyncedKeys();
  if (meta && meta.userId !== userId) {
    // Local synced data belongs to another account: never upload it, drop it,
    // and let the server data (or defaults) take over after the reload.
    for (const key of localKeys) removes.add(key);
    needsReload = localKeys.length > 0;
    localKeys = [];
    meta = null;
  }
  const items: Record<string, MetaEntry> = { ...(meta?.items ?? {}) };
  const local = (key: string) => (removes.has(key) ? undefined : readLocal(key));

  const serverByKey = new Map(server.map((s) => [s.key, s]));
  const uploads: BatchItem[] = [];
  for (const key of new Set([...serverByKey.keys(), ...localKeys])) {
    const L = local(key);
    const S = serverByKey.get(key);
    const M = items[key];

    if (S) {
      const hS = hashString(S.value);
      if (L === undefined) {
        writes.set(key, S.value);
        items[key] = { v: S.version, h: hS };
      } else if (hashString(L) === hS) {
        items[key] = { v: S.version, h: hS };
      } else if (M && M.v === S.version && hashString(L) !== M.h) {
        // Changed locally since the last sync while the server didn't move: upload.
        if (!tooLarge(key, L)) uploads.push({ key, value: L, base_version: S.version });
      } else {
        // Server changed (or no sync history for this key): server wins.
        writes.set(key, S.value);
        items[key] = { v: S.version, h: hS };
      }
    } else if (L !== undefined) {
      delete items[key]; // any history refers to a row the server no longer has
      if (!isEmptyDrawings(key, L) && !tooLarge(key, L)) uploads.push({ key, value: L, base_version: null });
    } else {
      delete items[key];
    }
  }

  const conflicted: string[] = [];
  for (const chunk of chunkItems(uploads)) {
    let results: BatchResult[];
    try {
      results = (await api.syncBatch(chunk)).results;
    } catch (err) {
      console.warn('[sync] upload during login sync failed; will retry', err);
      for (const item of chunk) dirty.add(item.key);
      continue;
    }
    const values = new Map(chunk.map((i) => [i.key, i.value]));
    for (const r of results) {
      if (r.status === 'ok' && r.version !== null) {
        items[r.key] = { v: r.version, h: hashString(values.get(r.key) ?? '') };
      } else {
        conflicted.push(r.key);
      }
    }
  }
  if (conflicted.length > 0) {
    // Someone else wrote these meanwhile — server wins.
    try {
      const fresh = new Map((await api.syncGet()).items.map((s) => [s.key, s]));
      for (const key of conflicted) {
        const S = fresh.get(key);
        if (!S) continue;
        writes.set(key, S.value);
        items[key] = { v: S.version, h: hashString(S.value) };
      }
    } catch (err) {
      console.warn('[sync] could not refetch conflicted keys; next login sync resolves them', err);
    }
  }
  if (gen !== sessionGen) { syncing = false; return; } // logged out meanwhile

  // ── apply (synchronous from here to the reload) ──
  for (const key of removes) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  for (const [key, value] of writes) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn(`[sync] failed to write "${key}" from account`, err);
      delete items[key]; // not actually in sync
    }
  }
  needsReload ||= writes.size > 0;
  writeMeta({ userId, items });
  readyUserId = userId;
  syncing = false;

  if (needsReload) {
    reloadPage();
    if (reloading) return;
  } else {
    try { sessionStorage.removeItem(RELOAD_FLAG_KEY); } catch { /* ignore */ }
  }
  if (dirty.size > 0) void flush();
}

// ── Live uploads ──────────────────────────────────────────────────────────────

export function markDirty(key: string): void {
  dirty.add(key);
  if (readyUserId === null || syncing || reloading) return;
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flush();
  }, DEBOUNCE_MS);
}

/** Dirty keys whose current value differs from what the server last confirmed. */
function collectUploads(keys: Iterable<string>, meta: Meta): BatchItem[] {
  const uploads: BatchItem[] = [];
  for (const key of keys) {
    const L = readLocal(key);
    if (L === undefined) continue;
    const M = meta.items[key];
    if (M?.h === hashString(L)) continue;
    if (!M && isEmptyDrawings(key, L)) continue;
    if (tooLarge(key, L)) continue;
    uploads.push({ key, value: L, base_version: M?.v ?? null });
  }
  return uploads;
}

function scheduleRetry(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

async function flushOnce(): Promise<void> {
  const userId = readyUserId;
  const meta = readMeta();
  const keys = [...dirty];
  dirty.clear();
  if (userId === null || !meta || meta.userId !== userId) return;

  const chunks = chunkItems(collectUploads(keys, meta));
  for (let c = 0; c < chunks.length; c++) {
    const values = new Map(chunks[c].map((i) => [i.key, i.value]));
    const confirm = (r: BatchResult) => {
      meta.items[r.key] = { v: r.version as number, h: hashString(values.get(r.key) ?? '') };
    };
    try {
      const { results } = await api.syncBatch(chunks[c]);
      results.filter((r) => r.status === 'ok').forEach(confirm);
      // During an active session local wins: retry once on top of the server's version.
      const retry = results
        .filter((r) => r.status === 'conflict')
        .map((r) => ({ key: r.key, value: values.get(r.key) ?? '', base_version: r.version }));
      if (retry.length > 0) {
        const second = await api.syncBatch(retry);
        for (const r of second.results) {
          if (r.status === 'ok') confirm(r);
          else console.warn(`[sync] "${r.key}" conflicted twice; the next login sync resolves it`);
        }
      }
    } catch (err) {
      if (readyUserId !== userId) return;
      if (isRetryable(err)) {
        for (const chunk of chunks.slice(c)) for (const item of chunk) dirty.add(item.key);
        console.warn('[sync] upload failed; retrying', err);
        scheduleRetry();
      } else {
        console.warn('[sync] upload rejected', err);
      }
      writeMeta(meta);
      return;
    }
    if (readyUserId !== userId) return; // logged out meanwhile — don't touch meta
    writeMeta(meta);
  }
  retryDelay = RETRY_MIN_MS;
}

function flush(): Promise<void> {
  if (readyUserId === null || syncing || reloading) return Promise.resolve();
  if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
  if (flight) {
    flushAgain = true;
    return flight;
  }
  flight = (async () => {
    try {
      do {
        flushAgain = false;
        await flushOnce();
      } while (flushAgain && dirty.size > 0 && readyUserId !== null);
    } finally {
      flight = null;
    }
  })();
  return flight;
}

/** Flush now and wait for it, but never longer than timeoutMs. */
export function flushNow(timeoutMs: number): Promise<void> {
  return Promise.race([
    flush().catch(() => { /* best effort */ }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function onPageHide(): void {
  if (readyUserId === null || syncing || reloading || dirty.size === 0) return;
  const meta = readMeta();
  if (!meta || meta.userId !== readyUserId) return;
  const uploads = collectUploads(dirty, meta);
  if (uploads.length === 0) return;
  // keepalive bodies are capped at 64 KB; anything bigger waits for the next login sync.
  if (byteLength(JSON.stringify({ items: uploads })) >= KEEPALIVE_MAX_BYTES) return;
  const values = new Map(uploads.map((i) => [i.key, i.value]));
  api.syncBatch(uploads, { keepalive: true })
    .then(({ results }) => {
      // Only matters if the page survives (bfcache); otherwise login sync recovers.
      const current = readMeta();
      if (!current || current.userId !== meta.userId) return;
      for (const r of results) {
        if (r.status === 'ok' && r.version !== null) {
          current.items[r.key] = { v: r.version, h: hashString(values.get(r.key) ?? '') };
        }
      }
      writeMeta(current);
    })
    .catch(() => { /* best effort */ });
}

/** Remove every synced key and the sync metadata. Callers reload right after. */
export function clearLocalSyncedData(): void {
  readyUserId = null;
  suspendSyncedWrites();
  for (const key of localSyncedKeys()) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(META_KEY); } catch { /* ignore */ }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

function onAuthChange(status: AuthStatus, userId: number | undefined, prevStatus: AuthStatus | undefined): void {
  if (status === 'authenticated' && userId !== undefined && prevStatus !== 'authenticated') {
    sessionGen++;
    void loginSync(userId);
  } else if (status !== 'authenticated' && prevStatus === 'authenticated') {
    sessionGen++;
    readyUserId = null;
    syncing = false;
    clearTimers();
  }
}

/** Call once at startup (StrictMode-safe). */
export function start(): void {
  if (started) return;
  started = true;
  registerDirtyListener(markDirty);
  registerSessionHooks({ flushNow, clearLocalSyncedData });
  window.addEventListener('pagehide', onPageHide);
  useAuthStore.subscribe((state, prev) => onAuthChange(state.status, state.user?.id, prev.status));
  const { status, user } = useAuthStore.getState();
  onAuthChange(status, user?.id, undefined);
}
