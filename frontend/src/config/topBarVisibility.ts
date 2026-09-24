import type { OverlayType } from '../store/chartStore';

/**
 * Student-shell top bar visibility — staged rollout.
 *
 * VISIBLE_OVERLAYS controls which order-flow/pro overlay TOGGLES appear in the
 * chart toolbar. Nothing is removed from the app: every overlay, its toggle
 * logic and its render gate in ChartContainer stay intact — a tool that isn't
 * listed here just has no button, and (since chartStore's default set is built
 * from this list) is never on at startup either.
 *
 * To release a tool in a later stage, add its key here, e.g. ['vwap', 'levels'].
 * Empty = Stage 1 student view (no overlay toggles shown).
 */
export const VISIBLE_OVERLAYS: OverlayType[] = [];

export const isOverlayVisible = (k: OverlayType) => VISIBLE_OVERLAYS.includes(k);

/**
 * Whether the order-flow Delta panel (bottom 20% under the chart) is mounted.
 * When false the chart area takes the full height. Note DeltaPanel is the sole
 * writer of deltaStore, which the 'execution', 'checklist' and 'scanner'
 * overlays read — turn this on before releasing any of those.
 */
export const SHOW_DELTA_PANEL = false;
