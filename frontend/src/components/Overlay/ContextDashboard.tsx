/**
 * ContextDashboard — the Stage 2 payoff panel: a compact read-only summary
 * that collects what the other Stage 2 features already compute (trend from
 * Market Structure, VWAP position, session hours, institutional levels,
 * BOS/CHOCH/sweep events) into one glance. It derives nothing new except the
 * single Bias lean at the bottom.
 *
 * Deliberately fetches its own copies of /levels, /vwap, /structure rather
 * than sharing state with LevelsOverlay/VWAPOverlay/StructureOverlay — this
 * app has no shared analytics store, each overlay already owns its own fetch
 * + poll loop, and this panel is meant to work whether or not those overlays
 * are toggled on. It mirrors each source's existing cadence (same poll
 * intervals, same refetch triggers) so it adds no more load than turning
 * that overlay on would.
 */

import { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { api } from '../../services/api';
import { SESSIONS } from './SessionBoxes';
import type { LevelsData, VWAPData, StructureData } from '../../types/analytics';

const LEVELS_POLL_MS = 5 * 60_000;  // daily levels — same cadence as LevelsOverlay
const VWAP_POLL_MS = 30_000;        // same cadence as VWAPOverlay
const STRUCTURE_POLL_MS = 15_000;   // same cadence as StructureOverlay
const CLOCK_TICK_MS = 30_000;       // re-checks the Session row against the live clock

const UP_COLOR = '#26a641';
const DOWN_COLOR = '#f85149';
const NEUTRAL_COLOR = '#9598a1';

type Direction = 'bullish' | 'bearish';

/** Which of SESSIONS' fixed UTC windows the given instant falls inside — mirrors SessionBoxes' own hour math, just evaluated at a point instead of drawn as a band. */
function activeSessionLabels(nowMs: number): string[] {
  const hour = nowMs / 3_600_000 - Math.floor(nowMs / 86_400_000) * 24;
  return SESSIONS.filter((s) => hour >= s.startHour && hour < s.endHour).map((s) => s.label);
}

export function ContextDashboard() {
  const { activeSymbol, activeInterval } = useMarketStore();
  const currentPrice = useMarketStore((s) => s.candles.at(-1)?.c ?? null);
  const lastCandleTime = useMarketStore((s) => s.candles.at(-1)?.t ?? null);

  const [collapsed, setCollapsed] = useState(false);
  const [levels, setLevels] = useState<LevelsData | null>(null);
  const [vwap, setVwap] = useState<VWAPData | null>(null);
  const [structure, setStructure] = useState<StructureData | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

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

  const trend = structure?.current_trend ?? null;

  const vwapPosition: 'Above' | 'Below' | null =
    currentPrice !== null && vwap !== null
      ? currentPrice > vwap.current ? 'Above' : 'Below'
      : null;

  const activeSessions = activeSessionLabels(now);
  const sessionLabel = activeSessions.length ? activeSessions.join(' + ') : 'None';

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

  const lastEvent = (() => {
    if (!structure) return null;
    const all = [...structure.structure_breaks, ...structure.liquidity_sweeps];
    if (all.length === 0) return null;
    return all.reduce((latest, evt) => (evt.time > latest.time ? evt : latest));
  })();

  // Bias rule — 2-of-3 majority vote. Each signal scores bullish/bearish/
  // neutral independently (a missing signal scores neutral, same as an
  // actually-neutral one, so absent data can't tip the vote either way):
  //   trend: up → bullish, down → bearish, range/missing → neutral
  //   VWAP: Above → bullish, Below → bearish, missing → neutral
  //   last event: direction bullish/bearish carries through, missing → neutral
  // Bullish needs 2+ bullish votes (and not 2+ bearish); Bearish needs 2+
  // bearish votes; anything else — including a 1-1-1 or 0-0-3 split — is
  // Neutral.
  const trendVote: Direction | 'neutral' =
    trend === 'up' ? 'bullish' : trend === 'down' ? 'bearish' : 'neutral';
  const vwapVote: Direction | 'neutral' =
    vwapPosition === 'Above' ? 'bullish' : vwapPosition === 'Below' ? 'bearish' : 'neutral';
  const eventVote: Direction | 'neutral' = lastEvent?.direction ?? 'neutral';

  const votes = [trendVote, vwapVote, eventVote];
  const bullishVotes = votes.filter((v) => v === 'bullish').length;
  const bearishVotes = votes.filter((v) => v === 'bearish').length;

  const bias: 'Bullish' | 'Bearish' | 'Neutral' =
    bullishVotes >= 2 && bearishVotes < 2 ? 'Bullish' :
    bearishVotes >= 2 ? 'Bearish' :
    'Neutral';

  const directionColor = (dir: Direction | null): string =>
    dir === 'bullish' ? UP_COLOR : dir === 'bearish' ? DOWN_COLOR : NEUTRAL_COLOR;

  const trendColor = trend === 'up' ? UP_COLOR : trend === 'down' ? DOWN_COLOR : NEUTRAL_COLOR;
  const vwapColor =
    vwapPosition === 'Above' ? UP_COLOR : vwapPosition === 'Below' ? DOWN_COLOR : NEUTRAL_COLOR;
  const biasColor = bias === 'Bullish' ? UP_COLOR : bias === 'Bearish' ? DOWN_COLOR : NEUTRAL_COLOR;

  const rows: { label: string; value: string; color: string }[] = [
    { label: 'Trend',   value: trend === 'up' ? 'Up' : trend === 'down' ? 'Down' : trend === 'range' ? 'Range' : '—', color: trendColor },
    { label: 'VWAP',    value: vwapPosition ?? '—', color: vwapColor },
    { label: 'Session', value: sessionLabel, color: NEUTRAL_COLOR },
    {
      label: 'Near',
      value: nearestLevel
        ? `${nearestLevel.label} (${nearestLevel.distance.toFixed(nearestLevel.decimals)})`
        : '—',
      color: NEUTRAL_COLOR,
    },
    {
      label: 'Event',
      value: lastEvent ? `${lastEvent.type.toUpperCase()} ${lastEvent.direction}` : '—',
      color: lastEvent ? directionColor(lastEvent.direction) : NEUTRAL_COLOR,
    },
    { label: 'Bias', value: bias, color: biasColor },
  ];

  return (
    <div
      className="absolute top-2 right-3 z-20 select-none text-xs font-mono"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color-soft)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        width: collapsed ? 'auto' : 188,
      }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 gap-3 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded"
      >
        <span className="font-semibold tracking-wide uppercase text-[10px] text-[var(--text-muted)]">Context</span>
        <span className="text-[var(--text-muted)]">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2 flex flex-col gap-0.5 border-t border-[var(--border-color-soft)] pt-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-muted)] whitespace-nowrap">{row.label}</span>
              <span className="font-semibold text-right" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
