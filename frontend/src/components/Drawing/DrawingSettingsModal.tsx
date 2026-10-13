import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ISeriesApi } from 'lightweight-charts';
import {
  type Drawing, type PatternDrawing, type LabelHAlign, type LabelVAlign, type LabelStyle,
} from '../../store/drawingStore';
import { usePaneDrawings } from '../../store/drawingPanes';
import { Modal } from '../UI/Modal';
import {
  isLabelDrawing, labelColorOf, LABEL_DEFAULT_SIZE, LABEL_FONT_SIZES,
  type LabelDrawing, type LabelDrawingType,
} from './drawingLabels';
import { fibPriceDecimals } from './fibLevels';
import {
  MiniColorSwatch, MiniWidthPicker, MiniDashPicker, ColorOpacityButton, FillToggleIcon,
} from './drawingStyleShared';
import { TemplateMenu } from './TemplateMenu';

type Tab = 'Style' | 'Text' | 'Coordinates';
const TABS: Tab[] = ['Style', 'Text', 'Coordinates'];

const TITLES: Record<LabelDrawingType, string> = {
  trendline: 'Trend Line', ray: 'Ray', extendedLine: 'Extended Line', arrow: 'Arrow',
  hline: 'Horizontal Line', hray: 'Horizontal Ray', vline: 'Vertical Line', crossline: 'Crossline',
  rectangle: 'Rectangle', rotatedRectangle: 'Rotated Rectangle', circle: 'Circle', ellipse: 'Ellipse',
  triangle: 'Triangle', arc: 'Arc', curve: 'Curve',
  channel: 'Parallel Channel', flatChannel: 'Flat Top/Bottom', disjointChannel: 'Disjoint Channel',
  regression: 'Regression Trend',
  path: 'Path', polyline: 'Polyline',
  abcd: 'ABCD', xabcd: 'XABCD', cypher: 'Cypher', threeDrives: 'Three Drives', headShoulders: 'Head and Shoulders',
};

const PATTERN_POINT_NAMES: Partial<Record<LabelDrawingType, string[]>> = {
  abcd: ['A', 'B', 'C', 'D'],
  xabcd: ['X', 'A', 'B', 'C', 'D'],
  cypher: ['X', 'A', 'B', 'C', 'D'],
  threeDrives: ['1', '2', '3', '4', '5', '6'],
  headShoulders: ['Left shoulder', 'Trough 1', 'Head', 'Trough 2', 'Right shoulder'],
};

const FIELD_STYLE = { background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-color-softer)' };

// Shape-style types (border + fill) — same set and defaults as the style
// toolbar's shape branch in DrawingStyleToolbar.tsx.
const SHAPE_TYPES = ['rectangle', 'rotatedRectangle', 'circle', 'ellipse', 'triangle', 'arc', 'xabcd', 'channel', 'flatChannel'] as const;
// PatternDrawing's `type` is a union on one interface, so Extract drops it — add it back (for xabcd).
type ShapeLabelDrawing = Extract<LabelDrawing, { type: (typeof SHAPE_TYPES)[number] }> | PatternDrawing;
function isShapeDrawing(d: LabelDrawing): d is ShapeLabelDrawing {
  return (SHAPE_TYPES as readonly string[]).includes(d.type);
}

// ── Coordinates rows ─────────────────────────────────────────────────────────

interface CoordRow {
  label: string;
  /** null = this point has no (meaningful) stored price */
  price: number | null;
  /** null = this point has no stored time */
  time: number | null;
  patchPrice?: (p: number) => Partial<Drawing>;
}

