import { useState, useRef, useEffect } from 'react';
import { useMarketStore } from '../../store/marketStore';
import type { CandleInterval } from '../../types/market';

interface Group {
  label: string;
  items: CandleInterval[];
}

const GROUPS: Group[] = [
  { label: 'Minutes', items: ['1m', '3m', '5m', '15m', '30m'] },
  { label: 'Hours',   items: ['1h', '2h', '4h', '6h', '8h', '12h'] },
  { label: 'Days',    items: ['1d', '3d'] },
  { label: 'Weeks',   items: ['1w'] },
  { label: 'Months',  items: ['1M'] },
];

export function TimeframeDropdown() {
  const { activeInterval, setActiveInterval } = useMarketStore();
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
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-[#21262d] text-white hover:bg-[#30363d] transition-colors border border-[#30363d] focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span>{activeInterval}</span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
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
          className="absolute top-full left-0 mt-1 z-50 rounded-md border border-[#30363d] bg-[#1a1a2e] shadow-2xl py-1 min-w-[110px]"
          style={{ animation: 'tfDropdown 120ms ease-out' }}
        >
          <style>{`
            @keyframes tfDropdown {
              from { opacity: 0; transform: translateY(-4px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0)   scale(1);    }
            }
          `}</style>

          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#6b7280] select-none">
                {group.label}
              </div>
              {group.items.map((iv) => {
                const active = activeInterval === iv;
                return (
                  <button
                    key={iv}
                    onClick={() => { setActiveInterval(iv); setOpen(false); }}
                    className={`w-full text-left py-1 text-xs transition-colors border-l-2 ${
                      active
                        ? 'text-[#3b82f6] border-[#3b82f6] bg-[#1e3a5f]/40 pl-2.5 pr-3'
                        : 'text-[#e6edf3] border-transparent hover:bg-[#3b82f6]/15 hover:text-white pl-2.5 pr-3'
                    }`}
                  >
                    {iv}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
