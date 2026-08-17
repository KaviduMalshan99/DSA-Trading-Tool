/**
 * ClusterScanner — a live feed of notable order-flow events, collected from
 * detection this app already has. Builds NO new detection: it watches the
 * same sources ExecutionDashboard reads (deltaStore, footprintSignalStore,
 * whaleStore, the absorption REST poll) and appends a feed entry whenever
 * one of them crosses an edge that wasn't already logged. No new
 * streams/connections opened here.
 *
 * Scope: ACTIVE SYMBOL ONLY. A true multi-symbol market-wide scanner would
 * need live connections to many symbols at once (footprint/delta/whale
 * streams are all per-symbol WebSocket connections today) — that's a bigger
 * future piece of work, not attempted here. Switching symbols clears the
 * feed and every detector's dedupe state, since a feed still showing the
 * old symbol's events after switching would be actively misleading about
 * what "active symbol" the panel claims to scan.
 *
 * De-dupe, per source (the main thing to get right — see each effect below):
 *   - Whale:      whaleStore.trades already contains only whale-flagged
 *                 trades (WhaleMarkers is the sole writer, only while the
 *                 Whales overlay is on). Tracks the newest trade .time
 *                 already processed; only trades with a strictly later time
 *                 are new. Seeds from whatever's already in the store on
 *                 mount/symbol-switch WITHOUT back-filling the feed, so
 *                 toggling this panel on doesn't dump the whole existing
 *                 buffer at once.
 *   - Absorption: polls GET /indicators/absorption at the same 15s cadence
 *                 as ExecutionDashboard/AbsorptionOverlay. Each response is
 *                 a snapshot of every event still inside the lookback
 *                 window, not just new ones, so a Set of "already seen"
 *                 `${type}-${time}` keys is kept — a key is a specific
 *                 event tied to a specific candle, so it's stable across
 *                 repeated polls. Same mount-time seeding-without-backfill
 *                 as Whale.
 *   - Stack:      footprintSignalStore reflects only the most recent bar's
 *                 strongest signal (not a queue), so the same isStack=true
 *                 bar would otherwise re-fire every render while that bar
 *                 is still forming. Dedupes on barTime — only fires when a
 *                 stack appears on a barTime that hasn't already fired.
 *   - Delta:      deltaStore carries no timestamp, only the latest value, so
 *                 this is edge-triggered rather than time-keyed via the
 *                 shared createDeltaSwingDetector() (utils/deltaSwingDetector.ts)
 *                 — a rolling window of the last 20 observed |delta|
 *                 magnitudes, firing only on the false->true transition of
 *                 (mag >= 3x the rolling average, once at least 5 samples
 *                 exist). No fixed absolute threshold — delta's units scale
 *                 wildly by coin (BTC deltas are single digits, PEPE deltas
 *                 are in the millions), so a relative/adaptive threshold is
 *                 the only coin-safe option. The same detector is reused
 *                 as-is by the Alerts engine's "large delta" alert type, so
 *                 both features agree on exactly what "large" means.
 */

import { useEffect, useRef, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useDeltaStore } from '../../store/deltaStore';
import { useFootprintSignalStore } from '../../store/footprintSignalStore';
import { useWhaleStore } from '../../store/whaleStore';
import { useClusterScannerStore, type ScannerEvent } from '../../store/clusterScannerStore';
import { api } from '../../services/api';
import { toChartTimeSeconds } from '../../utils/chartTime';
import { createDeltaSwingDetector } from '../../utils/deltaSwingDetector';
import type { AbsorptionData } from '../../types/analytics';

const ABSORPTION_POLL_MS = 15_000; // matches ExecutionDashboard/AbsorptionOverlay

const UP_COLOR = '#26a641';
const DOWN_COLOR = '#f85149';

const TYPE_TAG: Record<ScannerEvent['eventType'], string> = {
  whale: 'WHALE',
  absorption: 'ABS',
  stack: 'STACK',
  delta: 'Δ',
};

function fmtNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

