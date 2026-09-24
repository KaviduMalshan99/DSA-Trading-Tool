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
 * untouched; these ports only run while replay is active.
 *
 * Exception: computeEMA, computeBollinger, computeRSI and computeStochRSI (below)
 * have no backend counterpart — they're client-only indicators that run live as
 * well as in replay.
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

// ── EMA (client-only indicator, no backend port) ─────────────────────────────

export interface EMAPoint {
  time: number;   // candle open time, raw epoch ms
  value: number;
}

/**
 * `candles` must be in chronological order. Seeded with the SMA of the first
 * `period` closes (emitted at index period-1), then the standard recurrence
 * EMA[i] = close[i]·k + EMA[i-1]·(1-k), k = 2/(period+1). No warm-up points
 * are emitted, so every point sits on a real candle time.
 */
export function computeEMA(candles: Candle[], period: number): EMAPoint[] {
  if (period < 1 || candles.length < period) return [];
  const k = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].c;
  let ema = sum / period;

  const points: EMAPoint[] = [{ time: candles[period - 1].t, value: ema }];
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k);
    points.push({ time: candles[i].t, value: ema });
  }
  return points;
}

// ── Bollinger Bands (client-only indicator, no backend port) ─────────────────

export interface BollingerPoint {
  time: number;   // candle open time, raw epoch ms
  middle: number;
  upper: number;
  lower: number;
}

/**
 * `candles` must be in chronological order. For each window of `period` closes
 * ending at index i (i >= period-1): middle = SMA, sd = population standard
 * deviation of that window, bands = middle ± mult·sd. Each window is summed
 * afresh (two-pass) rather than with a rolling sum, so there's no float drift
 * and variance can't go negative. No warm-up points are emitted.
 */
export function computeBollinger(candles: Candle[], period = 20, mult = 2): BollingerPoint[] {
  if (period < 1 || candles.length < period) return [];

  const points: BollingerPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].c;
    const middle = sum / period;

    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j].c - middle;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / period);

    points.push({ time: candles[i].t, middle, upper: middle + mult * sd, lower: middle - mult * sd });
  }
  return points;
}

// ── RSI (client-only indicator, no backend port) ─────────────────────────────

export interface RSIPoint {
  time: number;   // candle open time, raw epoch ms
  value: number;  // 0-100
}

/**
 * Wilder's RSI. `candles` must be in chronological order. avgGain/avgLoss are
 * seeded with the simple average of the first `period` close-to-close changes
 * (so the first point is emitted at index `period`, the (period+1)-th candle),
 * then smoothed as avg = (prev·(period-1) + current)/period. Follows
 * TradingView's zero-division convention: avgLoss 0 → 100, avgGain 0 → 0.
 * No warm-up points are emitted, so every point sits on a real candle time.
 */
export function computeRSI(candles: Candle[], period = 14): RSIPoint[] {
  if (period < 1 || candles.length <= period) return [];

  const rsi = (gain: number, loss: number) =>
    loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].c - candles[i - 1].c;
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  const points: RSIPoint[] = [{ time: candles[period].t, value: rsi(avgGain, avgLoss) }];
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].c - candles[i - 1].c;
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    points.push({ time: candles[i].t, value: rsi(avgGain, avgLoss) });
  }
  return points;
}

// ── Stochastic RSI (client-only indicator, built on computeRSI) ──────────────

export interface StochRSIData {
  k: RSIPoint[];  // %K, 0-100
  d: RSIPoint[];  // %D, 0-100
}

/**
 * Stochastic RSI: the stochastic oscillator applied to Wilder's RSI instead of
 * price. Defaults 14/14/3/3 (rsiLen, stochLen, kSmooth, dSmooth).
 *   raw = (RSI - min(RSI, stochLen)) / (max - min) · 100
 *   %K  = SMA(raw, kSmooth),  %D = SMA(%K, dSmooth)
 * When the window is flat (max === min — e.g. RSI pinned at 100 through a
 * strong one-way run) the previous raw value is carried forward, or 50 if
 * there is none yet, so a steady trend doesn't read as 0 / "oversold".
 * %K and %D are returned separately because %D starts dSmooth-1 bars later;
 * like computeRSI, no warm-up points are emitted and each point carries the
 * candle time of its RSI point.
 */
export function computeStochRSI(
  candles: Candle[], rsiLen = 14, stochLen = 14, kSmooth = 3, dSmooth = 3,
): StochRSIData {
  const rsi = computeRSI(candles, rsiLen);
  if (stochLen < 1 || kSmooth < 1 || dSmooth < 1 || rsi.length <= stochLen) {
    return { k: [], d: [] };
  }

  // Rolling mean over the last `len` pushed values; null until the window fills.
  const rollingMean = (len: number) => {
    const buf: number[] = [];
    let sum = 0;
    return (v: number): number | null => {
      buf.push(v);
      sum += v;
      if (buf.length > len) sum -= buf.shift()!;
      return buf.length === len ? sum / len : null;
    };
  };
  const smoothK = rollingMean(kSmooth);
  const smoothD = rollingMean(dSmooth);

  const k: RSIPoint[] = [];
  const d: RSIPoint[] = [];
  let prevRaw: number | null = null;

  for (let i = stochLen - 1; i < rsi.length; i++) {
    let min = Infinity;
    let max = -Infinity;
    for (let j = i - stochLen + 1; j <= i; j++) {
      const v = rsi[j].value;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const raw: number = max === min
      ? (prevRaw ?? 50)
      : ((rsi[i].value - min) / (max - min)) * 100;
    prevRaw = raw;

    const kVal = smoothK(raw);
    if (kVal === null) continue;
    k.push({ time: rsi[i].time, value: kVal });

    const dVal = smoothD(kVal);
    if (dVal !== null) d.push({ time: rsi[i].time, value: dVal });
  }
  return { k, d };
}
