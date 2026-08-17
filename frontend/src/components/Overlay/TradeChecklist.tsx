/**
 * TradeChecklist — the Stage 4 discipline panel: "am I ready to enter?"
 * Hybrid of AUTO items (read-only, filled from data the platform already
 * computes) and MANUAL items (checkboxes only the trader can tick).
 *
 * Mirrors ContextDashboard/ExecutionDashboard's pattern — read, don't
 * recompute, don't open new connections:
 *   - Levels/VWAP/Structure: own REST polls at the same cadence as
 *     ContextDashboard (this app has no shared analytics store, so each
 *     panel fetching its own copy is the established pattern — see
 *     ContextDashboard's header comment).
 *   - Delta:            deltaStore, mirrored from DeltaPanel's /ws/delta
 *                        connection (DeltaPanel is the sole writer).
 *   - Stack/Imbalance:   footprintSignalStore, mirrored from FootprintCanvas's
 *                        /ws/footprint connection (FootprintCanvas is the
 *                        sole writer).
 *   - Whale:             whaleStore, shared with WhaleTicker/ExecutionDashboard
 *                        — same WHALE_WINDOW=10 net-notional-direction logic
 *                        as ExecutionDashboard, reused as-is.
 *
 * Placement: bottom-right of the chart area — clear of ContextDashboard
 * (top-right) and ExecutionDashboard (top-left).
 *
 * Every AUTO item is evaluated against a Long/Short direction toggle owned
 * by this panel (independent of Position Calculator's own toggle) — "is
 * THIS trade, in this direction, worth taking" requires knowing the
 * direction being considered.
 */

import { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useDeltaStore } from '../../store/deltaStore';
import { useFootprintSignalStore } from '../../store/footprintSignalStore';
import { useWhaleStore } from '../../store/whaleStore';
import { useTradeChecklistStore, MANUAL_ITEMS } from '../../store/tradeChecklistStore';
import { api } from '../../services/api';
import type { LevelsData, VWAPData, StructureData } from '../../types/analytics';

const LEVELS_POLL_MS = 5 * 60_000;  // same cadence as ContextDashboard
const VWAP_POLL_MS = 30_000;
const STRUCTURE_POLL_MS = 15_000;
const WHALE_WINDOW = 10;            // matches ExecutionDashboard's window
const NEAR_LEVEL_PCT = 0.003;       // within 0.3% of price counts as "near"
const MIN_FAVORABLE_AUTO = 4;       // of 6 auto items, for the auto gate to pass

const UP_COLOR = '#26a641';
const DOWN_COLOR = '#f85149';
const NEUTRAL_COLOR = '#9598a1';
const WARN_COLOR = '#d29922';

type Direction = 'long' | 'short';
type ItemStatus = 'pass' | 'fail' | 'unknown';

interface AutoItem {
  label: string;
  status: ItemStatus;
  value: string;
}

/** bullish -> pass if direction is long, fail if short; bearish -> mirror; neither -> unknown. */
function directionalStatus(bullish: boolean, bearish: boolean, direction: Direction): ItemStatus {
  if (bullish) return direction === 'long' ? 'pass' : 'fail';
  if (bearish) return direction === 'short' ? 'pass' : 'fail';
  return 'unknown';
}

const STATUS_COLOR: Record<ItemStatus, string> = { pass: UP_COLOR, fail: DOWN_COLOR, unknown: NEUTRAL_COLOR };
const STATUS_SYMBOL: Record<ItemStatus, string> = { pass: '✓', fail: '✗', unknown: '—' };