function coordRows(d: LabelDrawing): CoordRow[] {
  const two = (n1: string, n2: string, dd: { price1: number; time1: number; price2: number; time2: number }): CoordRow[] => [
    { label: n1, price: dd.price1, time: dd.time1, patchPrice: (p) => ({ price1: p }) },
    { label: n2, price: dd.price2, time: dd.time2, patchPrice: (p) => ({ price2: p }) },
  ];
  switch (d.type) {
    case 'trendline': case 'ray': case 'extendedLine': case 'arrow':
    case 'rectangle': case 'circle': case 'ellipse':
      return two('Point 1', 'Point 2', d);
    case 'triangle': case 'rotatedRectangle': case 'channel':
      return [...two('Point 1', 'Point 2', d), { label: 'Point 3', price: d.price3, time: d.time3, patchPrice: (p) => ({ price3: p }) }];
    case 'arc': case 'curve':
      return [...two('Start', 'End', d), { label: 'Control', price: d.price3, time: d.time3, patchPrice: (p) => ({ price3: p }) }];
    case 'flatChannel':
      // price2 is captured but unused by the geometry (only time2 matters)
      return [
        { label: 'Point 1', price: d.price1, time: d.time1, patchPrice: (p) => ({ price1: p }) },
        { label: 'Point 2', price: null, time: d.time2 },
        { label: 'Point 3', price: d.price3, time: d.time3, patchPrice: (p) => ({ price3: p }) },
      ];
    case 'disjointChannel':
      return [
        { label: 'Line A start', price: d.priceA1, time: d.timeA1, patchPrice: (p) => ({ priceA1: p }) },
        { label: 'Line A end', price: d.priceA2, time: d.timeA2, patchPrice: (p) => ({ priceA2: p }) },
        { label: 'Line B start', price: d.priceB1, time: d.timeB1, patchPrice: (p) => ({ priceB1: p }) },
        { label: 'Line B end', price: d.priceB2, time: d.timeB2, patchPrice: (p) => ({ priceB2: p }) },
      ];
    case 'hline':
      return [{ label: 'Price', price: d.price, time: null, patchPrice: (p) => ({ price: p }) }];
    case 'hray': case 'crossline':
      return [{ label: 'Point', price: d.price, time: d.time, patchPrice: (p) => ({ price: p }) }];
    case 'vline':
      return [{ label: 'Time', price: null, time: d.time }];
    case 'regression':
      // the channel is computed from candles in this range — no stored prices
      return [
        { label: 'Start', price: null, time: d.time1 },
        { label: 'End', price: null, time: d.time2 },
      ];
    default: {
      const names = PATTERN_POINT_NAMES[d.type];
      const points = d.points;
      return points.map((pt, i) => ({
        label: names?.[i] ? names[i] : `Point ${i + 1}`,
        price: pt.price,
        time: pt.time,
        patchPrice: (p: number) => ({ points: points.map((q, j) => (j === i ? { ...q, price: p } : q)) }),
      }));
    }
  }
}

// Drawing times are chart time (UTC shifted by the selected zone's offset —
// see utils/chartTime.ts), so reading them back as UTC gives the user's zone.
function formatChartDateTime(t: number): string {
  const d = new Date(t * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Price field: a local text mirror so partial input ("12.", "-") survives
 * while typing; every parseable value previews live, and blur/Enter reformats
 * to the chart's precision. */
function PriceInput({ value, decimals, onChange }: { value: number; decimals: number; onChange: (v: number) => void }) {
  const fmt = (v: number) => v.toFixed(decimals);
  const [text, setText] = useState(fmt(value));
  const [lastValue, setLastValue] = useState(value);
  const [focused, setFocused] = useState(false);
  // Resync from outside changes (drag, Cancel) unless the user is typing here.
  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setText(fmt(value));
  }

  const commit = () => setText(fmt(value));

  return (
    <input
      type="number"
      inputMode="decimal"
      step={Math.pow(10, -decimals)}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit(); }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className="w-32 px-2 py-1 rounded font-mono text-xs"
      style={FIELD_STYLE}
    />
  );
}

// ── modal ────────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function ToggleButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className="w-8 h-7 flex items-center justify-center rounded text-sm"
      style={{
        ...FIELD_STYLE,
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        background: active ? 'var(--bg-hover-alt)' : 'var(--bg-app)',
        borderColor: active ? 'var(--accent)' : 'var(--border-color-softer)',
      }}
    >
      {children}
    </button>
  );
}

