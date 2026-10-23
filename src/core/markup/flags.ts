import type { Markup } from '../../types/markup';
import { markupTypeLabel } from './typeLabels';

/**
 * Banderas (Flags, ADR-0117): una marca puede llevar una bandera para volver a ella más tarde. Se guarda como el campo
 * propio `flagged` de la marca, que viaja con el archivo en el diccionario de REA. Puro.
 */

export const FLAG_FIELD = 'flagged';

export const isFlagged = (m: Pick<Markup, 'customFields'>): boolean => Number(m.customFields?.[FLAG_FIELD]) === 1;

/** La marca con la bandera puesta o quitada (sin dejar el campo a 0). */
export function withFlag(m: Markup, flagged: boolean, now: string): Markup {
  const fields = { ...(m.customFields ?? {}) };
  if (flagged) fields[FLAG_FIELD] = 1;
  else delete fields[FLAG_FIELD];
  return { ...m, customFields: Object.keys(fields).length > 0 ? fields : undefined, updatedAt: now };
}

/** Las marcas con bandera, por página y posición, sin las ocultas. */
export function flaggedMarkups(markups: Markup[]): Markup[] {
  const top = (m: Markup) => (m.points.length > 0 ? Math.min(...m.points.map((p) => p.y)) : 0);
  return markups
    .filter((m) => isFlagged(m) && !m.hidden)
    .sort((a, b) => a.pageIndex - b.pageIndex || top(a) - top(b) || a.id.localeCompare(b.id));
}

/** Texto de la fila: el comentario si lo hay y, si no, el tipo de marca (con su medida si es una medición). */
export function flagTitle(m: Markup): string {
  const text = (m.text ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  const label = markupTypeLabel(m.type);
  return m.measurement?.formatted ? `${label} · ${m.measurement.formatted}` : label;
}

/** Esquina superior derecha de la marca, donde se dibuja la bandera sobre la hoja (coordenadas normalizadas). */
export function flagAnchor(m: Pick<Markup, 'points' | 'leaders'>): { x: number; y: number } | null {
  const pts = [...m.points, ...(m.leaders ?? []).flat()];
  if (pts.length === 0) return null;
  return { x: Math.max(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
}
