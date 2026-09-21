import { useRef, useState } from 'react';
import {
  useDrawingStore,
  type FibLikeDrawing,
  type FibLevelConfig,
  type FibExtend,
} from '../../store/drawingStore';
import { fibLevelsFor } from './DrawingCanvas';
import { MiniColorSwatch, MiniWidthPicker, MiniDashPicker } from './drawingStyleShared';

interface Props {
  fib: FibLikeDrawing;
  onClose: () => void;
}

type Tab = 'Style' | 'Coordinates' | 'Visibility';

function ensureLevels(fib: FibLikeDrawing): FibLevelConfig[] {
  return fib.levels ?? fibLevelsFor(fib.type).map((l) => ({ enabled: true, pct: l.pct, color: l.color }));
}

const EXTEND_OPTIONS: { value: FibExtend; label: string }[] = [
  { value: 'none',  label: "Don't extend" },
  { value: 'left',  label: 'Extend left' },
  { value: 'right', label: 'Extend right' },
  { value: 'both',  label: 'Extend both' },
];

const FIB_TITLES: Record<FibLikeDrawing['type'], string> = {
  fibonacci: 'Fib Retracement',
  fibExtension: 'Fib Extension',
  trendFibExtension: 'Trend-based Fib Extension',
  fibChannel: 'Fib Channel',
};