function StyleTab({ d, patch }: { d: LabelDrawing; patch: (p: Partial<Drawing>) => void }) {
  if (isShapeDrawing(d)) {
    const isChannel = d.type === 'channel' || d.type === 'flatChannel';
    const optInFill = d.type === 'arc' || d.type === 'xabcd';
    const color = d.color ?? '#2196F3';
    const filled = optInFill ? d.filled === true : d.filled !== false;
    return (
      <div className="flex flex-col gap-4">
        <Row label={isChannel || optInFill ? 'Line' : 'Border'}>
          <ColorOpacityButton
            title={isChannel || optInFill ? 'Line color' : 'Border color'}
            color={color} opacity={d.opacity ?? 100}
            onColorChange={(c) => patch({ color: c })}
            onOpacityChange={(o) => patch({ opacity: o })}
          />
          <MiniWidthPicker width={d.width ?? (isChannel || optInFill ? 1.5 : 1)} onChange={(w) => patch({ width: w })} />
          <MiniDashPicker dash={d.dash ?? 'solid'} onChange={(v) => patch({ dash: v })} />
        </Row>
        <Row label="Background">
          <button
            type="button"
            title={filled ? 'Hide fill' : 'Show fill'}
            onClick={() => patch({ filled: !filled })}
            className={`w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-hover-alt)] ${filled ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
          >
            <FillToggleIcon filled={filled} />
          </button>
          <div style={{ visibility: filled ? 'visible' : 'hidden' }}>
            <ColorOpacityButton
              title="Fill color"
              color={d.fillColor ?? color} opacity={d.fillOpacity ?? (isChannel ? 8 : 20)}
              onColorChange={(c) => patch({ fillColor: c })}
              onOpacityChange={(o) => patch({ fillOpacity: o })}
            />
          </div>
        </Row>
      </div>
    );
  }

  if (d.type === 'regression') {
    return (
      <div className="flex flex-col gap-4">
        <Row label="Line">
          <MiniColorSwatch color={d.color ?? '#2196F3'} onChange={(c) => patch({ color: c })} />
          <MiniWidthPicker width={d.width ?? 1.5} onChange={(w) => patch({ width: w })} />
        </Row>
      </div>
    );
  }

  // plain LineStyle drawings — same controls as the style toolbar's fallback
  const marker = d.type === 'arrow' && d.variant === 'marker';
  return (
    <div className="flex flex-col gap-4">
      <Row label="Line">
        <ColorOpacityButton
          color={d.color ?? '#2196F3'} opacity={d.opacity ?? 100}
          onColorChange={(c) => patch({ color: c })}
          onOpacityChange={(o) => patch({ opacity: o })}
        />
        {!marker && <MiniWidthPicker width={d.width ?? 1.5} onChange={(w) => patch({ width: w })} />}
        {!marker && <MiniDashPicker dash={d.dash ?? 'solid'} onChange={(v) => patch({ dash: v })} />}
      </Row>
    </div>
  );
}

function TextTab({ d, patch }: { d: LabelDrawing; patch: (p: Partial<LabelStyle>) => void }) {
  const size = d.labelSize ?? LABEL_DEFAULT_SIZE;
  // keep a non-standard stored size selectable
  const sizes = LABEL_FONT_SIZES.includes(size) ? LABEL_FONT_SIZES : [...LABEL_FONT_SIZES, size].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MiniColorSwatch color={labelColorOf(d)} onChange={(c) => patch({ labelColor: c })} />
        <select
          aria-label="Font size"
          value={size}
          onChange={(e) => patch({ labelSize: Number(e.target.value) })}
          className="text-sm px-2 py-1 rounded"
          style={FIELD_STYLE}
        >
          {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <ToggleButton active={d.labelBold === true} title="Bold" onClick={() => patch({ labelBold: !(d.labelBold === true) })}>
          <span className="font-bold">B</span>
        </ToggleButton>
        <ToggleButton active={d.labelItalic === true} title="Italic" onClick={() => patch({ labelItalic: !(d.labelItalic === true) })}>
          <span className="italic font-serif">I</span>
        </ToggleButton>
      </div>
      <textarea
        aria-label="Text"
        value={d.labelText ?? ''}
        onChange={(e) => patch({ labelText: e.target.value })}
        placeholder="Add text"
        rows={4}
        className="w-full px-2 py-1.5 rounded text-sm resize-none"
        style={FIELD_STYLE}
      />
      <Row label="Text alignment">
        <select
          aria-label="Vertical alignment"
          value={d.labelVAlign ?? 'top'}
          onChange={(e) => patch({ labelVAlign: e.target.value as LabelVAlign })}
          className="text-sm px-2 py-1 rounded"
          style={FIELD_STYLE}
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
        <select
          aria-label="Horizontal alignment"
          value={d.labelHAlign ?? 'center'}
          onChange={(e) => patch({ labelHAlign: e.target.value as LabelHAlign })}
          className="text-sm px-2 py-1 rounded"
          style={FIELD_STYLE}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </Row>
    </div>
  );
}

function CoordinatesTab({ d, decimals, patch }: { d: LabelDrawing; decimals: number; patch: (p: Partial<Drawing>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {coordRows(d).map((row, i) => (
        <div key={i}>
          <div className="text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wide">{row.label}</div>
          <div className="flex items-center gap-2">
            {row.price != null && row.patchPrice ? (
              <PriceInput value={row.price} decimals={decimals} onChange={(p) => patch(row.patchPrice!(p))} />
            ) : (
              <span className="w-32 px-2 py-1 text-xs text-[var(--text-muted)]">—</span>
            )}
            <span className="flex-1 px-2 py-1 rounded font-mono text-xs text-[var(--text-muted)]" style={{ border: '1px solid var(--border-color-softer)' }}>
              {row.time != null ? formatChartDateTime(row.time) : '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawingSettingsModal({ drawing, decimals }: { drawing: LabelDrawing; decimals: number }) {
  const updateDrawing = usePaneDrawings((s) => s.updateDrawing);
  const closeDrawingSettings = usePaneDrawings((s) => s.closeDrawingSettings);
  const [tab, setTab] = useState<Tab>('Style');

  const patch = (p: Partial<Drawing>) => updateDrawing(drawing.id, p);
  const handleCancel = () => closeDrawingSettings(false);
  const handleOk = () => closeDrawingSettings(true);

  // Esc with focus outside the panel (e.g. on <body> after a portaled color
  // popover closed) still cancels; Esc inside the panel is the Modal's own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      closeDrawingSettings(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDrawingSettings]);

  const title = drawing.type === 'arrow' && drawing.variant === 'marker' ? 'Arrow Marker' : TITLES[drawing.type];

  return (
    <Modal
      title={title}
      onClose={handleCancel}
      width={420}
      footer={
        // Footer is justify-end: Cancel/Ok sit on the right; the Template
        // menu's mr-auto pushes it to the left.
        <>
          <TemplateMenu type={drawing.type} drawing={drawing} onApply={(p) => patch(p as Partial<Drawing>)} />
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOk}
            className="px-4 py-1.5 rounded text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
          >
            Ok
          </button>
        </>
      }
    >
      <div data-drawing-overlay="drawing-settings" className="select-none">
        <div className="flex gap-4 px-4 pt-2" style={{ borderBottom: '1px solid var(--border-color-softer)' }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
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
        <div className="p-4" style={{ minHeight: 180 }}>
          {tab === 'Style' && <StyleTab d={drawing} patch={patch} />}
          {tab === 'Text' && <TextTab d={drawing} patch={patch} />}
          {tab === 'Coordinates' && <CoordinatesTab d={drawing} decimals={decimals} patch={patch} />}
        </div>
      </div>
    </Modal>
  );
}

function priceDecimals(series: ISeriesApi<'Candlestick'> | null, d: LabelDrawing): number {
  let pf: { precision?: number; minMove?: number } | undefined;
  try { pf = series?.options().priceFormat as { precision?: number; minMove?: number } | undefined; } catch { pf = undefined; }
  const sample = coordRows(d).find((r) => r.price != null)?.price ?? 0;
  return fibPriceDecimals(pf, sample);
}

/** Mounts the settings modal for the pane's settingsDrawingId (opened
 * from the style toolbar's gear or by double-clicking the drawing). Portaled
 * to <body> so it sits above the chart chrome and outside the chart area. */
export function DrawingSettingsHost({ sharedSeriesRef }: { sharedSeriesRef: React.RefObject<ISeriesApi<'Candlestick'> | null> }) {
  const id = usePaneDrawings((s) => s.settingsDrawingId);
  const drawing = usePaneDrawings((s) => (s.settingsDrawingId ? s.drawings.find((d) => d.id === s.settingsDrawingId) : undefined));
  const closeDrawingSettings = usePaneDrawings((s) => s.closeDrawingSettings);

  // The drawing vanished (undo, delete, symbol switch) — drop the modal.
  useEffect(() => {
    if (id && (!drawing || !isLabelDrawing(drawing))) closeDrawingSettings(false);
  }, [id, drawing, closeDrawingSettings]);

  if (!id || !drawing || !isLabelDrawing(drawing)) return null;
  return createPortal(
    <DrawingSettingsModal key={id} drawing={drawing} decimals={priceDecimals(sharedSeriesRef.current, drawing)} />,
    document.body,
  );
}
