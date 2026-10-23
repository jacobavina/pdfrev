import type { Markup } from '../../types/markup';

/**
 * Lista de enlaces del documento (panel Links, ADR-0116): los hipervínculos de REA (marcas de tipo `link`) y los enlaces
 * propios del PDF. Puro.
 */

export type LinkTarget = { kind: 'url'; url: string } | { kind: 'page'; page: number } | { kind: 'none' };

export interface LinkEntry {
  /** Clave estable de la fila. */
  key: string;
  source: 'markup' | 'pdf';
  pageIndex: number;
  /** Posición vertical (0 arriba, 1 abajo) para ordenar dentro de la página. */
  y: number;
  target: LinkTarget;
  /** Marca de REA a la que pertenece, si es un enlace de REA. */
  markupId?: string;
  locked?: boolean;
}

/** Los enlaces de REA: marcas `link` con `linkUri` o `linkPage` (página 1-based). */
export function markupLinkEntries(markups: Markup[]): LinkEntry[] {
  const out: LinkEntry[] = [];
  for (const m of markups) {
    if (m.type !== 'link' || m.hidden) continue;
    const uri = m.customFields?.linkUri;
    const page = m.customFields?.linkPage;
    const target: LinkTarget =
      typeof uri === 'string' && uri ? { kind: 'url', url: uri } : typeof page === 'number' ? { kind: 'page', page } : { kind: 'none' };
    out.push({
      key: `m:${m.id}`,
      source: 'markup',
      pageIndex: m.pageIndex,
      y: m.points.length > 0 ? Math.min(...m.points.map((p) => p.y)) : 0,
      target,
      markupId: m.id,
      locked: m.locked,
    });
  }
  return out;
}

/** Texto de la fila: la página de destino o la dirección. */
export function targetLabel(t: LinkTarget): string {
  if (t.kind === 'url') return t.url;
  if (t.kind === 'page') return `Page ${t.page}`;
  return 'No destination';
}

/** Un enlace roto: a una página que no existe, sin destino o a una dirección que no se puede abrir (solo http, https y mailto). */
export function isBrokenLink(t: LinkTarget, numPages: number): boolean {
  if (t.kind === 'none') return true;
  if (t.kind === 'page') return !Number.isInteger(t.page) || t.page < 1 || t.page > numPages;
  return !/^(https?:\/\/|mailto:)[^\s"'`<>|^\\]+$/i.test(t.url.trim()) || t.url.length > 2048;
}

/** Marcas de REA primero en cada página y por posición vertical; los enlaces del PDF después. */
export function sortLinks(entries: LinkEntry[]): LinkEntry[] {
  return [...entries].sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || (a.source === b.source ? 0 : a.source === 'markup' ? -1 : 1) || a.key.localeCompare(b.key));
}

export type LinkFilter = 'all' | 'url' | 'page' | 'broken';

export function filterLinks(entries: LinkEntry[], filter: LinkFilter, numPages: number): LinkEntry[] {
  switch (filter) {
    case 'url':
      return entries.filter((e) => e.target.kind === 'url');
    case 'page':
      return entries.filter((e) => e.target.kind === 'page');
    case 'broken':
      return entries.filter((e) => isBrokenLink(e.target, numPages));
    default:
      return entries;
  }
}

/** Las filas agrupadas por página, en orden. */
export function groupLinksByPage(entries: LinkEntry[]): { pageIndex: number; entries: LinkEntry[] }[] {
  const groups: { pageIndex: number; entries: LinkEntry[] }[] = [];
  for (const e of sortLinks(entries)) {
    const last = groups[groups.length - 1];
    if (last && last.pageIndex === e.pageIndex) last.entries.push(e);
    else groups.push({ pageIndex: e.pageIndex, entries: [e] });
  }
  return groups;
}