export function FibSettingsModal({ fib, onClose }: Props) {
  const { updateDrawing, deleteDrawing } = useDrawingStore();
  // Snapshot taken once, when the modal mounts — Cancel restores this so
  // live-previewed edits don't stick if the user backs out.
  const originalRef = useRef<FibLikeDrawing>(fib);
  const [tab, setTab] = useState<Tab>('Style');

  const patch = (p: Partial<FibLikeDrawing>) => updateDrawing(fib.id, p);

  const setLevel = (i: number, levelPatch: Partial<FibLevelConfig>) => {
    const levels = ensureLevels(fib);
    levels[i] = { ...levels[i], ...levelPatch };
    patch({ levels: [...levels] });
  };

  const handleCancel = () => {
    updateDrawing(fib.id, originalRef.current);
    onClose();
  };

  const levels = ensureLevels(fib);

  return (
    <div
      data-drawing-overlay="fib-modal"
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        className="flex flex-col"
        style={{ width: 420, maxHeight: '85vh', background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          <span className="text-[var(--text-secondary)] font-medium">
            {FIB_TITLES[fib.type]}
          </span>
          <button onClick={handleCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none">×</button>
        </div>

        {/* tabs */}
        <div className="flex gap-4 px-4 pt-2" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          {(['Style', 'Coordinates', 'Visibility'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="pb-2 text-sm"
              style={{
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
          {tab === 'Style' && (
            <div className="flex flex-col gap-4">
              {fib.type !== 'fibChannel' && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={fib.lineVisible !== false}
                      onChange={(e) => patch({ lineVisible: e.target.checked })}
                    />
                    {fib.type === 'trendFibExtension' ? 'A-B-C line' : 'Trend line'}
                  </label>
                  <div className="flex items-center gap-2">
                    <MiniColorSwatch color={fib.lineColor ?? '#787B86'} onChange={(c) => patch({ lineColor: c })} />
                    <MiniDashPicker dash={fib.lineDash ?? 'dotted'} onChange={(d) => patch({ lineDash: d })} />
                    <MiniWidthPicker width={fib.lineWidth ?? 1} onChange={(w) => patch({ lineWidth: w })} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Levels line</span>
                <div className="flex items-center gap-2">
                  <MiniDashPicker dash={fib.levelDash ?? 'dashed'} onChange={(d) => patch({ levelDash: d })} />
                  <MiniWidthPicker width={fib.levelWidth ?? 1} onChange={(w) => patch({ levelWidth: w })} />
                </div>
              </div>

              {(fib.type === 'fibonacci' || fib.type === 'fibExtension') && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">Extend</span>
                  <select
                    value={fib.extend ?? 'none'}
                    onChange={(e) => patch({ extend: e.target.value as FibExtend })}
                    className="text-sm px-2 py-1 rounded"
                    style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-color-softer)' }}
                  >
                    {EXTEND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 grid grid-cols-2 gap-x-4 gap-y-2" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
                {fibLevelsFor(fib.type).map((defaults, i) => {
                  const lvl = levels[i];
                  return (
                    <div key={i} className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        checked={lvl.enabled}
                        onChange={(e) => setLevel(i, { enabled: e.target.checked })}
                      />
                      <input
                        type="text"
                        value={lvl.pct}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setLevel(i, { pct: Number.isFinite(n) ? n : lvl.pct });
                        }}
                        disabled={!lvl.enabled}
                        className="w-16 text-xs px-1.5 py-1 rounded font-mono"
                        style={{
                          background: 'var(--bg-app)', border: '1px solid var(--border-color-softer)',
                          color: lvl.enabled ? 'var(--text-secondary)' : 'var(--border-color)',
                        }}
                      />
                      <MiniColorSwatch color={lvl.color ?? defaults.color} onChange={(c) => setLevel(i, { color: c })} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'Coordinates' && (fib.type === 'fibonacci' || fib.type === 'fibExtension') && (
            <div className="flex flex-col gap-4 text-sm text-[var(--text-secondary)]">
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wide">Point 1 (high)</div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-xs text-[var(--text-muted)]">Price</span>
                  <input
                    type="number"
                    value={fib.priceHigh}
                    onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) patch({ priceHigh: n }); }}
                    className="flex-1 px-2 py-1 rounded font-mono text-xs"
                    style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color-softer)', color: 'var(--text-secondary)' }}
                  />
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wide">Point 2 (low)</div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-xs text-[var(--text-muted)]">Price</span>
                  <input
                    type="number"
                    value={fib.priceLow}
                    onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) patch({ priceLow: n }); }}
                    className="flex-1 px-2 py-1 rounded font-mono text-xs"
                    style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color-softer)', color: 'var(--text-secondary)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === 'Coordinates' && fib.type === 'trendFibExtension' && (
            <div className="flex flex-col gap-4 text-sm text-[var(--text-secondary)]">
              {([
                ['Point A (move start)', 'price1'],
                ['Point B (move end)', 'price2'],
                ['Point C (projection origin)', 'price3'],
              ] as const).map(([label, key]) => (
                <div key={key}>
                  <div className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wide">{label}</div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-xs text-[var(--text-muted)]">Price</span>
                    <input
                      type="number"
                      value={fib[key]}
                      onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) patch({ [key]: n }); }}
                      className="flex-1 px-2 py-1 rounded font-mono text-xs"
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color-softer)', color: 'var(--text-secondary)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Coordinates' && fib.type === 'fibChannel' && (
            <div className="flex flex-col gap-4 text-sm text-[var(--text-secondary)]">
              {([
                ['Baseline point 1', 'price1'],
                ['Baseline point 2', 'price2'],
                ['Offset point', 'price3'],
              ] as const).map(([label, key]) => (
                <div key={key}>
                  <div className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wide">{label}</div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-xs text-[var(--text-muted)]">Price</span>
                    <input
                      type="number"
                      value={fib[key]}
                      onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) patch({ [key]: n }); }}
                      className="flex-1 px-2 py-1 rounded font-mono text-xs"
                      style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color-softer)', color: 'var(--text-secondary)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Visibility' && (
            <div className="text-sm text-[var(--text-muted)]">
              Per-timeframe visibility isn't supported yet — this drawing is shown on every timeframe.
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
          <button
            onClick={() => { deleteDrawing(fib.id); onClose(); }}
            className="text-sm text-[#f85149] hover:underline"
          >
            Remove
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)]"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
