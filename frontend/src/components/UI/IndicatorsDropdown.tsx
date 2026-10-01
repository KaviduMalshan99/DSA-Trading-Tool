import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useIndicatorStore, type IndicatorType, type SubPanelIndicator } from '../../store/indicatorStore';
import { FavoriteStarButton } from './FavoriteStarButton';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';
import { GearIcon } from '../Drawing/drawingStyleShared';
import { useIndicatorConfigStore, type IndicatorConfigKey } from '../../store/indicatorConfigStore';

// Indicators whose menu row offers settings + remove.
const CONFIGURABLE: ReadonlySet<IndicatorConfigKey> = new Set<IndicatorConfigKey>(['ema', 'bollinger', 'rsi', 'stochRsi', 'macd']);

// 'overlay' items draw on the main chart and stack (multi-select); 'panel'
// items share the single sub-panel below it, so picking one swaps the other out.
// `short` is the compact label used for the favorite pills in the top bar.
export type IndicatorItem =
  | { kind: 'overlay'; key: IndicatorType;     label: string; short: string }
  | { kind: 'panel';   key: SubPanelIndicator; label: string; short: string };

const INDICATOR_GROUPS: { header: string; items: IndicatorItem[] }[] = [
  { header: 'Moving Averages', items: [{ kind: 'overlay', key: 'ema', label: 'EMA (20/50/100/200)', short: 'EMA' }] },
  { header: 'Volatility',      items: [{ kind: 'overlay', key: 'bollinger', label: 'Bollinger Bands', short: 'BB' }] },
  {
    header: 'Oscillators',
    items: [
      { kind: 'panel', key: 'rsi',      label: 'RSI (14)',                   short: 'RSI' },
      { kind: 'panel', key: 'stochRsi', label: 'Stochastic RSI (14,14,3,3)', short: 'StochRSI' },
      { kind: 'panel', key: 'macd',     label: 'MACD (12,26,9)',             short: 'MACD' },
    ],
  },
];

// Flat, menu-ordered list — drives the favorite-pill order and lets the top
// bar turn a stored favorite key back into its item.
export const INDICATOR_ITEMS: IndicatorItem[] = INDICATOR_GROUPS.flatMap((g) => g.items);

/**
 * Multi-select indicator menu — same shell as TimeframeDropdown, but clicking
 * a row toggles that indicator and leaves the menu open; click-outside closes.
 */
export function IndicatorsDropdown() {
  const activeIndicators = useIndicatorStore((s) => s.activeIndicators);
  const toggleIndicator  = useIndicatorStore((s) => s.toggleIndicator);
  const activeSubPanel   = useIndicatorStore((s) => s.activeSubPanel);
  const toggleSubPanel   = useIndicatorStore((s) => s.toggleSubPanel);
  const favoriteIndicators      = useIndicatorStore((s) => s.favoriteIndicators);
  const toggleFavoriteIndicator = useIndicatorStore((s) => s.toggleFavoriteIndicator);
  const bbPeriod = useIndicatorConfigStore((s) => s.configs.bollinger.period);
  const bbMult   = useIndicatorConfigStore((s) => s.configs.bollinger.mult);
  const rsiPeriod = useIndicatorConfigStore((s) => s.configs.rsi.period);
  const stoch     = useIndicatorConfigStore((s) => s.configs.stochRsi);
  const macd      = useIndicatorConfigStore((s) => s.configs.macd);
  const [open, setOpen] = useState(false);
  // Lives outside the menu so the modal survives the menu closing.
  const [settingsKey, setSettingsKey] = useState<IndicatorConfigKey | null>(null);
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
          className="absolute top-full left-0 mt-1 z-50 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-alt)] shadow-2xl py-1 min-w-[200px]"
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
                const { key } = item;
                // Configurable indicators' labels track their params.
                const label = key === 'bollinger' ? `Bollinger Bands (${bbPeriod},${bbMult})`
                  : key === 'rsi' ? `RSI (${rsiPeriod})`
                  : key === 'stochRsi' ? `Stochastic RSI (${stoch.rsiLength},${stoch.stochLength},${stoch.kSmooth},${stoch.dSmooth})`
                  : key === 'macd' ? `MACD (${macd.fast},${macd.slow},${macd.signal})`
                  : item.label;
                const active = item.kind === 'panel'
                  ? activeSubPanel === item.key
                  : activeIndicators.has(item.key);
                return (
                  <div
                    key={key}
                    className={`w-full flex items-center pr-1 transition-colors border-l-2 ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)]/20'
                        : 'border-transparent hover:bg-[var(--accent)]/15'
                    }`}
                  >
                    <button
                      onClick={() => (item.kind === 'panel' ? toggleSubPanel(item.key) : toggleIndicator(item.key))}
                      aria-pressed={active}
                      className={`flex-1 flex items-center gap-2 text-left py-1 pl-2.5 pr-3 text-xs transition-colors ${
                        active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-white'
                      }`}
                    >
                      <span className="w-3 text-center">{active ? '✓' : ''}</span>
                      <span>{label}</span>
                    </button>
                    {CONFIGURABLE.has(key) && (
                      <>
                        <button
                          onClick={() => { setOpen(false); setSettingsKey(key); }}
                          title="Settings"
                          aria-label={`${item.short} settings`}
                          className="h-6 w-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-alt)]"
                        >
                          <GearIcon />
                        </button>
                        {active && (
                          <button
                            onClick={() => (item.kind === 'panel' ? toggleSubPanel(item.key) : toggleIndicator(item.key))}
                            title="Remove"
                            aria-label={`Remove ${item.short}`}
                            className="h-6 w-6 flex items-center justify-center rounded text-base leading-none text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover-alt)]"
                          >
                            ×
                          </button>
                        )}
                      </>
                    )}
                    <FavoriteStarButton
                      favorite={favoriteIndicators.includes(key)}
                      onToggle={() => toggleFavoriteIndicator(key)}
                      className="h-6"
                    />
                  </div>
                );
              })}
            </div>
          ))}

          <div className="px-3 pt-1.5 pb-1 mt-1 border-t border-[var(--border-color)] text-[10px] text-[var(--text-muted)] select-none">
            More indicators coming soon
          </div>
        </div>
      )}

      {/* Portaled so the menu's positioned/animated ancestors can't trap the
          fixed-position backdrop in their stacking context. */}
      {settingsKey && createPortal(
        <IndicatorSettingsModal indicatorKey={settingsKey} onClose={() => setSettingsKey(null)} />,
        document.body,
      )}
    </div>
  );
}
