import type { Plan } from '../../services/api';

const PLAN_META: Record<Plan, { label: string; color: string; background: string }> = {
  trial: { label: 'Free trial', color: 'var(--accent)', background: 'rgba(33,150,243,0.12)' },
  active: { label: 'Active', color: '#26a641', background: 'rgba(38,166,65,0.12)' },
  expired: { label: 'Expired', color: '#f85149', background: 'rgba(248,81,73,0.12)' },
};

export function PlanBadge({ plan }: { plan: Plan }) {
  const meta = PLAN_META[plan];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ color: meta.color, background: meta.background }}
    >
      {meta.label}
    </span>
  );
}