export function TradeChecklist() {
  const { activeSymbol, activeInterval } = useMarketStore();
  const currentPrice = useMarketStore((s) => s.candles.at(-1)?.c ?? null);
  const lastCandleTime = useMarketStore((s) => s.candles.at(-1)?.t ?? null);

  const [collapsed, setCollapsed] = useState(false);
  const [direction, setDirection] = useState<Direction>('long');
  const [levels, setLevels] = useState<LevelsData | null>(null);
  const [vwap, setVwap] = useState<VWAPData | null>(null);
  const [structure, setStructure] = useState<StructureData | null>(null);

  const delta = useDeltaStore((s) => s.delta);
  const signal = useFootprintSignalStore();
  const trades = useWhaleStore((s) => s.trades);

  const { manualChecks, setCheck, syncSymbol } = useTradeChecklistStore();

  // Fresh symbol = fresh trade idea: wipes manual ticks the moment the
  // active symbol changes, no-ops otherwise.
  useEffect(() => { syncSymbol(activeSymbol); }, [activeSymbol, syncSymbol]);

  useEffect(() => {
    let stopped = false;
    setLevels(null);
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

  useEffect(() => {
    let stopped = false;
    setVwap(null);
    async function fetchVwap() {
      try {
        const data = await api.getSessionVWAP(activeSymbol, activeInterval);
        if (!stopped) setVwap(data);
      } catch { if (!stopped) setVwap(null); }
    }
    fetchVwap();
    const timer = setInterval(fetchVwap, VWAP_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [activeSymbol, activeInterval, lastCandleTime]);

  useEffect(() => {
    let stopped = false;
    setStructure(null);
    async function fetchStructure() {
      try {
        const data = await api.getStructure(activeSymbol, activeInterval);
        if (!stopped) setStructure(data);
      } catch { if (!stopped) setStructure(null); }
    }
    fetchStructure();
    const timer = setInterval(fetchStructure, STRUCTURE_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [activeSymbol, activeInterval]);

  // ── 1. Trend aligned ─────────────────────────────────────────────────
  const trend = structure?.current_trend ?? null;
  const trendStatus = directionalStatus(trend === 'up', trend === 'down', direction);
  const trendValue = trend === 'up' ? 'Up' : trend === 'down' ? 'Down' : trend === 'range' ? 'Range' : '—';

  // ── 2. Price vs VWAP ─────────────────────────────────────────────────
  const vwapPosition: 'Above' | 'Below' | null =
    currentPrice !== null && vwap !== null
      ? currentPrice > vwap.current ? 'Above' : 'Below'
      : null;
  const vwapStatus = directionalStatus(vwapPosition === 'Above', vwapPosition === 'Below', direction);

  // ── 3. Near a key level — informational, never fails ────────────────
  const nearestLevel = (() => {
    if (!levels || currentPrice === null) return null;
    const candidates = [
      { label: 'Daily Open', price: levels.daily_open },
      { label: 'PDH', price: levels.pdh },
      { label: 'PDL', price: levels.pdl },
    ];
    const closest = candidates.reduce((best, c) =>
      Math.abs(currentPrice - c.price) < Math.abs(currentPrice - best.price) ? c : best
    );
    return { label: closest.label, distance: Math.abs(currentPrice - closest.price), decimals: levels.decimals };
  })();
  const isNear = nearestLevel !== null && currentPrice !== null && nearestLevel.distance / currentPrice <= NEAR_LEVEL_PCT;
  const nearStatus: ItemStatus = isNear ? 'pass' : 'unknown';
  const nearValue = nearestLevel
    ? `${nearestLevel.label} (${nearestLevel.distance.toFixed(nearestLevel.decimals)})`
    : '—';

  // ── 4. Recent structure event — BOS/CHOCH only (structure_breaks), not sweeps ──
  const lastBreak = (() => {
    if (!structure || structure.structure_breaks.length === 0) return null;
    return structure.structure_breaks.reduce((latest, b) => (b.time > latest.time ? b : latest));
  })();
  const eventStatus = directionalStatus(lastBreak?.direction === 'bullish', lastBreak?.direction === 'bearish', direction);
  const eventValue = lastBreak ? `${lastBreak.type} ${lastBreak.direction}` : '—';

  // ── 5. Delta supporting ──────────────────────────────────────────────
  const deltaStatus = directionalStatus(delta !== null && delta > 0, delta !== null && delta < 0, direction);
  const deltaValue = delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;

  // ── 6. Order-flow signal — stack/imbalance + whale, same votes as
  // ExecutionDashboard. Both agreeing with the chosen direction -> pass;
  // both opposing -> fail; no signal or a conflicting pair -> unknown
  // (ambiguous shouldn't count either way).
  const stackVote: Direction | 'neutral' = signal.side === 'buy' ? 'long' : signal.side === 'sell' ? 'short' : 'neutral';
  const whaleDirection: 'Buy' | 'Sell' | null = (() => {
    const recent = trades.slice(0, WHALE_WINDOW);
    if (recent.length === 0) return null;
    let buyNotional = 0, sellNotional = 0;
    for (const t of recent) {
      if (t.side === 'buy') buyNotional += t.notional; else sellNotional += t.notional;
    }
    if (buyNotional === sellNotional) return null;
    return buyNotional > sellNotional ? 'Buy' : 'Sell';
  })();
  const whaleVote: Direction | 'neutral' = whaleDirection === 'Buy' ? 'long' : whaleDirection === 'Sell' ? 'short' : 'neutral';
  const flowVotes = [stackVote, whaleVote].filter((v) => v !== 'neutral') as Direction[];
  const flowStatus: ItemStatus =
    flowVotes.length === 0 ? 'unknown' :
    flowVotes.every((v) => v === direction) ? 'pass' :
    flowVotes.every((v) => v !== direction) ? 'fail' :
    'unknown';
  const flowParts = [
    signal.side ? `${signal.side === 'buy' ? 'Buy' : 'Sell'} ${signal.isStack ? 'stack' : 'imbalance'}` : null,
    whaleDirection ? `Whale ${whaleDirection}` : null,
  ].filter(Boolean);
  const flowValue = flowParts.length ? flowParts.join(', ') : '—';

  const autoItems: AutoItem[] = [
    { label: 'Trend aligned',    status: trendStatus,  value: trendValue },
    { label: 'Price vs VWAP',    status: vwapStatus,   value: vwapPosition ?? '—' },
    { label: 'Near a key level', status: nearStatus,   value: nearValue },
    { label: 'Structure event',  status: eventStatus,  value: eventValue },
    { label: 'Delta supporting', status: deltaStatus,  value: deltaValue },
    { label: 'Order-flow signal',status: flowStatus,   value: flowValue },
  ];

  const autoPassCount = autoItems.filter((i) => i.status === 'pass').length;
  const autoFailCount = autoItems.filter((i) => i.status === 'fail').length;

  const manualAllChecked = MANUAL_ITEMS.every((m) => manualChecks[m.id]);

  // Readiness rule:
  //   1) Any manual item unticked           -> NOT READY (discipline gate)
  //   2) All manual ticked, but auto items
  //      have a fail OR fewer than 4 of 6
  //      pass                               -> CHECK ITEMS
  //   3) All manual ticked AND zero fails
  //      AND >=4 of 6 auto items pass       -> READY
  const verdict: 'READY' | 'CHECK ITEMS' | 'NOT READY' =
    !manualAllChecked ? 'NOT READY' :
    (autoFailCount > 0 || autoPassCount < MIN_FAVORABLE_AUTO) ? 'CHECK ITEMS' :
    'READY';
  const verdictColor = verdict === 'READY' ? UP_COLOR : verdict === 'CHECK ITEMS' ? WARN_COLOR : DOWN_COLOR;

  return (
    <div
      className="absolute bottom-3 right-3 z-20 select-none text-xs font-mono"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color-soft)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        width: collapsed ? 'auto' : 240,
      }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 gap-3 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded"
      >
        <span className="font-semibold tracking-wide uppercase text-[10px] text-[var(--text-muted)]">Checklist</span>
        <span className="flex items-center gap-2">
          <span className="font-bold text-[10px]" style={{ color: verdictColor }}>{verdict}</span>
          <span className="text-[var(--text-muted)]">{collapsed ? '▸' : '▾'}</span>
        </span>
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-2.5 border-t border-[var(--border-color-soft)] pt-2">
          <div className="flex items-center gap-1 p-0.5 rounded" style={{ background: 'var(--bg-app)' }}>
            {(['long', 'short'] as Direction[]).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className="flex-1 px-2 py-1 rounded text-[11px] font-medium"
                style={{
                  background: direction === d ? (d === 'long' ? '#089981' : '#F23645') : 'transparent',
                  color: direction === d ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                {d === 'long' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>

          <div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Auto</div>
            <div className="flex flex-col gap-0.5">
              {autoItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-secondary)] flex items-center gap-1.5 whitespace-nowrap">
                    <span style={{ color: STATUS_COLOR[item.status] }}>{STATUS_SYMBOL[item.status]}</span>
                    {item.label}
                  </span>
                  <span className="text-right truncate" style={{ color: STATUS_COLOR[item.status] }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">Manual</div>
            <div className="flex flex-col gap-1">
              {MANUAL_ITEMS.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualChecks[item.id]}
                    onChange={(e) => setCheck(item.id, e.target.checked)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border-color-soft)]">
            <span className="text-[var(--text-muted)]">Verdict</span>
            <span className="font-bold" style={{ color: verdictColor }}>{verdict}</span>
          </div>
        </div>
      )}
    </div>
  );
}
