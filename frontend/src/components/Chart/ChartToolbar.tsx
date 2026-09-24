import { useEffect, useState } from 'react';
import { useChartStore, type ChartType, type OverlayType } from '../../store/chartStore';
import { TimeframeDropdown } from '../UI/TimeframeDropdown';
import { ReplayControls } from './ReplayControls';
import { isOverlayVisible } from '../../config/topBarVisibility';

const OVERLAYS: { key: OverlayType; label: string }[] = [
  { key: 'heatmap',       label: 'Heatmap'     },
  { key: 'footprint',     label: 'Footprint'   },
  { key: 'volumeProfile', label: 'Vol Profile' },
  { key: 'whaleMarkers',  label: 'Whales'      },
  { key: 'smc',           label: 'SMC'         },
  { key: 'levels',        label: 'Levels'      },
  { key: 'vwap',          label: 'VWAP'        },
  { key: 'sessions',      label: 'Sessions'    },
  { key: 'structure',     label: 'Structure'   },
  { key: 'context',       label: 'Context'     },
  { key: 'absorption',    label: 'Absorption'  },
  { key: 'execution',     label: 'Execution'   },
  { key: 'checklist',     label: 'Checklist'   },
  { key: 'scanner',       label: 'Scanner'     },
];

function CandlesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <line x1="7" y1="3" x2="7" y2="21" />
      <rect x="4" y="7" width="6" height="9" rx="1" fill="currentColor" />
      <line x1="17" y1="3" x2="17" y2="21" />
      <rect x="14" y="10" width="6" height="7" rx="1" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 14 21 6" />
    </svg>
  );
}

const CHART_TYPES: { key: ChartType; label: string; Icon: () => JSX.Element }[] = [
  { key: 'candle', label: 'Candlesticks', Icon: CandlesIcon },
  { key: 'line',   label: 'Line',         Icon: LineIcon    },
];

function ChartTypeToggle() {
  const chartType    = useChartStore((s) => s.chartType);
  const setChartType = useChartStore((s) => s.setChartType);

  return (
    <div className="flex items-center rounded border border-[var(--border-color)] overflow-hidden">
      {CHART_TYPES.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => setChartType(key)}
          title={label}
          aria-pressed={chartType === key}
          className={`w-7 h-6 flex items-center justify-center transition-colors ${
            chartType === key
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}

export function ChartToolbar() {
  const visibleOverlays  = useChartStore((s) => s.visibleOverlays);
  const toggleOverlay    = useChartStore((s) => s.toggleOverlay);
  const imbalanceRatio   = useChartStore((s) => s.imbalanceRatio);
  const setImbalanceRatio = useChartStore((s) => s.setImbalanceRatio);
  const stackSize        = useChartStore((s) => s.stackSize);
  const setStackSize     = useChartStore((s) => s.setStackSize);
  const footprintActive = visibleOverlays.has('footprint');
  // Only released tools get a button — see config/topBarVisibility.ts.
  const shownOverlays = OVERLAYS.filter((o) => isOverlayVisible(o.key));

  // Local text mirrors of the two number inputs below. A plain
  // value={Math.round(imbalanceRatio * 100)} controlled input snaps back to
  // the last committed store value on every keystroke that doesn't yet pass
  // the store setter's guard (e.g. the "1" in typing "150") — React re-render
  // then shows the OLD value again with the cursor position lost, so the next
  // keystroke lands wherever the browser puts the cursor on that reverted
  // text instead of where the user was typing, and digits concatenate onto
  // stale leftovers (e.g. "150" over "300" → "30050150"). Keeping the
  // displayed text in its own state — always reflecting exactly what was
  // typed — and only pushing to the store when the parsed value is valid
  // fixes that, while still updating live once a keystroke lands on a valid
  // value, same as before.
  const [imbalanceInput, setImbalanceInput] = useState(String(Math.round(imbalanceRatio * 100)));
  useEffect(() => {
    setImbalanceInput(String(Math.round(imbalanceRatio * 100)));
  }, [imbalanceRatio]);

  const [stackInput, setStackInput] = useState(String(stackSize));
  useEffect(() => {
    setStackInput(String(stackSize));
  }, [stackSize]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
      <TimeframeDropdown />
      <ChartTypeToggle />

      {shownOverlays.length > 0 && (
        <>
      <div className="w-px h-4 bg-[var(--border-color)] mx-1" />

      <div className="flex flex-wrap gap-1">
        {shownOverlays.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleOverlay(key)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              visibleOverlays.has(key)
                ? 'bg-emerald-700 text-white'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
        </>
      )}

      {footprintActive && (
        <>
          <div className="w-px h-4 bg-[var(--border-color)] mx-1" />
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]" title="Imbalance ratio — a level is flagged when one side's volume is at least this many times the other">
            Imbalance
            <input
              type="number"
              min={110}
              max={2000}
              step={10}
              value={imbalanceInput}
              onChange={(e) => {
                const text = e.target.value;
                setImbalanceInput(text);
                const pct = Number(text);
                if (Number.isFinite(pct) && pct > 100) setImbalanceRatio(pct / 100);
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => setImbalanceInput(String(Math.round(imbalanceRatio * 100)))}
              className="w-16 px-1 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs"
            />
            %
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]" title="Stack size — mark a stack when this many consecutive same-side imbalanced levels line up">
            Stack
            <input
              type="number"
              min={2}
              max={10}
              step={1}
              value={stackInput}
              onChange={(e) => {
                const text = e.target.value;
                setStackInput(text);
                const n = Number(text);
                if (Number.isInteger(n) && n >= 2) setStackSize(n);
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => setStackInput(String(stackSize))}
              className="w-12 px-1 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs"
            />
          </label>
        </>
      )}

      <ReplayControls />
    </div>
  );
}
