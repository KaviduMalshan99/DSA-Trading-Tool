import { useEffect, useLayoutEffect, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTemplatesStore, normalizeTemplateName, TEMPLATE_NAME_MAX, MAX_TEMPLATES_PER_TYPE } from '../../store/templatesStore';
import {
  defaultStyleFor, stylePatchFor, templateStyleOf, type TemplateType,
} from './drawingTemplates';
import { useAnchoredPopover, COLOR_POPOVER_OVERLAY } from './drawingStyleShared';

const ITEM = 'w-full px-3 py-1.5 text-sm text-left text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)] hover:text-[var(--text-primary)]';
const SMALL_BTN = 'px-2.5 py-1 rounded text-xs';
const FIELD_STYLE = { background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border-color-softer)' };

// Four squares — the toolbar's Template button.
function TemplateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.4" fill="none">
      <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="11.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="3.5" y="11.5" width="5" height="5" rx="1" />
      <rect x="11.5" y="11.5" width="5" height="5" rx="1" />
    </svg>
  );
}

type Mode = { kind: 'menu' } | { kind: 'save'; confirmReplace: boolean; error: string | null };

/**
 * The settings modals' footer "Template" menu: save the drawing's current
 * (previewed) style under a name, apply the type's default, or apply/delete a
 * saved template. Applying goes through `onApply` — the modal's own patch —
 * so it previews live and Cancel/Ok treat it like any other edit.
 *
 * `variant="icon"` is the floating style toolbar's four-squares button; there
 * `onApply` commits the whole patch as one updateDrawing (one undo step).
 */
export function TemplateMenu({ type, drawing, onApply, variant = 'button' }: {
  type: TemplateType;
  drawing: { type: string };
  onApply: (patch: Record<string, unknown>) => void;
  variant?: 'button' | 'icon';
}) {
  const { open, setOpen, anchorRef, popRef, popStyle, place } = useAnchoredPopover();
  const templates = useTemplatesStore((s) => s.byType[type]);
  const saveTemplate = useTemplatesStore((s) => s.saveTemplate);
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate);
  const [mode, setMode] = useState<Mode>({ kind: 'menu' });
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMode({ kind: 'menu' });
      setName('');
      setPendingDelete(null);
    }
  }, [open]);

  const list = templates ?? [];

  // The menu changes height (name input, confirms, deletes) — re-place it so
  // an upward-opened menu stays anchored and on screen.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, mode, pendingDelete, list.length]);
  const trimmed = normalizeTemplateName(name);

  const apply = (style: Record<string, unknown>) => {
    onApply(stylePatchFor(type, style));
    setOpen(false);
  };

  const save = (replaceConfirmed: boolean) => {
    if (!trimmed) return;
    if (!replaceConfirmed && list.some((t) => t.name === trimmed)) {
      setMode({ kind: 'save', confirmReplace: true, error: null });
      return;
    }
    if (!saveTemplate(type, trimmed, templateStyleOf(drawing))) {
      setMode({ kind: 'save', confirmReplace: false, error: `Limit of ${MAX_TEMPLATES_PER_TYPE} templates reached` });
      return;
    }
    setOpen(false);
  };

  // Keys typed in the menu never reach the drawing shortcuts or the modal
  // (Esc is caught earlier by the popover hook and closes only the menu).
  const stopKeys = (e: KeyboardEvent) => e.stopPropagation();

  return (
    <div className={variant === 'icon' ? 'relative' : 'relative mr-auto'} ref={anchorRef}>
      {variant === 'icon' ? (
        <button
          type="button"
          title="Template"
          aria-label="Template"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-hover-alt)] ${open ? 'text-[var(--text-primary)] bg-[var(--bg-hover-alt)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
        >
          <TemplateIcon />
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)]"
          style={{ border: '1px solid var(--border-color-softer)' }}
        >
          Template
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points={open ? '2 6.5 5 3.5 8 6.5' : '2 3.5 5 6.5 8 3.5'} />
          </svg>
        </button>
      )}
      {open && createPortal(
        <div
          ref={popRef}
          role="menu"
          data-drawing-overlay={COLOR_POPOVER_OVERLAY}
          onKeyDown={stopKeys}
          className="py-1 select-none"
          style={{ ...popStyle, background: 'var(--bg-panel-alt)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', width: 250 }}
        >
          {mode.kind === 'save' ? (
            <div className="px-3 py-2 flex flex-col gap-2">
              {mode.confirmReplace ? (
                <>
                  <span className="text-sm text-[var(--text-secondary)]">
                    Replace existing template “{trimmed}”?
                  </span>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setMode({ kind: 'save', confirmReplace: false, error: null })}
                      className={`${SMALL_BTN} text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)]`}>
                      Cancel
                    </button>
                    <button type="button" autoFocus onClick={() => save(true)}
                      className={`${SMALL_BTN} text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)]`}>
                      Replace
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs text-[var(--text-muted)]">Template name</span>
                  <input
                    type="text"
                    autoFocus
                    value={name}
                    maxLength={TEMPLATE_NAME_MAX}
                    onChange={(e) => { setName(e.target.value); if (mode.error) setMode({ ...mode, error: null }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(false); } }}
                    className="w-full px-2 py-1 rounded text-sm"
                    style={FIELD_STYLE}
                  />
                  {mode.error && <span className="text-xs text-[#f85149]">{mode.error}</span>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setMode({ kind: 'menu' })}
                      className={`${SMALL_BTN} text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)]`}>
                      Cancel
                    </button>
                    <button type="button" disabled={!trimmed} onClick={() => save(false)}
                      className={`${SMALL_BTN} text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50`}>
                      Save
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <button type="button" role="menuitem" className={ITEM}
                onClick={() => setMode({ kind: 'save', confirmReplace: false, error: null })}>
                Save drawing template as…
              </button>
              <button type="button" role="menuitem" className={ITEM} onClick={() => apply(defaultStyleFor(type))}>
                Apply default drawing template
              </button>
              {list.length > 0 && (
                <>
                  <div className="my-1" style={{ borderTop: '1px solid var(--border-color-softer)' }} />
                  <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
                    {list.map((t) => (
                      pendingDelete === t.name ? (
                        <div key={t.name} className="flex items-center gap-2 px-3 py-1">
                          <span className="flex-1 truncate text-sm text-[var(--text-secondary)]">Delete “{t.name}”?</span>
                          <button type="button" onClick={() => setPendingDelete(null)}
                            className={`${SMALL_BTN} text-[var(--text-secondary)] hover:bg-[var(--bg-hover-alt)]`}>
                            No
                          </button>
                          <button type="button" onClick={() => { deleteTemplate(type, t.name); setPendingDelete(null); }}
                            className={`${SMALL_BTN} text-white bg-[#f85149] hover:opacity-90`}>
                            Delete
                          </button>
                        </div>
                      ) : (
                        <div key={t.name} className="group flex items-center hover:bg-[var(--bg-hover-alt)]">
                          <button type="button" role="menuitem" title={t.name} onClick={() => apply(t.style)}
                            className="flex-1 min-w-0 truncate px-3 py-1.5 text-sm text-left text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                            {t.name}
                          </button>
                          <button type="button" title="Delete template" aria-label={`Delete template ${t.name}`}
                            onClick={() => setPendingDelete(t.name)}
                            className="w-7 h-7 mr-1 flex items-center justify-center rounded text-base leading-none text-[var(--text-muted)] hover:text-[#f85149] opacity-0 group-hover:opacity-100 focus:opacity-100">
                            ×
                          </button>
                        </div>
                      )
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
