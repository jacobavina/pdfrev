import type { Markup } from '../../types/markup';

/**
 * Espacios (Spaces, ADR-0118): una medición de área a la que se le da número y nombre (una sala, un local). Se guarda
 * como campos propios de la marca (`isSpace`, `spaceName`, `spaceNumber`) y su nombre se escribe también como la
 * etiqueta de la medición, de modo que se ve sobre el plano y en el PDF. Puro.
 */

export const SPACE_FIELD = 'isSpace';

export interface SpaceInfo {
  name: string;
  number: string;
}

export const isSpace = (m: Pick<Markup, 'type' | 'customFields'>): boolean => m.type === 'area' && Number(m.customFields?.[SPACE_FIELD]) === 1;

/** Una medición de área con valor puede ser un espacio. */
export const canBeSpace = (m: Pick<Markup, 'type' | 'measurement'>): boolean => m.type === 'area' && !!m.measurement;

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export const spaceInfo = (m: Pick<Markup, 'customFields'>): SpaceInfo => ({
  name: str(m.customFields?.spaceName),
  number: str(m.customFields?.spaceNumber),
});

/** Texto que se escribe sobre el plano: "101 · Sala de juntas". */
export const spaceLabel = (info: SpaceInfo): string => [info.number.trim(), info.name.trim()].filter(Boolean).join(' · ');

/** La marca como espacio, con el número y el nombre dados (vacío los quita) y la etiqueta al día. */
export function withSpace(m: Markup, info: SpaceInfo, now: string): Markup {
  const fields: Record<string, string | number> = { ...(m.customFields ?? {}), [SPACE_FIELD]: 1 };
  const name = info.name.trim();
  const number = info.number.trim();
  if (name) fields.spaceName = name;
  else delete fields.spaceName;
  if (number) fields.spaceNumber = number;
  else delete fields.spaceNumber;
  const label = spaceLabel({ name, number });
  if (label) fields.measureLabel = label;
  else delete fields.measureLabel;
  return { ...m, customFields: fields, updatedAt: now };
}

/** La marca otra vez como medición de área normal, sin los campos del espacio ni su etiqueta. */
export function withoutSpace(m: Markup, now: string): Markup {
  const fields = { ...(m.customFields ?? {}) };
  delete fields[SPACE_FIELD];
  delete fields.spaceName;
  delete fields.spaceNumber;
  delete fields.measureLabel;
  return { ...m, customFields: Object.keys(fields).length > 0 ? fields : undefined, updatedAt: now };
}

/** El primer "Space N" que no usa ningún espacio del documento. */
export function nextSpaceName(markups: Markup[], taken: string[] = []): string {
  const used = new Set([...markups.filter(isSpace).map((m) => spaceInfo(m).name.toLowerCase()), ...taken.map((t) => t.toLowerCase())]);
  for (let n = 1; ; n++) {
    const candidate = `Space ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export interface SpaceRow {
  id: string;
  pageIndex: number;
  number: string;
  name: string;
  area: number;
  perimeter: number | null;
  unit: string;
  locked: boolean;
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/** Los espacios del documento: por página, número (orden natural: 2 antes que 10), nombre y posición. */
export function spaceRows(markups: Markup[]): SpaceRow[] {
  const top = (m: Markup) => (m.points.length > 0 ? Math.min(...m.points.map((p) => p.y)) : 0);
  return markups
    .filter((m) => isSpace(m) && !m.hidden && m.measurement)
    .sort((a, b) => a.pageIndex - b.pageIndex || naturalCompare(spaceInfo(a).number, spaceInfo(b).number) || naturalCompare(spaceInfo(a).name, spaceInfo(b).name) || top(a) - top(b) || a.id.localeCompare(b.id))
    .map((m) => ({
      id: m.id,
      pageIndex: m.pageIndex,
      ...spaceInfo(m),
      area: m.measurement!.value,
      perimeter: typeof m.measurement!.perimeter === 'number' ? m.measurement!.perimeter : null,
      unit: m.measurement!.unit,
      locked: Boolean(m.locked),
    }));
}

export interface SpaceTotal {
  unit: string;
  area: number;
  perimeter: number;
  count: number;
}

/** Suma de áreas y perímetros por unidad (no se mezclan metros con pies). */
export function totalsByUnit(rows: SpaceRow[]): SpaceTotal[] {
  const map = new Map<string, SpaceTotal>();
  for (const r of rows) {
    const t = map.get(r.unit) ?? { unit: r.unit, area: 0, perimeter: 0, count: 0 };
    t.area += r.area;
    t.perimeter += r.perimeter ?? 0;
    t.count += 1;
    map.set(r.unit, t);
  }
  return [...map.values()];
}

export const formatSpaceArea = (value: number, unit: string, decimals = 2): string => `${value.toFixed(decimals)} ${unit}²`;
export const formatSpaceLength = (value: number, unit: string, decimals = 2): string => `${value.toFixed(decimals)} ${unit}`;

/** Filas del CSV de espacios: nivel (nombre de la página), número, nombre, área, perímetro y unidad. */
export function spacesCsvRows(rows: SpaceRow[], levelName: (pageIndex: number) => string): string[][] {
  return [
    ['Level', 'Number', 'Name', 'Area', 'Perimeter', 'Unit'],
    ...rows.map((r) => [levelName(r.pageIndex), r.number, r.name, r.area.toFixed(2), r.perimeter === null ? '' : r.perimeter.toFixed(2), r.unit]),
  ];
}
