// Drawing style templates (TradingView's "Template" menu): which fields of
// each drawing type a template holds, how a stored style is validated, and
// what "Apply default" resets to. Pure — no React/store runtime imports, so
// the templates store and tests can use it directly.
//
// A template is style plus the label's text: never coordinates, text or cells.
import type { FibLevelConfig } from '../../store/drawingStore';
import { LABEL_DRAWING_TYPES, type LabelDrawingType } from './drawingLabels';
import { newFibLevels } from './fibLevels';

export const FIB_TEMPLATE_TYPES = ['fibonacci', 'fibExtension', 'trendFibExtension', 'fibChannel'] as const;
export type FibTemplateType = (typeof FIB_TEMPLATE_TYPES)[number];
export type TemplateType = LabelDrawingType | FibTemplateType;

export type TemplateStyle = Record<string, unknown>;

const LINE_FIELDS = ['color', 'width', 'dash', 'opacity'] as const;
const FILL_FIELDS = ['filled', 'fillColor', 'fillOpacity'] as const;
const LABEL_FIELDS = ['labelColor', 'labelSize', 'labelBold', 'labelItalic', 'labelVAlign', 'labelHAlign', 'labelText'] as const;
// Fields a template only ever sets: applying a template without them keeps
// the drawing's own value instead of clearing it.
const KEEP_UNLESS_SET = new Set<string>(['labelText']);
export const TEMPLATE_LABEL_TEXT_MAX = 500;
const FIB_LEVEL_FIELDS = ['levels', 'levelWidth', 'levelDash'] as const;
const FIB_FULL_FIELDS = [
  ...FIB_LEVEL_FIELDS, 'extend', 'lineVisible', 'lineColor', 'lineWidth', 'lineDash',
  'reverse', 'background', 'backgroundOpacity', 'showPrices', 'showLevels', 'levelsAs', 'labelsSide',
] as const;

// Same shape-style set as DrawingSettingsModal's SHAPE_TYPES: the types whose
// fill is actually rendered (patterns other than xabcd carry FillStyle in
// their interface but never draw it).
const FILL_TYPES: readonly LabelDrawingType[] = [
  'rectangle', 'rotatedRectangle', 'circle', 'ellipse', 'triangle', 'arc', 'xabcd', 'channel', 'flatChannel',
];

function labelTypeFields(type: LabelDrawingType): readonly string[] {
  // Regression has no LineStyle — just one color and a median width.
  if (type === 'regression') return ['color', 'width', ...LABEL_FIELDS];
  if (FILL_TYPES.includes(type)) return [...LINE_FIELDS, ...FILL_FIELDS, ...LABEL_FIELDS];
  return [...LINE_FIELDS, ...LABEL_FIELDS];
}

/** The fields a template of each type holds. */
export const TEMPLATE_FIELDS: Readonly<Record<TemplateType, readonly string[]>> = {
  ...(Object.fromEntries(LABEL_DRAWING_TYPES.map((t) => [t, labelTypeFields(t)])) as Record<LabelDrawingType, readonly string[]>),
  fibonacci: FIB_FULL_FIELDS,
  fibExtension: FIB_FULL_FIELDS,
  trendFibExtension: FIB_FULL_FIELDS,
  fibChannel: FIB_LEVEL_FIELDS,
};

export function isTemplateType(type: unknown): type is TemplateType {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATE_FIELDS, type);
}

// ── per-field validation (stored values come from other devices via sync) ────

type Check = (v: unknown) => boolean;
const isColor: Check = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isBool: Check = (v) => typeof v === 'boolean';
// Blank text isn't saved, so applying such a template keeps the drawing's.
const isLabelText: Check = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= TEMPLATE_LABEL_TEXT_MAX;
const num = (min: number, max: number): Check => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const oneOf = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v);
const isDash = oneOf('solid', 'dashed', 'dotted');
const isLevel = (l: unknown): l is FibLevelConfig => {
  if (!l || typeof l !== 'object') return false;
  const { enabled, pct, color } = l as Record<string, unknown>;
  return isBool(enabled) && num(-100, 100)(pct) && isColor(color);
};

const FIELD_CHECKS: Record<string, Check> = {
  color: isColor, width: num(0, 50), dash: isDash, opacity: num(0, 100),
  filled: isBool, fillColor: isColor, fillOpacity: num(0, 100),
  labelColor: isColor, labelSize: num(1, 200), labelBold: isBool, labelItalic: isBool,
  labelVAlign: oneOf('top', 'middle', 'bottom'), labelHAlign: oneOf('left', 'center', 'right'),
  labelText: isLabelText,
  levels: (v) => Array.isArray(v) && v.length <= 64 && v.every(isLevel),
  levelWidth: num(0, 50), levelDash: isDash,
  extend: oneOf('none', 'left', 'right', 'both'),
  lineVisible: isBool, lineColor: isColor, lineWidth: num(0, 50), lineDash: isDash,
  reverse: isBool, background: isBool, backgroundOpacity: num(0, 100),
  showPrices: isBool, showLevels: isBool,
  levelsAs: oneOf('values', 'percent'), labelsSide: oneOf('left', 'right'),
};

// Copies so a template never shares the levels array/rows with a drawing.
function copyValue(field: string, v: unknown): unknown {
  return field === 'levels' ? (v as FibLevelConfig[]).map(({ enabled, pct, color }) => ({ enabled, pct, color })) : v;
}

/** `raw` reduced to the type's template fields with valid values (anything
 * else — coordinates, unknown keys, bad values, blank or over-long labelText —
 * is dropped). */
export function sanitizeStyle(type: TemplateType, raw: unknown): TemplateStyle {
  const out: TemplateStyle = {};
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const field of TEMPLATE_FIELDS[type]) {
    const v = src[field];
    if (v !== undefined && FIELD_CHECKS[field](v)) out[field] = copyValue(field, v);
  }
  return out;
}

/** A drawing's current style, as a template would save it. */
export function templateStyleOf(drawing: { type: string }): TemplateStyle {
  return isTemplateType(drawing.type) ? sanitizeStyle(drawing.type, drawing) : {};
}

/** Exactly the style fields a brand-new drawing of `type` is created with
 * (see the addDrawing calls in DrawingCanvas.tsx). */
export function defaultStyleFor(type: TemplateType): TemplateStyle {
  switch (type) {
    case 'xabcd': return { filled: true };
    case 'arc': return { filled: true, fillOpacity: 20 };
    case 'fibonacci':
    case 'trendFibExtension':
      return { levels: newFibLevels(), background: true };
    default: return {};
  }
}

/** The drawing patch that applies `style` to a drawing of `type`: every
 * template field except labelText is cleared first (so render fallbacks apply
 * to anything the style doesn't set), then the style's own values are written.
 * A style without labelText leaves the drawing's text as it is. */
export function stylePatchFor(type: TemplateType, style: TemplateStyle): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of TEMPLATE_FIELDS[type]) if (!KEEP_UNLESS_SET.has(field)) patch[field] = undefined;
  return { ...patch, ...sanitizeStyle(type, style) };
}
