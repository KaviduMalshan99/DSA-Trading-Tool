/**
 * Client-side ports of three of the backend's kline-only analytics
 * (backend/app/analytics/{structure,vwap,levels}.py): pure functions of an
 * OHLCV candle list, no trade/order-book data involved.
 *
 * Why a port instead of calling the backend with a cutoff param: the backend
 * endpoints always fetch fresh klines straight from Binance for "now" (see
 * `_fetch_klines*` in api/indicators.py) — there's no way to ask them for
 * "as of this past timestamp". Replay mode already has the exact candle
 * window it needs sitting in marketStore (gated by replayStore's cursorTime),
 * so recomputing locally against that window — using the *same* algorithms —
 * keeps replay in sync with the visible candles automatically and doesn't
 * require touching the backend or adding a new data source. Live mode is
 * untouched; these functions only run while replay is active.
 */
import type { Candle } from '../types/market';
import type {
  StructureData, SwingPoint, StructureBreak, LiquiditySweep, MarketTrend, SwingLabel,
  VWAPData, VWAPPoint, LevelsData,
} from '../types/analytics';

const DAY_MS = 86_400_000;

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

export function utcDayStartMs(epochMs: number): number {
  return Math.floor(epochMs / DAY_MS) * DAY_MS;
}

// ── Structure (port of structure.py) ─────────────────────────────────────────

function labelSwings(swings: SwingPoint[]): void {
  let prevHigh: number | null = null;
  let prevLow: number | null = null;
  for (const swing of swings) {
    if (swing.type === 'high') {
      if (prevHigh !== null) swing.label = swing.price > prevHigh ? 'HH' : 'LH';
      prevHigh = swing.price;
    } else {
      if (prevLow !== null) swing.label = swing.price > prevLow ? 'HL' : 'LL';
      prevLow = swing.price;
    }
  }
}

function findLast<T>(arr: T[], pred: (x: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i];
  return undefined;
}

function deriveTrend(swings: SwingPoint[]): MarketTrend {
  const lastHigh: SwingLabel | null = findLast(swings, (s) => s.type === 'high' && !!s.label)?.label ?? null;
  const lastLow: SwingLabel | null = findLast(swings, (s) => s.type === 'low' && !!s.label)?.label ?? null;
  if (lastHigh === 'HH' && lastLow === 'HL') return 'up';
  if (lastHigh === 'LH' && lastLow === 'LL') return 'down';
  return 'range';
}

function detectBreaks(
  candles: Candle[],
  swings: SwingPoint[],
  swingStrength: number
): { breaks: StructureBreak[]; sweeps: LiquiditySweep[] } {
  const timeToIndex = new Map<number, number>();
  candles.forEach((c, i) => timeToIndex.set(c.t, i));

  const confirmsAt = new Map<number, SwingPoint[]>();
  for (const swing of swings) {
    const idx = timeToIndex.get(swing.time);
    if (idx === undefined) continue;
    const confirmIndex = idx + swingStrength;
    if (!confirmsAt.has(confirmIndex)) confirmsAt.set(confirmIndex, []);
    confirmsAt.get(confirmIndex)!.push(swing);
  }

  const breaks: StructureBreak[] = [];
  const sweeps: LiquiditySweep[] = [];
  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;
  let highBroken = false;
  let lowBroken = false;
  let trend: MarketTrend = 'range';

  candles.forEach((candle, k) => {
    for (const swing of confirmsAt.get(k) ?? []) {
      if (swing.type === 'high') { lastHigh = swing; highBroken = false; }
      else { lastLow = swing; lowBroken = false; }
    }

    if (lastHigh && (lastHigh as SwingPoint).label === 'HH' && lastLow && (lastLow as SwingPoint).label === 'HL') trend = 'up';
    else if (lastHigh && (lastHigh as SwingPoint).label === 'LH' && lastLow && (lastLow as SwingPoint).label === 'LL') trend = 'down';
    else trend = 'range';

    const close = candle.c;
    let broke = false;
    if (trend === 'up') {
      if (lastLow && !lowBroken && close < (lastLow as SwingPoint).price) {
        breaks.push({ time: candle.t, price: (lastLow as SwingPoint).price, type: 'CHOCH', direction: 'bearish' });
        lowBroken = true; broke = true;
      } else if (lastHigh && !highBroken && close > (lastHigh as SwingPoint).price) {
        breaks.push({ time: candle.t, price: (lastHigh as SwingPoint).price, type: 'BOS', direction: 'bullish' });
        highBroken = true; broke = true;
      }
    } else if (trend === 'down') {
      if (lastHigh && !highBroken && close > (lastHigh as SwingPoint).price) {
        breaks.push({ time: candle.t, price: (lastHigh as SwingPoint).price, type: 'CHOCH', direction: 'bullish' });
        highBroken = true; broke = true;
      } else if (lastLow && !lowBroken && close < (lastLow as SwingPoint).price) {
        breaks.push({ time: candle.t, price: (lastLow as SwingPoint).price, type: 'BOS', direction: 'bearish' });
        lowBroken = true; broke = true;
      }
    }

    if (!broke) {
      const { h: high, l: low } = candle;
      if (lastHigh && !highBroken && high > (lastHigh as SwingPoint).price && close <= (lastHigh as SwingPoint).price) {
        sweeps.push({ time: candle.t, price: (lastHigh as SwingPoint).price, type: 'sweep', direction: 'bearish' });
      }
      if (lastLow && !lowBroken && low < (lastLow as SwingPoint).price && close >= (lastLow as SwingPoint).price) {
        sweeps.push({ time: candle.t, price: (lastLow as SwingPoint).price, type: 'sweep', direction: 'bullish' });
      }
    }
  });

  return { breaks, sweeps };
}

