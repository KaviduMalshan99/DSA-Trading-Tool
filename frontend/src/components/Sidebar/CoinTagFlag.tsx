import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { TAG_COLORS, useWatchlistStore } from '../../store/watchlistStore';

const POPOVER_W = 184;
const POPOVER_H = 36;
const GAP = 4;

function FlagIcon({ color }: { color?: string }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24"
      stroke={color ?? 'currentColor'} fill={color ?? 'none'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M4 22V15" />
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    </svg>
  );
}

export function CoinTagFlag({ symbol }: { symbol: string }) {
  const color = useWatchlistStore((s) => s.tagColors[symbol]);
  const setTagColor = useWatchlistStore((s) => s.setTagColor);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  // Close on click outside both the button and the (portaled) popover, and on
  // any scroll/resize so the fixed popover never drifts away from its row.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setPos(null);
    };
    const close = () => setPos(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (open || !btnRef.current) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    let top = r.bottom + GAP;
    if (top + POPOVER_H > window.innerHeight) top = r.top - GAP - POPOVER_H;
    const left = Math.max(GAP, Math.min(r.left, window.innerWidth - POPOVER_W - GAP));
    setPos({ top, left });
  };

  const pick = (c: string | null) => {
    setTagColor(symbol, c);
    setPos(null);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={color ? 'Change tag' : 'Tag coin'}
        className={`w-4 h-4 flex items-center justify-center flex-shrink-0 transition-opacity ${
          color || open
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
        }`}
      >
        <FlagIcon color={color} />
      </button>
      {pos && createPortal(
        <div
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          className="fixed flex items-center gap-1 p-2"
          style={{
            top: pos.top, left: pos.left, width: POPOVER_W, height: POPOVER_H, zIndex: 90,
            background: 'var(--bg-panel-alt)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
          }}
        >
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => pick(c)}
              className="w-5 h-5 rounded-full flex-shrink-0"
              style={{
                background: c,
                boxShadow: color === c ? '0 0 0 2px var(--bg-panel-alt), 0 0 0 4px var(--accent)' : undefined,
              }}
            />
          ))}
          <button
            type="button"
            title="No tag"
            onClick={() => pick(null)}
            className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border border-[var(--text-muted)] text-[var(--text-muted)]"
            style={{ boxShadow: !color ? '0 0 0 2px var(--bg-panel-alt), 0 0 0 4px var(--accent)' : undefined }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none">
              <path d="M5 19L19 5" />
            </svg>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
