import { selectDaysLeft, selectPlan, selectShowBanner, useAuthStore } from '../../store/authStore';
import { formatDays } from '../../utils/subscription';

/** Strip above the toolbar while access ends within banner_days. */
export function SubscriptionBanner() {
  const show = useAuthStore(selectShowBanner);
  const plan = useAuthStore(selectPlan);
  const daysLeft = useAuthStore(selectDaysLeft);
  const openProfile = useAuthStore((s) => s.openProfile);

  if (!show) return null;
  return (
    <div
      role="status"
      className="flex-shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1 text-xs text-[var(--text-secondary)]"
      style={{ background: 'rgba(210,153,34,0.14)', borderBottom: '1px solid rgba(210,153,34,0.4)' }}
    >
      <span>
        Your {plan === 'active' ? 'subscription' : 'trial'} ends in{' '}
        <strong className="font-semibold text-[var(--text-primary)]">{formatDays(daysLeft)}</strong>.
      </span>
      <button
        type="button"
        onClick={() => openProfile('subscription')}
        className="h-6 px-2.5 rounded text-xs font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-app)]"
      >
        Renew
      </button>
    </div>
  );
}
