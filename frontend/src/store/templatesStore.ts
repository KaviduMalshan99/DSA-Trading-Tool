import { create } from 'zustand';
import { saveLocal } from '../services/persist';
import {
  isTemplateType, sanitizeStyle, type TemplateStyle, type TemplateType,
} from '../components/Drawing/drawingTemplates';

// Saved drawing style templates, per drawing type (the settings modals'
// Template menu). Synced to the account like the other dsa-* keys.

export interface DrawingTemplate {
  name: string;
  style: TemplateStyle;
}

interface Persisted {
  v: 1;
  byType: Partial<Record<TemplateType, DrawingTemplate[]>>;
}

export const TEMPLATES_STORAGE_KEY = 'dsa-drawing-templates';
export const TEMPLATE_NAME_MAX = 40;
export const MAX_TEMPLATES_PER_TYPE = 50;

/** Trimmed name, or null when it's empty / too long. */
export function normalizeTemplateName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim();
  return n.length >= 1 && n.length <= TEMPLATE_NAME_MAX ? n : null;
}

const byName = (a: DrawingTemplate, b: DrawingTemplate) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Validates a stored value: unknown types and bad entries are dropped, each
 * style is filtered to its type's fields, at most 50 per type (first wins). */
export function parseTemplates(raw: string | null): Persisted {
  const empty: Persisted = { v: 1, byType: {} };
  if (!raw) return empty;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return empty; }
  if (!parsed || typeof parsed !== 'object') return empty;
  const { v, byType } = parsed as { v?: unknown; byType?: unknown };
  if (v !== 1 || !byType || typeof byType !== 'object' || Array.isArray(byType)) return empty;

  const out: Persisted['byType'] = {};
  for (const [type, list] of Object.entries(byType as Record<string, unknown>)) {
    if (!isTemplateType(type) || !Array.isArray(list)) continue;
    const seen = new Set<string>();
    const templates: DrawingTemplate[] = [];
    for (const item of list) {
      if (templates.length >= MAX_TEMPLATES_PER_TYPE) break;
      if (!item || typeof item !== 'object') continue;
      const name = normalizeTemplateName((item as { name?: unknown }).name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      templates.push({ name, style: sanitizeStyle(type, (item as { style?: unknown }).style) });
    }
    if (templates.length > 0) out[type] = templates.sort(byName);
  }
  return { v: 1, byType: out };
}

function loadInitial(): Persisted {
  try {
    return parseTemplates(localStorage.getItem(TEMPLATES_STORAGE_KEY));
  } catch { /* storage blocked */ }
  return { v: 1, byType: {} };
}

function persist(byType: Persisted['byType']) {
  saveLocal(TEMPLATES_STORAGE_KEY, JSON.stringify({ v: 1, byType }));
}

interface TemplatesState {
  byType: Persisted['byType'];
  /** Saves `style` (filtered to the type's fields) under `name`; the same name
   * in the same type is overwritten. False if the name is invalid or the type
   * is already at its limit. */
  saveTemplate: (type: TemplateType, name: string, style: TemplateStyle) => boolean;
  deleteTemplate: (type: TemplateType, name: string) => void;
  /** The type's templates, alphabetical. */
  list: (type: TemplateType) => DrawingTemplate[];
}

const NONE: DrawingTemplate[] = [];

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  byType: loadInitial().byType,

  saveTemplate: (type, name, style) => {
    const n = normalizeTemplateName(name);
    if (!n) return false;
    const current = get().byType[type] ?? NONE;
    const rest = current.filter((t) => t.name !== n);
    if (rest.length === current.length && current.length >= MAX_TEMPLATES_PER_TYPE) return false;
    const byType = { ...get().byType, [type]: [...rest, { name: n, style: sanitizeStyle(type, style) }].sort(byName) };
    set({ byType });
    persist(byType);
    return true;
  },

  deleteTemplate: (type, name) => {
    const current = get().byType[type];
    if (!current?.some((t) => t.name === name)) return;
    const byType = { ...get().byType };
    const next = current.filter((t) => t.name !== name);
    if (next.length > 0) byType[type] = next;
    else delete byType[type];
    set({ byType });
    persist(byType);
  },

  list: (type) => get().byType[type] ?? NONE,
}));
