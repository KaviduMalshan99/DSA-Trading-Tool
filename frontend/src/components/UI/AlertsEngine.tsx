/**
 * AlertsEngine — non-visual, always-mounted evaluation loop for user alerts.
 * Mounted unconditionally in App.tsx (not gated behind the Alerts manager
 * modal or any chart-overlay toggle) so alerts keep firing in the
 * background regardless of what panels/modals are open.
 *
 * Builds NO new detection — reuses exactly the same sources ExecutionDashboard
 * and ClusterScanner already read (deltaStore, whaleStore, the absorption
 * REST poll, the levels REST poll) and the shared createDeltaSwingDetector()
 * (utils/deltaSwingDetector.ts) so "large delta" means the same thing here
 * as it does in the Scanner. No new streams/connections opened.
 *
 * Scope: ACTIVE SYMBOL ONLY. Alerts are created against whatever symbol is
 * active at creation time and only ever evaluated while that symbol is the
 * active one — the underlying per-symbol streams (whale/footprint/delta)
 * simply aren't connected for any other symbol, so there's no data to
 * evaluate an inactive-symbol alert against. Alerts for other symbols stay
 * in the list (AlertsManager flags them), just dormant until you switch back.
 *
 * One-shot vs re-arm (per alert, user's choice at creation, default one-shot):
 *   - one-shot: fires once, then auto-disables (alertsStore.disableAfterFire).
 *   - re-arm:   stays enabled; the same edge-trigger that fired it also
 *               naturally allows it to fire again once the condition resets
 *               and re-crosses — no separate "armed" state needed.
 *
 * Every condition is edge-triggered (fires only on a false->true transition,
 * never every tick while a condition holds), and every detector seeds its
 * "current state" on first observation (per symbol/interval, or per newly
 * added alert) WITHOUT firing — so creating a price-above alert while price
 * is already above the target doesn't fire immediately, and toggling this
 * panel on doesn't dump a backlog of already-true conditions as false fires.
 */

import { useEffect, useRef, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useDeltaStore } from '../../store/deltaStore';
import { useWhaleStore } from '../../store/whaleStore';
import {
  useAlertsStore,
  type Alert,
  type PriceAlert,
  type WhaleAlert,
  type AbsorptionAlert,
  type DeltaAlert,
  type LevelAlert,
  type AlertSideFilter,
} from '../../store/alertsStore';
import { useToastStore } from '../../store/toastStore';
import { api } from '../../services/api';
import { createDeltaSwingDetector } from '../../utils/deltaSwingDetector';
import { formatPrice } from '../../utils/priceFormat';
import { playBeep } from '../../utils/beep';
import type { AbsorptionData, LevelsData } from '../../types/analytics';

const ABSORPTION_POLL_MS = 15_000;  // matches ExecutionDashboard/ClusterScanner
const LEVELS_POLL_MS = 5 * 60_000;  // matches ContextDashboard/TradeChecklist
const NEAR_LEVEL_PCT = 0.003;       // matches TradeChecklist's "near a key level" threshold

function fmtNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

function matchesSide(filter: AlertSideFilter, actual: 'buy' | 'sell'): boolean {
  return filter === 'any' || filter === actual;
}

