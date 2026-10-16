import type { Markup } from '../../types/markup';
import type { MarkupSortField } from '../../utils/markupFilterSort';
import { markupTypeLabel } from './typeLabels';
import { countItems } from './countSymbols';
import { measureCategoryOf } from '../measurements/totals';

/**
 * Columnas de la lista de marcas (ADR-0060), como el menú "Markups List ▸ Columns" de Revu: el usuario elige cuáles
 * ver y la lista agrupa por Subject. Puro: sin React ni stores. Solo se ofrecen las columnas de Revu para las que REA
 * tiene el dato.
 */

export const MARKUP_COLUMNS = [
  { id: 'subject', label: 'Subject', defaultVisible: true, sort: 'type' },
  { id: 'pageLabel', label: 'Page Label', defaultVisible: true, sort: 'pageIndex' },
  { id: 'comments', label: 'Comments', defaultVisible: true, sort: 'text' },
  { id: 'pageIndex', label: 'Page Index', defaultVisible: false, sort: 'pageIndex' },
  { id: 'lock', label: 'Lock', defaultVisible: false },
  { id: 'author', label: 'Author', defaultVisible: true, sort: 'author' },
  { id: 'date', label: 'Date', defaultVisible: true, sort: 'createdAt' },
  { id: 'creationDate', label: 'Creation Date', defaultVisible: false, sort: 'createdAt' },
  { id: 'length', label: 'Length', defaultVisible: false },
  { id: 'area', label: 'Area', defaultVisible: false },
  { id: 'volume', label: 'Volume', defaultVisible: false },
  { id: 'count', label: 'Count', defaultVisible: false },
  { id: 'measurement', label: 'Measurement', defaultVisible: true, sort: 'measurement' },
  { id: 'label', label: 'Label', defaultVisible: false },
  { id: 'depth', label: 'Depth', defaultVisible: false },
  { id: 'status', label: 'Status', defaultVisible: true, sort: 'status' },
  { id: 'color', label: 'Color', defaultVisible: true, sort: 'color' },
  { id: 'layer', label: 'Layer', defaultVisible: true },
  { id: 'unit', label: 'Unit', defaultVisible: true },
] as const satisfies readonly { id: string; label: string; defaultVisible: boolean; sort?: MarkupSortField }[];

export type MarkupColumnId = (typeof MARKUP_COLUMNS)[number]['id'];

export const COLUMNS_STORAGE_KEY = 'rea-markups-columns';

const COLUMN_IDS = new Set<string>(MARKUP_COLUMNS.map((c) => c.id));

export const DEFAULT_VISIBLE_COLUMNS: MarkupColumnId[] = MARKUP_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

/** Columnas visibles guardadas (JSON) o las de por defecto; siempre en el orden de Revu y sin repetidos. */
export function parseVisibleColumns(stored: string | null | undefined): MarkupColumnId[] {
  if (!stored) return DEFAULT_VISIBLE_COLUMNS;
  try {
    const arr: unknown = JSON.parse(stored);
    if (!Array.isArray(arr)) return DEFAULT_VISIBLE_COLUMNS;
    const set = new Set(arr.filter((v): v is string => typeof v === 'string' && COLUMN_IDS.has(v)));
    return MARKUP_COLUMNS.filter((c) => set.has(c.id)).map((c) => c.id);
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

/** Muestra u oculta una columna conservando el orden de Revu. */
export function toggleColumn(visible: readonly MarkupColumnId[], id: MarkupColumnId): MarkupColumnId[] {
  const set = new Set(visible);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return MARKUP_COLUMNS.filter((c) => set.has(c.id)).map((c) => c.id);
}

export function columnDef(id: MarkupColumnId) {
  return MARKUP_COLUMNS.find((c) => c.id === id)!;
}

const unitSuffix = (m: Markup): string => {
  const u = m.measurement?.unit;
  if (!u) return '';
  if (m.type === 'area') return `${u}²`;
  if (m.type === 'volume') return `${u}³`;
  if (m.type === 'angle') return '°';
  if (m.type === 'count') return 'ea';
  return u;
};

/** Texto de una columna de solo lectura (las editables, la fecha y el color los dibuja la lista). */
export function columnText(id: MarkupColumnId, m: Markup): string {
  const cat = measureCategoryOf(m);
  const formatted = m.measurement?.formatted ?? (m.measurement?.value !== undefined ? String(m.measurement.value) : '');
  switch (id) {
    case 'subject':
      return markupTypeLabel(m.type);
    case 'pageLabel':
    case 'pageIndex':
      return String(m.pageIndex + 1);
    case 'lock':
      return m.locked ? 'Yes' : '';
    case 'length':
      return cat === 'length' ? formatted : '';
    case 'area':
      return cat === 'area' ? formatted : '';
    case 'volume':
      return cat === 'volume' ? formatted : '';
    case 'count':
      return m.type === 'count' ? String(countItems(m)) : '';
    case 'measurement':
      return formatted || '—';
    case 'label':
      return typeof m.customFields?.measureLabel === 'string' ? m.customFields.measureLabel : '';
    case 'depth':
      return m.type === 'volume' && m.customFields?.volumeDepth !== undefined
        ? `${m.customFields.volumeDepth} ${m.measurement?.unit ?? ''}`.trim()
        : '';
    case 'layer':
      return m.layer ?? '';
    case 'unit':
      return unitSuffix(m) || '—';
    default:
      return '';
  }
}

export interface SubjectGroup {
  subject: string;
  items: Markup[];
}

/** Agrupa por Subject, como Revu: grupos por nombre (A→Z, o Z→A) y, dentro, el orden ya aplicado a la lista. */
export function groupBySubject(markups: readonly Markup[], descending = false): SubjectGroup[] {
  const map = new Map<string, Markup[]>();
  for (const m of markups) {
    const key = markupTypeLabel(m.type);
    const list = map.get(key);
    if (list) list.push(m);
    else map.set(key, [m]);
  }
  const groups = [...map.entries()].map(([subject, items]) => ({ subject, items }));
  groups.sort((a, b) => a.subject.localeCompare(b.subject));
  return descending ? groups.reverse() : groups;
}