/** `candles` must be in chronological order. Mirrors `detect_swings` exactly. */
export function detectSwingsFromCandles(candles: Candle[], decimals: number, swingStrength = 3): StructureData {
  const n = swingStrength;
  const swings: SwingPoint[] = [];

  if (n < 1 || candles.length < 2 * n + 1) {
    return { swings: [], swing_strength: swingStrength, decimals, current_trend: 'range', structure_breaks: [], liquidity_sweeps: [] };
  }

  for (let i = n; i < candles.length - n; i++) {
    const candle = candles[i];
    const { h: high, l: low } = candle;

    let isHigh = true;
    for (let j = i - n; j < i && isHigh; j++) if (!(high > candles[j].h)) isHigh = false;
    if (isHigh) for (let j = i + 1; j <= i + n && isHigh; j++) if (!(high >= candles[j].h)) isHigh = false;
    if (isHigh) swings.push({ time: candle.t, price: round(high, decimals), type: 'high', label: null });

    let isLow = true;
    for (let j = i - n; j < i && isLow; j++) if (!(low < candles[j].l)) isLow = false;
    if (isLow) for (let j = i + 1; j <= i + n && isLow; j++) if (!(low <= candles[j].l)) isLow = false;
    if (isLow) swings.push({ time: candle.t, price: round(low, decimals), type: 'low', label: null });
  }

  labelSwings(swings);
  const { breaks, sweeps } = detectBreaks(candles, swings, swingStrength);
  return {
    swings,
    swing_strength: swingStrength,
    decimals,
    current_trend: deriveTrend(swings),
    structure_breaks: breaks,
    liquidity_sweeps: sweeps,
  };
}

// ── Session VWAP (port of vwap.py) ───────────────────────────────────────────

/** `candles` must be in chronological order. Mirrors `compute_session_vwap`. */
export function computeSessionVWAPFromCandles(candles: Candle[], decimals: number, sessionStart?: number): VWAPData | null {
  if (candles.length === 0) return null;
  const start = sessionStart ?? utcDayStartMs(candles[candles.length - 1].t);

  const points: VWAPPoint[] = [];
  let cumPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    if (c.t < start) continue;
    const vol = c.v;
    const typical = (c.h + c.l + c.c) / 3;
    cumPV += typical * vol;
    cumVol += vol;
    if (cumVol <= 0) continue;
    points.push({ time: c.t, vwap: round(cumPV / cumVol, decimals) });
  }
  if (points.length === 0) return null;
  return { points, current: points[points.length - 1].vwap, session_start: start, decimals };
}

// ── Institutional levels, approximated from already-loaded intraday candles ─
//
// The backend fetches real 1d klines for this. Replay only has the active
// interval's candles in marketStore, so this aggregates the loaded window
// into "today so far" / "prior day" by UTC calendar day instead. Works for
// any interval that packs multiple bars into a day (1m through 12h, and 1d
// itself); degrades for 3d/1w/1M where a single bar spans multiple days.

export function computeLevelsFromIntraday(candles: Candle[], decimals: number, asOfMs: number): LevelsData | null {
  const todayStart = utcDayStartMs(asOfMs);
  const priorDayStart = todayStart - DAY_MS;

  const todayCandles = candles.filter((c) => c.t >= todayStart && c.t <= asOfMs);
  const priorDayCandles = candles.filter((c) => c.t >= priorDayStart && c.t < todayStart);
  if (todayCandles.length === 0 || priorDayCandles.length === 0) return null;

  const dailyOpen = todayCandles[0].o;
  const pdh = Math.max(...priorDayCandles.map((c) => c.h));
  const pdl = Math.min(...priorDayCandles.map((c) => c.l));

  return {
    daily_open: round(dailyOpen, decimals),
    pdh: round(pdh, decimals),
    pdl: round(pdl, decimals),
    decimals,
  };
}
