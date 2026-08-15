/**
 * ExecutionDashboard — the Stage 3 payoff panel: a compact read-only summary
 * that collects what the other Stage 3 order-flow features already compute
 * (Delta/CVD, Absorption, Stacked Imbalance, Whale activity) into one glance.
 * Mirrors ContextDashboard's pattern exactly — read, don't recompute — with
 * one derived value at the bottom (Execution Bias).
 *
 * Placement: top-left, below the symbol legend (TradingChart.tsx, top-2) and
 * VWAP's label (VWAPOverlay.tsx, top-8) — kept clear of both. ContextDashboard
 * owns top-right, so the two panels never collide even when both are on.
 *
 * Data sources (all already streaming/fetching elsewhere — no new
 * connections opened here):
 *   - Delta/CVD:        deltaStore, mirrored from DeltaPanel's own
 *                        /ws/delta connection (DeltaPanel is the sole writer).
 *   - Absorption:        polls GET /indicators/absorption directly, same
 *                        cadence as AbsorptionOverlay — a REST poll, not a
 *                        stream, so a second call here doesn't duplicate a
 *                        connection the way a second WebSocket would.
 *   - Imbalance/Stacked: footprintSignalStore, mirrored from FootprintCanvas's
 *                        own /ws/footprint connection using the same
 *                        isImbalance()/findStackRuns() it already draws with
 *                        (FootprintCanvas is the sole writer).
 *   - Whale:             whaleStore, shared with WhaleTicker — but only
 *                        populated while the Whales overlay is toggled on,
 *                        since WhaleMarkers owns the /ws/whales connection.
 *                        Reads "—" the rest of the time, same as any other
 *                        row with no data, never a crash.
 */

import { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useDeltaStore } from '../../store/deltaStore';
import { useFootprintSignalStore } from '../../store/footprintSignalStore';
import { useWhaleStore } from '../../store/whaleStore';
import { api } from '../../services/api';
import type { AbsorptionData } from '../../types/analytics';

const ABSORPTION_POLL_MS = 15_000; // matches AbsorptionOverlay's own cadence
const WHALE_WINDOW = 10;           // most recent whale trades considered for net direction — matches WhaleTicker's visible slice

const UP_COLOR = '#26a641';
const DOWN_COLOR = '#f85149';
const NEUTRAL_COLOR = '#9598a1';

type Vote = 'long' | 'short' | 'neutral';

