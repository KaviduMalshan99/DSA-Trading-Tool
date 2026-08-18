import { useChartStore, type OverlayType } from '../../store/chartStore';
import { TimeframeDropdown } from '../UI/TimeframeDropdown';
import { ReplayControls } from './ReplayControls';

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

export function ChartToolbar() {
  const { visibleOverlays, toggleOverlay, imbalanceRatio, setImbalanceRatio, stackSize, setStackSize } = useChartStore();
  const footprintActive = visibleOverlays.has('footprint');

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-color)]">
      <TimeframeDropdown />

      <div className="w-px h-4 bg-[var(--border-color)] mx-1" />

      <div className="flex gap-1">
        {OVERLAYS.map(({ key, label }) => (
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
              value={Math.round(imbalanceRatio * 100)}
              onChange={(e) => {
                const pct = Number(e.target.value);
                if (Number.isFinite(pct) && pct > 100) setImbalanceRatio(pct / 100);
              }}
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
              value={stackSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 2) setStackSize(n);
              }}
              className="w-12 px-1 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs"
            />
          </label>
        </>
      )}

      <ReplayControls />
    </div>
  );
}
