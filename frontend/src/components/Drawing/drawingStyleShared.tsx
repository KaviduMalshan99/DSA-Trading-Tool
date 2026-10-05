import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { LineDash } from '../../store/drawingStore';

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) => Math.round(f(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

// A TradingView-style palette: a grayscale row on top, then one row per hue
// with shades running light → dark across the columns.
const GRAY_ROW = [95, 80, 65, 50, 35, 20, 5].map((l) => hslToHex(0, 0, l));
const HUES = [0, 25, 45, 90, 150, 190, 220, 260, 300, 335];
const SHADE_LIGHTNESS = [78, 65, 52, 40, 28];
export const COLOR_GRID: string[][] = [
  GRAY_ROW,
  ...HUES.map((h) => SHADE_LIGHTNESS.map((l) => hslToHex(h, 78, l))),
];
export const COLOR_SWATCHES = COLOR_GRID.flat();

export const WIDTHS = [1, 2, 3, 4];
export const DASHES: { value: LineDash; label: string; pattern: string }[] = [
  { value: 'solid',  label: 'Solid',  pattern: 'none' },
  { value: 'dashed', label: 'Dashed', pattern: '6,4' },
  { value: 'dotted', label: 'Dotted', pattern: '1.5,3' },
];

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Color popovers render in a portal on document.body (position: fixed) so a
// scrolling ancestor — e.g. a settings modal's overflow-y-auto body — can't clip
// them. They sit above the modals (z 1000) and carry data-drawing-overlay so
// DrawingCanvas and the style toolbar don't treat clicks in them as "outside".
export const COLOR_POPOVER_OVERLAY = 'color-popover';
const POPOVER_Z = 1200;
const POPOVER_GAP = 4;     // same offset as the old mt-1 under the swatch
const VIEWPORT_MARGIN = 8;

// `align` picks which anchor edge the popover hangs from by default: 'left'
// (color swatches) or 'right' (width/dash dropdowns, matching their old
// `right-0` placement). Either flips to the other edge when it would overflow.
function useAnchoredPopover(align: 'left' | 'right' = 'left') {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Below-left of the swatch by default; flip upward / align to the swatch's
  // right edge when there isn't room, then clamp fully inside the viewport.
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const r = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let left: number;
    if (align === 'right') {
      left = r.right - width;
      if (left < VIEWPORT_MARGIN) left = r.left;
    } else {
      left = r.left;
      if (left + width > vw - VIEWPORT_MARGIN) left = r.right - width;
    }
    let top = r.bottom + POPOVER_GAP;
    if (top + height > vh - VIEWPORT_MARGIN && r.top > vh - r.bottom) top = r.top - POPOVER_GAP - height;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - width - VIEWPORT_MARGIN));
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - height - VIEWPORT_MARGIN));
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      close();
    };
    // Capture phase + stopPropagation: Esc closes only this popover — not the
    // modal around it, and never DrawingCanvas's deselect/cancel shortcut.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    // Follow the swatch while its container scrolls; close once it leaves the viewport.
    const onScroll = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) close();
      else place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const popStyle: CSSProperties = {
    position: 'fixed',
    left: pos?.left ?? 0,
    top: pos?.top ?? 0,
    zIndex: POPOVER_Z,
    // hidden for the single layout pass before it's measured and placed
    visibility: pos ? 'visible' : 'hidden',
  };

  return { open, setOpen, anchorRef, popRef, popStyle };
}

