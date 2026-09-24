import { useState, useRef, useEffect } from 'react';
import { useIndicatorStore, type IndicatorType, type SubPanelIndicator } from '../../store/indicatorStore';

// 'overlay' items draw on the main chart and stack (multi-select); 'panel'
// items share the single sub-panel below it, so picking one swaps the other out.
type IndicatorItem =
  | { kind: 'overlay'; key: IndicatorType;     label: string }
  | { kind: 'panel';   key: SubPanelIndicator; label: string };

const INDICATOR_GROUPS: { header: string; items: IndicatorItem[] }[] = [
  { header: 'Moving Averages', items: [{ kind: 'overlay', key: 'ema', label: 'EMA (20/50/100/200)' }] },
  { header: 'Volatility',      items: [{ kind: 'overlay', key: 'bollinger', label: 'Bollinger Bands' }] },
  {
    header: 'Oscillators',
    items: [
      { kind: 'panel', key: 'rsi',      label: 'RSI (14)' },
      { kind: 'panel', key: 'stochRsi', label: 'Stochastic RSI (14,14,3,3)' },
      { kind: 'panel', key: 'macd',     label: 'MACD (12,26,9)' },
    ],
  },
];

/**
 * Multi-select indicator menu — same shell as TimeframeDropdown, but clicking
 * a row toggles that indicator and leaves the menu open; click-outside closes.
 */
export function IndicatorsDropdown() {
  const activeIndicators = useIndicatorStore((s) => s.activeIndicators);
  const toggleIndicator  = useIndicatorStore((s) => s.toggleIndicator);
  const activeSubPanel   = useIndicatorStore((s) => s.activeSubPanel);
  const toggleSubPanel   = useIndicatorStore((s) => s.toggleSubPanel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--bg-hover-alt)] transition-colors border border-[var(--border-color)] focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span>Indicators</span>
        <svg
          className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-alt)] shadow-2xl py-1 min-w-[180px]"
          style={{ animation: 'indDropdown 120ms ease-out' }}
        >
          <style>{`
            @keyframes indDropdown {
              from { opacity: 0; transform: translateY(-4px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0)   scale(1);    }
            }
          `}</style>

          {INDICATOR_GROUPS.map(({ header, items }) => (
            <div key={header}>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] select-none">
                {header}
              </div>
              {items.map((item) => {
                const { key, label } = item;
                const active = item.kind === 'panel'
                  ? activeSubPanel === item.key
                  : activeIndicators.has(item.key);
                return (
                  <button
                    key={key}
                    onClick={() => (item.kind === 'panel' ? toggleSubPanel(item.key) : toggleIndicator(item.key))}
                    aria-pressed={active}
                    className={`w-full flex items-center gap-2 text-left py-1 text-xs transition-colors border-l-2 pl-2.5 pr-3 ${
                      active
                        ? 'text-[var(--accent)] border-[var(--accent)] bg-[var(--accent)]/20'
                        : 'text-[var(--text-secondary)] border-transparent hover:bg-[var(--accent)]/15 hover:text-white'
                    }`}
                  >
                    <span className="w-3 text-center">{active ? '✓' : ''}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          <div className="px-3 pt-1.5 pb-1 mt-1 border-t border-[var(--border-color)] text-[10px] text-[var(--text-muted)] select-none">
            More indicators coming soon
          </div>
        </div>
      )}
    </div>
  );
}
