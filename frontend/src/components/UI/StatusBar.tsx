import { useState, useRef, useEffect } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useTimezoneStore, TIMEZONE_OPTIONS, zoneOffsetLabel } from '../../store/timezoneStore';

function TimezonePicker() {
  const { timezone, setTimezone } = useTimezoneStore();
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

  const city = TIMEZONE_OPTIONS.find((o) => o.tz === timezone)?.label ?? timezone;

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Chart timezone"
        className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors focus:outline-none"
      >
        <span>{zoneOffsetLabel(timezone)} · {city}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {open && (
        // Opens upward (status bar sits at the very bottom). z-[200] keeps it above
        // chart overlays/floating toolbars (≤100) but below modals (1000).
        <div className="absolute bottom-full right-0 mb-1 z-[200] rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-alt)] shadow-2xl py-1 min-w-[170px]">
          {TIMEZONE_OPTIONS.map((opt) => {
            const active = opt.tz === timezone;
            return (
              <button
                key={opt.tz}
                onClick={() => { setTimezone(opt.tz); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-3 py-1 pl-2.5 pr-3 text-xs text-left border-l-2 transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--accent)]/15 hover:text-white'
                }`}
              >
                <span>{opt.label}</span>
                <span className="text-[var(--text-muted)]">{zoneOffsetLabel(opt.tz)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StatusBar() {
  const { activeSymbol, activeInterval, isLoading, candles } = useMarketStore();

  return (
    <footer className="flex items-center gap-4 px-4 py-1 bg-[var(--bg-panel)] border-t border-[var(--border-color)] text-xs text-[var(--text-muted)] select-none">
      <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
      <span>{activeSymbol}</span>
      <span>{activeInterval}</span>
      <span>{candles.length} candles</span>
      <TimezonePicker />
      <span>DSA Trading Tool v1.0</span>
    </footer>
  );
}
