import { useRef, useState } from 'react';
import {
  useDrawingStore,
  type FibLikeDrawing,
  type FibLevelConfig,
  type FibExtend,
} from '../../store/drawingStore';
import { resolveFibLevels } from './fibLevels';
import { MiniColorSwatch, MiniWidthPicker, MiniDashPicker } from './drawingStyleShared';

interface Props {
  fib: FibLikeDrawing;
  onClose: () => void;
}

type Tab = 'Style' | 'Coordinates' | 'Visibility';

// The drawing's own rows (a copy): its saved `levels` as-is, or — for an old
// drawing that never had any — its type's legacy table, so the first edit
// writes back exactly the rows it was already showing.
function ensureLevels(fib: FibLikeDrawing): FibLevelConfig[] {
  return resolveFibLevels(fib);
}

const EXTEND_OPTIONS: { value: FibExtend; label: string }[] = [
  { value: 'none',  label: "Don't extend" },
  { value: 'left',  label: 'Extend left' },
  { value: 'right', label: 'Extend right' },
  { value: 'both',  label: 'Extend both' },
];

const SELECT_STYLE = { background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-color-softer)' };

const FIB_TITLES: Record<FibLikeDrawing['type'], string> = {
  fibonacci: 'Fib Retracement',
  fibExtension: 'Fib Extension',
  trendFibExtension: 'Trend-Based Fib Extension',
  fibChannel: 'Fib Channel',
};

/** Level ratio field. Keeps a local text mirror so partial decimals ("0.",
 * "-", ".6") survive while typing, and only writes the parsed ratio to the
 * store on blur/Enter. Unlike PeriodInput, 0 and negatives are valid ratios. */
function FibRatioInput({ value, enabled, onCommit }: {
  value: number;
  enabled: boolean;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  // Resync the mirror when the stored ratio changes from outside (Cancel/reset).
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }

  const commit = () => {
    const n = Number(text.trim());
    if (text.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= 100) {
      if (n !== value) onCommit(n);
      setText(String(n));
    } else {
      setText(String(value));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => { if (/^-?\d*\.?\d*$/.test(e.target.value)) setText(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      disabled={!enabled}
      className="w-16 text-xs px-1.5 py-1 rounded font-mono"
      style={{
        background: 'var(--bg-app)', border: '1px solid var(--border-color-softer)',
        color: enabled ? 'var(--text-secondary)' : 'var(--border-color)',
      }}
    />
  );
}

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
    patch({ levels });
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

              {fib.type !== 'fibChannel' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-secondary)]">Extend</span>
                    <select
                      value={fib.extend ?? 'none'}
                      onChange={(e) => patch({ extend: e.target.value as FibExtend })}
                      className="text-sm px-2 py-1 rounded"
                      style={SELECT_STYLE}
                    >
                      {EXTEND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={fib.reverse ?? false}
                      onChange={(e) => patch({ reverse: e.target.checked })}
                    />
                    Reverse
                  </label>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={fib.background === true}
                        onChange={(e) => patch({ background: e.target.checked })}
                      />
                      Background
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={fib.backgroundOpacity ?? 15}
                        disabled={fib.background !== true}
                        onChange={(e) => patch({ backgroundOpacity: Number(e.target.value) })}
                        className="w-24 accent-[var(--accent)]"
                      />
                      <span className="w-9 text-right text-xs font-mono text-[var(--text-secondary)]">
                        {fib.backgroundOpacity ?? 15}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={fib.showPrices ?? true}
                          onChange={(e) => patch({ showPrices: e.target.checked })}
                        />
                        Prices
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={fib.showLevels ?? true}
                          onChange={(e) => patch({ showLevels: e.target.checked })}
                        />
                        Levels
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={fib.levelsAs ?? 'values'}
                        disabled={fib.showLevels === false}
                        onChange={(e) => patch({ levelsAs: e.target.value as 'values' | 'percent' })}
                        className="text-sm px-2 py-1 rounded"
                        style={SELECT_STYLE}
                      >
                        <option value="values">Values</option>
                        <option value="percent">Percent</option>
                      </select>
                      <select
                        value={fib.labelsSide ?? 'right'}
                        onChange={(e) => patch({ labelsSide: e.target.value as 'left' | 'right' })}
                        className="text-sm px-2 py-1 rounded"
                        style={SELECT_STYLE}
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div
                className="pt-2 grid grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto"
                style={{ borderTop: '1px solid var(--border-color-softer)', maxHeight: 260 }}
              >
                {levels.map((lvl, i) => {
                  return (
                    <div key={i} className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        checked={lvl.enabled}
                        onChange={(e) => setLevel(i, { enabled: e.target.checked })}
                      />
                      <FibRatioInput
                        value={lvl.pct}
                        enabled={lvl.enabled}
                        onCommit={(n) => setLevel(i, { pct: n })}
                      />
                      <MiniColorSwatch color={lvl.color ?? '#787B86'} onChange={(c) => setLevel(i, { color: c })} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'Coordinates' && (fib.type === 'fibonacci' || fib.type === 'fibExtension') && (
            <div className="flex flex-col gap-4 text-sm text-[var(--text-secondary)]">
              {([
                // historical field names: priceLow = start / level 1, priceHigh = end / level 0
                ['Start (level 1)', 'priceLow'],
                ['End (level 0)', 'priceHigh'],
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