/** Wall-clock HH:MM:SS in the app's fixed Asia/Colombo display offset (see chartTime.ts). */
function formatClockTime(epochMs: number): string {
  const d = new Date(toChartTimeSeconds(epochMs) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function ClusterScanner() {
  const { activeSymbol, activeInterval } = useMarketStore();
  const [collapsed, setCollapsed] = useState(false);
  const [absorption, setAbsorption] = useState<AbsorptionData | null>(null);

  const delta = useDeltaStore((s) => s.delta);
  const signal = useFootprintSignalStore();
  const trades = useWhaleStore((s) => s.trades);

  const { events, addEvent, clearEvents } = useClusterScannerStore();

  // Dedupe state — refs so updating them never triggers a re-render.
  const lastWhaleTimeRef = useRef<number | null>(null);
  const seenAbsorptionKeysRef = useRef<Set<string>>(new Set());
  const seededAbsorptionRef = useRef(false);
  const lastStackBarRef = useRef<number | null>(null);
  const seededStackRef = useRef(false);
  const deltaDetectorRef = useRef(createDeltaSwingDetector());

  // Symbol/interval change = new scan target: clear the feed and every
  // detector's dedupe state together so nothing straddles the switch.
  useEffect(() => {
    clearEvents();
    lastWhaleTimeRef.current = null;
    seenAbsorptionKeysRef.current = new Set();
    seededAbsorptionRef.current = false;
    lastStackBarRef.current = null;
    seededStackRef.current = false;
    deltaDetectorRef.current = createDeltaSwingDetector();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, activeInterval]);

  // ── Absorption REST poll ────────────────────────────────────────────
  useEffect(() => {
    let stopped = false;
    setAbsorption(null);
    async function fetchAbsorption() {
      try {
        const data = await api.getAbsorption(activeSymbol, activeInterval);
        if (!stopped) setAbsorption(data);
      } catch { if (!stopped) setAbsorption(null); }
    }
    fetchAbsorption();
    const timer = setInterval(fetchAbsorption, ABSORPTION_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [activeSymbol, activeInterval]);

  // ── Whale detector ───────────────────────────────────────────────────
  useEffect(() => {
    if (lastWhaleTimeRef.current === null) {
      lastWhaleTimeRef.current = trades[0]?.time ?? 0;
      return;
    }
    const newOnes = trades
      .filter((t) => t.time > lastWhaleTimeRef.current!)
      .sort((a, b) => a.time - b.time);
    if (newOnes.length === 0) return;
    lastWhaleTimeRef.current = trades[0].time;
    for (const t of newOnes) {
      addEvent({
        time: t.time,
        symbol: activeSymbol,
        eventType: 'whale',
        side: t.side,
        label: `Whale ${t.side === 'buy' ? 'BUY' : 'SELL'} ${fmtNotional(t.notional)}`,
      });
    }
  }, [trades, activeSymbol, addEvent]);

  // ── Absorption detector ──────────────────────────────────────────────
  useEffect(() => {
    if (!absorption) return;
    if (!seededAbsorptionRef.current) {
      seededAbsorptionRef.current = true;
      for (const e of absorption.events) seenAbsorptionKeysRef.current.add(`${e.type}-${e.time}`);
      return;
    }
    const newOnes = absorption.events
      .filter((e) => !seenAbsorptionKeysRef.current.has(`${e.type}-${e.time}`))
      .sort((a, b) => a.time - b.time);
    for (const e of newOnes) {
      seenAbsorptionKeysRef.current.add(`${e.type}-${e.time}`);
      addEvent({
        time: e.time,
        symbol: activeSymbol,
        eventType: 'absorption',
        side: e.type === 'buy_absorption' ? 'buy' : 'sell',
        label: e.type === 'buy_absorption' ? 'Buy absorption' : 'Sell absorption',
      });
    }
  }, [absorption, activeSymbol, addEvent]);

  // ── Stacked imbalance detector ──────────────────────────────────────
  useEffect(() => {
    if (!seededStackRef.current) {
      seededStackRef.current = true;
      if (signal.isStack) lastStackBarRef.current = signal.barTime;
      return;
    }
    if (signal.isStack && signal.side && signal.barTime !== lastStackBarRef.current) {
      lastStackBarRef.current = signal.barTime;
      addEvent({
        time: signal.barTime ?? Date.now(),
        symbol: activeSymbol,
        eventType: 'stack',
        side: signal.side,
        label: `Stacked ${signal.side === 'buy' ? 'buy' : 'sell'} imbalance`,
      });
    }
  }, [signal.side, signal.isStack, signal.barTime, activeSymbol, addEvent]);

  // ── Large delta swing detector ───────────────────────────────────────
  useEffect(() => {
    if (delta === null) return;
    const fired = deltaDetectorRef.current.observe(delta);
    if (fired) {
      addEvent({
        time: Date.now(), // deltaStore carries no bar timestamp — this is detection time, not bar time
        symbol: activeSymbol,
        eventType: 'delta',
        side: delta >= 0 ? 'buy' : 'sell',
        label: `Large ${delta >= 0 ? '+' : ''}delta (${delta.toFixed(2)})`,
      });
    }
  }, [delta, activeSymbol, addEvent]);

  return (
    <div
      className="absolute bottom-3 left-3 z-20 select-none text-xs font-mono flex flex-col"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color-soft)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        width: collapsed ? 'auto' : 260,
        maxHeight: 320,
      }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 gap-3 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded flex-shrink-0"
      >
        <span className="font-semibold tracking-wide uppercase text-[10px] text-[var(--text-muted)]">
          Scanner · {activeSymbol}
        </span>
        <span className="flex items-center gap-2">
          {!collapsed && events.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); clearEvents(); }}
              className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)] normal-case"
            >
              Clear
            </span>
          )}
          <span className="text-[var(--text-muted)]">{collapsed ? '▸' : '▾'}</span>
        </span>
      </button>

      {!collapsed && (
        <div className="overflow-y-auto border-t border-[var(--border-color-soft)]" style={{ flex: 1, minHeight: 0 }}>
          {events.length === 0 ? (
            <div className="px-2.5 py-2 text-[10px] text-[var(--text-muted)] italic">
              Watching for events…
            </div>
          ) : (
            events.map((event) => {
              const color = event.side === 'buy' ? UP_COLOR : DOWN_COLOR;
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 border-b border-[var(--border-color-soft)] last:border-b-0"
                >
                  <span className="text-[var(--text-muted)] flex-shrink-0">{formatClockTime(event.time)}</span>
                  <span
                    className="text-[9px] font-bold px-1 rounded flex-shrink-0"
                    style={{ background: 'var(--bg-app)', color }}
                  >
                    {TYPE_TAG[event.eventType]}
                  </span>
                  <span className="truncate" style={{ color }}>{event.label}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