// Small popover controls — each manages its own open/close state and closes
// on an outside click. Reused by the trend-line-style toolbar and the
// Fibonacci settings modal.
export function MiniColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const { open, setOpen, anchorRef, popRef, popStyle } = useAnchoredPopover();

  return (
    <div className="relative" ref={anchorRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 rounded-full border border-white/30 flex-shrink-0"
        style={{ background: color }}
      />
      {open && createPortal(
        <div
          ref={popRef}
          data-drawing-overlay={COLOR_POPOVER_OVERLAY}
          className="p-2 grid grid-cols-7 gap-1 select-none"
          style={{ ...popStyle, background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', width: 200 }}
        >
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => { onChange(c); setOpen(false); }}
              className="w-5 h-5 rounded-full border"
              style={{ background: c, borderColor: c.toLowerCase() === color.toLowerCase() ? 'var(--accent)' : 'rgba(255,255,255,0.15)' }}
            />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function MiniWidthPicker({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const { open, setOpen, anchorRef, popRef, popStyle } = useAnchoredPopover('right');

  return (
    <div className="relative" ref={anchorRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover-alt)] text-xs text-[var(--text-secondary)]"
      >
        {width}px
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          data-drawing-overlay={COLOR_POPOVER_OVERLAY}
          className="py-1 select-none"
          style={{ ...popStyle, background: 'var(--bg-panel-alt)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', width: 72 }}
        >
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => { onChange(w); setOpen(false); }}
              className={`w-full px-3 py-1 text-xs text-left hover:bg-[var(--accent)] hover:text-white ${w === width ? 'text-[var(--text-primary)] bg-[var(--bg-hover-alt)]' : 'text-[var(--text-secondary)]'}`}
            >
              {w}px
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// Combined color + opacity control — the "swatch button opens a palette grid
// plus an opacity slider" pattern used for both a shape's border/line color
// and its fill color.
export function ColorOpacityButton({
  color, opacity, onColorChange, onOpacityChange, title = 'Color',
}: {
  color: string;
  opacity: number;
  onColorChange: (c: string) => void;
  onOpacityChange: (o: number) => void;
  title?: string;
}) {
  const { open, setOpen, anchorRef, popRef, popStyle } = useAnchoredPopover();

  return (
    <div className="relative" ref={anchorRef}>
      <button
        title={title}
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-hover-alt)]"
      >
        <span className="w-3.5 h-3.5 rounded-full border border-white/30" style={{ background: color, opacity: opacity / 100 }} />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          data-drawing-overlay={COLOR_POPOVER_OVERLAY}
          className="p-3 select-none"
          style={{ ...popStyle, background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', width: 236 }}
        >
          <div className="grid grid-cols-7 gap-1.5">
            {COLOR_GRID.map((row, ri) =>
              row.map((c, ci) => (
                <button
                  key={`${ri}-${ci}`}
                  title={c}
                  onClick={() => onColorChange(c)}
                  className="w-6 h-6 rounded-full border transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: c.toLowerCase() === color.toLowerCase() ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
                    borderWidth: c.toLowerCase() === color.toLowerCase() ? 2 : 1,
                  }}
                />
              )),
            )}
          </div>
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-color-softer)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[var(--text-muted)]">Opacity</span>
              <span className="text-xs text-[var(--text-secondary)] font-mono">{opacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const MARKER_SIZES = [12, 16, 20, 26, 32];

export function MiniSizePicker({ size, onChange }: { size: number; onChange: (s: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover-alt)] text-xs text-[var(--text-secondary)]"
      >
        {size}px
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 py-1"
          style={{ background: 'var(--bg-panel-alt)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', width: 72, zIndex: 90 }}
        >
          {MARKER_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full px-3 py-1 text-xs text-left hover:bg-[var(--accent)] hover:text-white ${s === size ? 'text-[var(--text-primary)] bg-[var(--bg-hover-alt)]' : 'text-[var(--text-secondary)]'}`}
            >
              {s}px
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FillToggleIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill={filled ? 'currentColor' : 'none'} opacity={filled ? 0.4 : 1}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

export function MiniDashPicker({ dash, onChange }: { dash: LineDash; onChange: (d: LineDash) => void }) {
  const { open, setOpen, anchorRef, popRef, popStyle } = useAnchoredPopover('right');
  const current = DASHES.find((d) => d.value === dash) ?? DASHES[0];

  return (
    <div className="relative" ref={anchorRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover-alt)]"
      >
        <svg width="20" height="10" viewBox="0 0 20 10">
          <line x1="0" y1="5" x2="20" y2="5" stroke="var(--text-secondary)" strokeWidth="1.5"
                strokeDasharray={current.pattern === 'none' ? undefined : current.pattern} />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          data-drawing-overlay={COLOR_POPOVER_OVERLAY}
          className="py-1 select-none"
          style={{ ...popStyle, background: 'var(--bg-panel-alt)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', width: 100 }}
        >
          {DASHES.map(({ value, label, pattern }) => (
            <button
              key={value}
              onClick={() => { onChange(value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-[var(--accent)] hover:text-white ${value === dash ? 'text-[var(--text-primary)] bg-[var(--bg-hover-alt)]' : 'text-[var(--text-secondary)]'}`}
            >
              <svg width="24" height="8" viewBox="0 0 24 8">
                <line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="1.5"
                      strokeDasharray={pattern === 'none' ? undefined : pattern} />
              </svg>
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
