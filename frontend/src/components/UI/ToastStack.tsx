import { useEffect } from 'react';
import { useToastStore } from '../../store/toastStore';

const AUTO_DISMISS_MS = 6_000;

const UP_COLOR = '#26a641';
const DOWN_COLOR = '#f85149';

function ToastRow({ id, message, side }: { id: string; message: string; side: 'buy' | 'sell' }) {
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [id, removeToast]);

  const color = side === 'buy' ? UP_COLOR : DOWN_COLOR;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 text-xs font-mono pointer-events-auto"
      style={{
        background: 'var(--bg-panel)',
        border: `1px solid ${color}`,
        borderRadius: 6,
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        minWidth: 240,
        maxWidth: 340,
        animation: 'alertToastIn 200ms ease-out',
      }}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="flex-1 text-[var(--text-primary)]">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm leading-none flex-shrink-0"
      >
        ×
      </button>
    </div>
  );
}

/**
 * App-level toast stack for fired alerts. Fixed to the viewport (not the
 * chart area) at top-center, deliberately distinct from the four docked
 * chart-area panels (Context top-right, Execution top-left, Checklist
 * bottom-right, Scanner bottom-left) which all live inside the chart area
 * and never reach up here.
 */
export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-3 left-1/2 z-[2000] flex flex-col gap-2 select-none pointer-events-none"
      style={{ transform: 'translateX(-50%)' }}
    >
      <style>{`
        @keyframes alertToastIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {toasts.map((t) => (
        <ToastRow key={t.id} id={t.id} message={t.message} side={t.side} />
      ))}
    </div>
  );
}
