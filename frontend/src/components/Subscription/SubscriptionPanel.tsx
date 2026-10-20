import { useId } from 'react';
import type { AuthUser } from '../../services/api';
import { selectDaysLeft, selectPlan, useAuthStore } from '../../store/authStore';
import { accessUntil, formatDays } from '../../utils/subscription';
import { primaryButtonClass } from '../Auth/fields';
import { PlanBadge } from './PlanBadge';

/** Local date and time in the browser's timezone. */
function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Account dialog's Subscription tab. Read-only until online payment is wired up. */
export function SubscriptionPanel({ user }: { user: AuthUser }) {
  const plan = useAuthStore(selectPlan) ?? 'expired';
  const daysLeft = useAuthStore(selectDaysLeft);
  const uid = useId();

  const until = accessUntil(user);
  const heading = plan === 'active' ? 'Subscribed' : plan === 'trial' ? 'Free trial' : 'No active plan';

  return (
    <div className="px-5 py-5 flex flex-col gap-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Plan</h3>
        <div className="rounded-lg divide-y divide-[var(--border-color-softer)]" style={{ border: '1px solid var(--border-color-softer)' }}>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)]">{heading}</span>
            <PlanBadge plan={plan} />
          </div>
          {until > 0 && (
            <div className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              <span className="flex-1 text-[var(--text-muted)]">{plan === 'expired' ? 'Access ended' : 'Access until'}</span>
              <span className="text-[var(--text-primary)]">{formatDateTime(until)}</span>
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
            <span className="flex-1 text-[var(--text-muted)]">Days left</span>
            <span className="text-[var(--text-primary)]">{daysLeft > 0 ? formatDays(daysLeft) : 'None'}</span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Price</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-lg font-semibold text-[var(--text-primary)]">LKR {user.price_lkr}</span>
            <span className="text-xs text-[var(--text-muted)]"> / {formatDays(user.period_days)}</span>
          </div>
          {/* The wrapper carries the tooltip: disabled buttons get no pointer events in some browsers. */}
          <span title="Coming soon" className="flex-shrink-0">
            <button type="button" disabled aria-describedby={`${uid}-soon`} className={primaryButtonClass}>
              {plan === 'active' ? 'Renew' : 'Subscribe'}
            </button>
          </span>
        </div>
        <p id={`${uid}-soon`} className="mt-2 text-xs text-[var(--text-muted)]">
          Online payment is coming soon. Paying while you still have access adds the new period after your current end date.
        </p>
      </section>
    </div>
  );
}
