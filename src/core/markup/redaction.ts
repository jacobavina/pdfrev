import { v4 as uuidv4 } from 'uuid';
import type { SearchMatch } from '../search/textSearch';
import type { Markup, MarkupPoint } from '../../types/markup';

/**
 * Marcas de redacción (ADR-0103). Módulo ligero, sin pdf-lib: lo usa el visor para dibujarlas. Aplicarlas al PDF está en
 * `services/redactionService.ts`, que se carga bajo demanda.
 */

export const REDACTION_SUBJECT = 'Redaction';

export const isRedaction = (m: Pick<Markup, 'type' | 'customFields'>) => m.type === 'rectangle' && m.customFields?.redact === 1;

/** Marca de redacción: un rectángulo rojo discontinuo y translúcido. */
export function redactionMarkup(pageIndex: number, a: MarkupPoint, b: MarkupPoint, author: string, layer?: string): Markup {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    type: 'rectangle',
    pageIndex,
    points: [
      { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    ],
    style: { strokeColor: '#e02424', fillColor: 'rgba(224, 36, 36, 0.18)', strokeWidth: 1.5, opacity: 1, dashArray: [5, 3] },
    subject: REDACTION_SUBJECT,
    text: 'Redact',
    author,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    layer,
    customFields: { redact: 1 },
  };
}

/** Una marca de redacción por cada línea de cada resultado de la búsqueda (Search & Redact). */
export function redactionsFromMatches(matches: SearchMatch[], author: string, layer?: string): Markup[] {
  const out: Markup[] = [];
  for (const m of matches) {
    for (const r of m.rects) out.push(redactionMarkup(m.pageIndex, { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, author, layer));
  }
  return out;
}
