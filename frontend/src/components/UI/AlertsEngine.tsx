/**
 * AlertsEngine — non-visual, always-mounted evaluation loop for user price
 * alerts. Mounted unconditionally in App.tsx (not gated behind the Alerts
 * manager modal or any chart toggle) so alerts keep firing in the background
 * regardless of what panels/modals are open. Reads only the live candle
 * stream already in marketStore — no extra requests or connections.
 *
 * Scope: ACTIVE SYMBOL ONLY. Alerts are created against whatever symbol is
 * active at creation time and only ever evaluated while that symbol is the
 * active one — only the active symbol's candles are streamed, so there's no
 * price to evaluate an inactive-symbol alert against. Alerts for other
 * symbols stay in the list (AlertsManager flags them), just dormant until you
 * switch back.
 *
 * One-shot vs re-arm (per alert, user's choice at creation, default one-shot):
 *   - one-shot: fires once, then auto-disables (alertsStore.disableAfterFire).
 *   - re-arm:   stays enabled; the same edge-trigger that fired it also
 *               naturally allows it to fire again once price crosses back
 *               and re-crosses — no separate "armed" state needed.
 *
 * The condition is edge-triggered (fires only on a false->true transition,
 * never every tick while it holds), and each alert seeds its "current state"
 * on first observation (per symbol/interval, or per newly added alert)
 * WITHOUT firing — so creating a price-above alert while price is already
 * above the target doesn't fire immediately.
 */

import { useEffect, useRef } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useAlertsStore, type Alert } from '../../store/alertsStore';
import { useToastStore } from '../../store/toastStore';
import { formatPrice } from '../../utils/priceFormat';
import { playBeep } from '../../utils/beep';

export function AlertsEngine() {
  const { activeSymbol, activeInterval } = useMarketStore();
  const currentPrice = useMarketStore((s) => s.candles.at(-1)?.c ?? null);

  const alerts = useAlertsStore((s) => s.alerts);
  const soundEnabled = useAlertsStore((s) => s.soundEnabled);
  const disableAfterFire = useAlertsStore((s) => s.disableAfterFire);
  const markFired = useAlertsStore((s) => s.markFired);
  const addToast = useToastStore((s) => s.addToast);

  // Runtime edge-trigger state — a ref so updates never re-render.
  const priceWasMetRef = useRef<Map<string, boolean>>(new Map());

  function fire(alert: Alert, message: string, side: 'buy' | 'sell') {
    addToast(message, side);
    if (soundEnabled) playBeep(side);
    if (alert.rearm) markFired(alert.id);
    else disableAfterFire(alert.id);
  }

  // ── Symbol/interval change: reset runtime state ───────────────────────
  useEffect(() => {
    priceWasMetRef.current = new Map();
  }, [activeSymbol, activeInterval]);

  // ── Clean up runtime entries for alerts no longer enabled (deleted,
  // paused, or auto-disabled after a one-shot fire), so a later re-enable
  // seeds fresh instead of comparing against a stale leftover value. ──────
  useEffect(() => {
    const enabledIds = new Set(alerts.filter((a) => a.enabled).map((a) => a.id));
    for (const id of priceWasMetRef.current.keys()) if (!enabledIds.has(id)) priceWasMetRef.current.delete(id);
  }, [alerts]);

  // ── Price-cross alerts ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentPrice === null) return;
    const active = alerts.filter((a) => a.type === 'price' && a.symbol === activeSymbol && a.enabled);
    for (const alert of active) {
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

  return null;
}