export function ExecutionDashboard() {
  const { activeSymbol, activeInterval } = useMarketStore();
  const [collapsed, setCollapsed] = useState(false);
  const [absorption, setAbsorption] = useState<AbsorptionData | null>(null);

  const delta    = useDeltaStore((s) => s.delta);
  const cvdTrend = useDeltaStore((s) => s.cvdTrend);
  const signal   = useFootprintSignalStore();
  const trades   = useWhaleStore((s) => s.trades);

  // ── Poll absorption — REST, same cadence as AbsorptionOverlay ──────────
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

  // ── Row 1: Delta + CVD trend ────────────────────────────────────────────
  const deltaColor = delta === null ? NEUTRAL_COLOR : delta >= 0 ? UP_COLOR : DOWN_COLOR;
  const cvdArrow = cvdTrend === 'rising' ? '▲' : cvdTrend === 'falling' ? '▼' : cvdTrend === 'flat' ? '▬' : null;
  const cvdArrowColor = cvdTrend === 'rising' ? UP_COLOR : cvdTrend === 'falling' ? DOWN_COLOR : NEUTRAL_COLOR;
  const deltaText = delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;

  // ── Row 2: Absorption — most recent event in the fetched window ────────
  const lastAbsorption = (() => {
    if (!absorption || absorption.events.length === 0) return null;
    return absorption.events.reduce((latest, e) => (e.time > latest.time ? e : latest));
  })();
  const absorptionLabel = lastAbsorption
    ? lastAbsorption.type === 'buy_absorption' ? 'Buy absorption' : 'Sell absorption'
    : '—';
  const absorptionColor = lastAbsorption
    ? lastAbsorption.type === 'buy_absorption' ? UP_COLOR : DOWN_COLOR
    : NEUTRAL_COLOR;

  // ── Row 3: Imbalance / Stacked — footprintSignalStore ───────────────────
  const stackLabel = signal.side === null
    ? '—'
    : `${signal.side === 'buy' ? 'Buy' : 'Sell'} ${signal.isStack ? 'stack' : 'imbalance'}`;
  const stackColor = signal.side === 'buy' ? UP_COLOR : signal.side === 'sell' ? DOWN_COLOR : NEUTRAL_COLOR;

  // ── Row 4: Whale — net notional direction over the most recent trades ──
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
  const whaleColor = whaleDirection === 'Buy' ? UP_COLOR : whaleDirection === 'Sell' ? DOWN_COLOR : NEUTRAL_COLOR;

  // ── Row 5: Execution Bias — majority-style lean over the 4 signals above.
  // Each signal casts long/short/neutral (missing or flat data → neutral, so
  // absent signals can't tip the vote either way, same principle as
  // ContextDashboard's Bias). LONG needs >=2 long votes AND strictly more
  // long than short votes; SHORT is the mirror image; anything else
  // (including ties like 2-2, or fewer than 2 votes either way) is WAIT.
  const deltaVote: Vote = delta === null || delta === 0 ? 'neutral' : delta > 0 ? 'long' : 'short';
  const absorptionVote: Vote =
    lastAbsorption?.type === 'buy_absorption' ? 'long' :
    lastAbsorption?.type === 'sell_absorption' ? 'short' : 'neutral';
  const stackVote: Vote = signal.side === 'buy' ? 'long' : signal.side === 'sell' ? 'short' : 'neutral';
  const whaleVote: Vote = whaleDirection === 'Buy' ? 'long' : whaleDirection === 'Sell' ? 'short' : 'neutral';

  const votes = [deltaVote, absorptionVote, stackVote, whaleVote];
  const longVotes  = votes.filter((v) => v === 'long').length;
  const shortVotes = votes.filter((v) => v === 'short').length;

  const bias: 'LONG' | 'SHORT' | 'WAIT' =
    longVotes >= 2 && longVotes > shortVotes ? 'LONG' :
    shortVotes >= 2 && shortVotes > longVotes ? 'SHORT' :
    'WAIT';
  const biasColor = bias === 'LONG' ? UP_COLOR : bias === 'SHORT' ? DOWN_COLOR : NEUTRAL_COLOR;

  return (
    <div
      className="absolute z-20 select-none text-xs font-mono"
      style={{
        top: 56, // clears the symbol legend (top-2) and VWAP's label (top-8)
        left: 12,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color-soft)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        width: collapsed ? 'auto' : 176,
      }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 gap-3 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded"
      >
        <span className="font-semibold tracking-wide uppercase text-[10px] text-[var(--text-muted)]">Execution</span>
        <span className="text-[var(--text-muted)]">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2 flex flex-col gap-0.5 border-t border-[var(--border-color-soft)] pt-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-muted)] whitespace-nowrap">Delta</span>
            <span className="font-semibold text-right">
              <span style={{ color: deltaColor }}>{deltaText}</span>
              {cvdArrow && <span className="ml-1" style={{ color: cvdArrowColor }}>{cvdArrow}</span>}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-muted)] whitespace-nowrap">Absorption</span>
            <span className="font-semibold text-right" style={{ color: absorptionColor }}>{absorptionLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-muted)] whitespace-nowrap">Stack</span>
            <span className="font-semibold text-right" style={{ color: stackColor }}>{stackLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-muted)] whitespace-nowrap">Whale</span>
            <span className="font-semibold text-right" style={{ color: whaleColor }}>{whaleDirection ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-3 mt-0.5 pt-1 border-t border-[var(--border-color-soft)]">
            <span className="text-[var(--text-muted)] whitespace-nowrap">Bias</span>
            <span className="font-bold text-right" style={{ color: biasColor }}>{bias}</span>
          </div>
        </div>
      )}
    </div>
  );
}
