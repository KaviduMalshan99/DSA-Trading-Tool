// Pure entitlement math over /auth/me fields; mirrors backend/app/core/entitlement.py.
// `now` is the server's clock (Date.now() plus the offset measured from server_now).

import type { AuthUser, Plan } from '../services/api';

export const DAY_MS = 86_400_000;

type AccessFields = Pick<AuthUser, 'trial_ends_at' | 'subscription_ends_at'>;

/** Epoch ms when access ends; 0 if the user never had any. */
export function accessUntil(user: AccessFields): number {
  return Math.max(user.trial_ends_at ?? 0, user.subscription_ends_at ?? 0);
}

export function planAt(user: AccessFields, now: number): Plan {
  if ((user.subscription_ends_at ?? 0) > now) return 'active';
  if ((user.trial_ends_at ?? 0) > now) return 'trial';
  return 'expired';
}

/** Whole days of access left, rounded up (any remainder counts as a day); 0 once expired. */
export function daysLeftAt(user: AccessFields, now: number): number {
  const left = accessUntil(user) - now;
  return left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

/** True while access ends within banner_days (and hasn't ended yet). */
export function showBannerAt(user: AccessFields & Pick<AuthUser, 'banner_days'>, now: number): boolean {
  const left = accessUntil(user) - now;
  return left > 0 && left <= user.banner_days * DAY_MS;
}

const MAX_TIMEOUT_MS = 2 ** 31 - 1; // setTimeout fires at once for longer delays
const BOUNDARY_GRACE_MS = 1000; // land just past the boundary, not on it

/**
 * Delay until the rounded-up day count next changes, given `left` ms of access
 * (> 0). Those points are access_until - k days, so they include the banner's
 * start and the moment access ends.
 */
export function nextBoundaryDelay(left: number): number {
  return Math.min((left % DAY_MS || DAY_MS) + BOUNDARY_GRACE_MS, MAX_TIMEOUT_MS);
}

export function formatDays(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}