export function AlertsEngine() {
  const { activeSymbol, activeInterval } = useMarketStore();
  const currentPrice = useMarketStore((s) => s.candles.at(-1)?.c ?? null);

  const delta = useDeltaStore((s) => s.delta);
  const trades = useWhaleStore((s) => s.trades);

  const alerts = useAlertsStore((s) => s.alerts);
  const soundEnabled = useAlertsStore((s) => s.soundEnabled);
  const disableAfterFire = useAlertsStore((s) => s.disableAfterFire);
  const markFired = useAlertsStore((s) => s.markFired);
  const addToast = useToastStore((s) => s.addToast);

  const [absorption, setAbsorption] = useState<AbsorptionData | null>(null);
  const [levels, setLevels] = useState<LevelsData | null>(null);

  // Runtime edge-trigger/dedupe state — refs so updates never re-render.
  const priceWasMetRef = useRef<Map<string, boolean>>(new Map());
  const levelWasNearRef = useRef<Map<string, boolean>>(new Map());
  const lastWhaleTimeRef = useRef<number | null>(null);
  const seenAbsorptionKeysRef = useRef<Set<string>>(new Set());
  const seededAbsorptionRef = useRef(false);
  const deltaDetectorRef = useRef(createDeltaSwingDetector());

  function activeAlertsOfType<T extends Alert['type']>(type: T): Extract<Alert, { type: T }>[] {
    return alerts.filter(
      (a): a is Extract<Alert, { type: T }> => a.type === type && a.symbol === activeSymbol && a.enabled
    );
  }

  function fire(alert: Alert, message: string, side: 'buy' | 'sell') {
    addToast(message, side);
    if (soundEnabled) playBeep(side);
    if (alert.rearm) markFired(alert.id);
    else disableAfterFire(alert.id);
  }

  // ── Symbol/interval change: reset every detector's runtime state ──────
  useEffect(() => {
    priceWasMetRef.current = new Map();
    levelWasNearRef.current = new Map();
    lastWhaleTimeRef.current = null;
    seenAbsorptionKeysRef.current = new Set();
    seededAbsorptionRef.current = false;
    deltaDetectorRef.current = createDeltaSwingDetector();
    setAbsorption(null);
    setLevels(null);
  }, [activeSymbol, activeInterval]);

  // ── Clean up runtime entries for alerts no longer enabled (deleted,
  // paused, or auto-disabled after a one-shot fire), so a later re-enable
  // seeds fresh instead of comparing against a stale leftover value. ──────
  useEffect(() => {
    const enabledIds = new Set(alerts.filter((a) => a.enabled).map((a) => a.id));
    for (const id of priceWasMetRef.current.keys()) if (!enabledIds.has(id)) priceWasMetRef.current.delete(id);
    for (const id of levelWasNearRef.current.keys()) if (!enabledIds.has(id)) levelWasNearRef.current.delete(id);
  }, [alerts]);

  // ── Absorption + Levels REST polls (own copies, same cadence as the
  // panels that already fetch them — this app's established pattern for
  // non-store analytics data) ─────────────────────────────────────────────
  useEffect(() => {
    let stopped = false;
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

  useEffect(() => {
    let stopped = false;
    async function fetchLevels() {
      try {
        const data = await api.getLevels(activeSymbol);
        if (!stopped) setLevels(data);
      } catch { if (!stopped) setLevels(null); }
    }
    fetchLevels();
    const timer = setInterval(fetchLevels, LEVELS_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [activeSymbol]);

  // ── Price-cross alerts ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentPrice === null) return;
    for (const alert of activeAlertsOfType('price') as PriceAlert[]) {
      const isMet = alert.direction === 'above' ? currentPrice > alert.targetPrice : currentPrice < alert.targetPrice;
      const prev = priceWasMetRef.current.get(alert.id);
      if (prev === undefined) { priceWasMetRef.current.set(alert.id, isMet); continue; }
      if (isMet && !prev) {
        fire(
          alert,
          `Price crossed ${alert.direction} ${formatPrice(alert.targetPrice)} (now ${formatPrice(currentPrice)})`,
          alert.direction === 'above' ? 'buy' : 'sell'
        );
      }
      priceWasMetRef.current.set(alert.id, isMet);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, alerts, activeSymbol]);

  // ── Level-touch alerts ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentPrice === null || levels === null) return;
    const levelPriceOf: Record<LevelAlert['level'], number> = {
      pdh: levels.pdh, pdl: levels.pdl, daily_open: levels.daily_open,
    };
    for (const alert of activeAlertsOfType('level') as LevelAlert[]) {
      const levelPrice = levelPriceOf[alert.level];
      const isNear = Math.abs(currentPrice - levelPrice) / currentPrice <= NEAR_LEVEL_PCT;
      const prev = levelWasNearRef.current.get(alert.id);
      if (prev === undefined) { levelWasNearRef.current.set(alert.id, isNear); continue; }
      if (isNear && !prev) {
        const label = alert.level === 'pdh' ? 'PDH' : alert.level === 'pdl' ? 'PDL' : 'Daily Open';
        fire(alert, `Price reached ${label} (${formatPrice(levelPrice)})`, currentPrice >= levelPrice ? 'sell' : 'buy');
      }
      levelWasNearRef.current.set(alert.id, isNear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, levels, alerts, activeSymbol]);

  // ── Whale alerts ───────────────────────────────────────────────────────
  useEffect(() => {
    if (lastWhaleTimeRef.current === null) {
      lastWhaleTimeRef.current = trades[0]?.time ?? 0;
      return;
    }
    const newOnes = trades.filter((t) => t.time > lastWhaleTimeRef.current!).sort((a, b) => a.time - b.time);
    if (newOnes.length === 0) return;
    lastWhaleTimeRef.current = trades[0].time;
    const whaleAlerts = activeAlertsOfType('whale') as WhaleAlert[];
    for (const t of newOnes) {
      for (const alert of whaleAlerts) {
        if (t.notional >= alert.minNotional && matchesSide(alert.side, t.side)) {
          fire(alert, `Whale ${t.side === 'buy' ? 'BUY' : 'SELL'} ${fmtNotional(t.notional)}`, t.side);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, alerts, activeSymbol]);

  // ── Absorption alerts ────────────────────────────────────────────────
  useEffect(() => {
    if (!absorption) return;
    if (!seededAbsorptionRef.current) {
      seededAbsorptionRef.current = true;
      for (const e of absorption.events) seenAbsorptionKeysRef.current.add(`${e.type}-${e.time}`);
      return;
    }
    const newOnes = absorption.events.filter((e) => !seenAbsorptionKeysRef.current.has(`${e.type}-${e.time}`));
    const absorptionAlerts = activeAlertsOfType('absorption') as AbsorptionAlert[];
    for (const e of newOnes) {
      seenAbsorptionKeysRef.current.add(`${e.type}-${e.time}`);
      const side: 'buy' | 'sell' = e.type === 'buy_absorption' ? 'buy' : 'sell';
      for (const alert of absorptionAlerts) {
        if (matchesSide(alert.side, side)) {
          fire(alert, `${side === 'buy' ? 'Buy' : 'Sell'} absorption detected`, side);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absorption, alerts, activeSymbol]);

  // ── Large delta swing alerts ───────────────────────────────────────────
  useEffect(() => {
    if (delta === null) return;
    const fired = deltaDetectorRef.current.observe(delta);
    if (!fired) return;
    const side: 'buy' | 'sell' = delta >= 0 ? 'buy' : 'sell';
    for (const alert of activeAlertsOfType('delta') as DeltaAlert[]) {
      if (matchesSide(alert.side, side)) {
        fire(alert, `Large ${delta >= 0 ? '+' : ''}delta swing (${delta.toFixed(2)})`, side);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delta, alerts, activeSymbol]);

  return null;
}
