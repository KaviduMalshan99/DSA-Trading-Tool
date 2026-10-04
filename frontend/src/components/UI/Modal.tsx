import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface ModalProps {
  /** Dialog name: shown in the default header and used for aria-labelledby. */
  title: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Replaces the default title bar. Must render an element with id={titleId}
   * holding the dialog's name, so aria-labelledby still resolves.
   */
  header?: (titleId: string) => ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog shell (AuthModal, ProfileModal). Owns the overlay, backdrop
 * mousedown-to-close, Esc, keeping keys away from the window-level drawing
 * shortcuts, focus (first input on open, trap on Tab, back to the trigger on
 * close) and the entrance animation.
 */
export function Modal({ title, onClose, width = 400, children, footer, header }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Read through a ref so the mount-only focus effect never re-runs on a new onClose.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // First visible field (a hidden tab panel's inputs have no offsetParent).
    const first = [...(panel?.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [])]
      .find((el) => el.offsetParent !== null);
    (first ?? panel)?.focus();
    return () => {
      // The trigger may have unmounted meanwhile (e.g. a closed menu item).
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys stop here so window-level shortcuts (drawing Delete/Ctrl+Z, etc.)
    // never fire while a dialog has focus.
    e.stopPropagation();
    if (e.key === 'Escape') {
      onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === panelRef.current)) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center select-none"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes cycModalIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: none; }
        }
        .cyc-modal-panel { animation: cycModalIn 160ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .cyc-modal-panel { animation: none; }
        }
      `}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="cyc-modal-panel flex flex-col outline-none overflow-hidden"
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          background: 'var(--bg-panel-alt)',
          border: '1px solid var(--border-color-softer)',
          borderRadius: 10,
          boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
        }}
      >
        {header ? header(titleId) : (
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border-color-softer)' }}
          >
            <span id={titleId} className="text-[var(--text-secondary)] font-semibold text-base">{title}</span>
            <ModalCloseButton onClose={onClose} />
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto select-text">{children}</div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid var(--border-color-softer)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModalCloseButton({ onClose, className = '' }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={`w-7 h-7 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
