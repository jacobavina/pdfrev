import { describe, it, expect } from 'vitest';
import type { Markup } from '../../types/markup';
import { filterLinks, groupLinksByPage, isBrokenLink, markupLinkEntries, sortLinks, targetLabel, type LinkEntry } from './linkList';

const link = (id: string, pageIndex: number, custom: Record<string, string | number>, extra: Partial<Markup> = {}): Markup =>
  ({
    id,
    type: 'link',
    pageIndex,
    points: [{ x: 0.1, y: 0.3 }, { x: 0.3, y: 0.4 }],
    style: { strokeColor: '#00f', strokeWidth: 1, opacity: 1 },
    author: 'a',
    createdAt: '',
    updatedAt: '',
    status: 'pending',
    customFields: custom,
    ...extra,
  }) as Markup;

describe('Links: lista de enlaces del documento (ADR-0116)', () => {
  it('toma solo las marcas de tipo link, con su destino, y deja fuera las ocultas', () => {
    const rect = { ...link('x', 0, {}), type: 'rectangle' } as Markup;
    const entries = markupLinkEntries([
      link('a', 0, { linkUri: 'https://example.com' }),
      link('b', 2, { linkPage: 5 }),
      link('c', 1, {}),
      link('d', 1, { linkUri: 'https://oculto.com' }, { hidden: true }),
      rect,
    ]);
    expect(entries.map((e) => [e.markupId, e.target.kind])).toEqual([['a', 'url'], ['b', 'page'], ['c', 'none']]);
    expect(entries[0]).toMatchObject({ source: 'markup', pageIndex: 0, y: 0.3 });
  });

  it('el texto de cada destino', () => {
    expect(targetLabel({ kind: 'url', url: 'https://a.b' })).toBe('https://a.b');
    expect(targetLabel({ kind: 'page', page: 7 })).toBe('Page 7');
    expect(targetLabel({ kind: 'none' })).toBe('No destination');
  });

  it('un enlace roto es el que no tiene destino, va a una página que no existe o a una dirección que no se puede abrir', () => {
    expect(isBrokenLink({ kind: 'none' }, 10)).toBe(true);
    expect(isBrokenLink({ kind: 'page', page: 11 }, 10)).toBe(true);
    expect(isBrokenLink({ kind: 'page', page: 0 }, 10)).toBe(true);
    expect(isBrokenLink({ kind: 'page', page: 10 }, 10)).toBe(false);
    expect(isBrokenLink({ kind: 'url', url: 'javascript:alert(1)' }, 10)).toBe(true);
    expect(isBrokenLink({ kind: 'url', url: 'file:///C:/x' }, 10)).toBe(true);
    expect(isBrokenLink({ kind: 'url', url: 'https://example.com/a?b=1' }, 10)).toBe(false);
    expect(isBrokenLink({ kind: 'url', url: 'mailto:a@b.co' }, 10)).toBe(false);
  });

  const entries: LinkEntry[] = [
    { key: 'p:1', source: 'pdf', pageIndex: 1, y: 0.2, target: { kind: 'page', page: 3 } },
    { key: 'm:a', source: 'markup', pageIndex: 1, y: 0.2, target: { kind: 'url', url: 'https://a.com' } },
    { key: 'm:b', source: 'markup', pageIndex: 0, y: 0.9, target: { kind: 'page', page: 99 } },
    { key: 'm:c', source: 'markup', pageIndex: 1, y: 0.05, target: { kind: 'none' } },
  ];

  it('se ordena por página y posición, con las marcas de REA antes que las del PDF a igual posición', () => {
    expect(sortLinks(entries).map((e) => e.key)).toEqual(['m:b', 'm:c', 'm:a', 'p:1']);
  });

  it('se agrupa por página en orden', () => {
    const groups = groupLinksByPage(entries);
    expect(groups.map((g) => [g.pageIndex, g.entries.map((e) => e.key)])).toEqual([
      [0, ['m:b']],
      [1, ['m:c', 'm:a', 'p:1']],
    ]);
  });

  it('el filtro separa direcciones, páginas y enlaces rotos', () => {
    expect(filterLinks(entries, 'url', 10).map((e) => e.key)).toEqual(['m:a']);
    expect(filterLinks(entries, 'page', 10).map((e) => e.key)).toEqual(['p:1', 'm:b']);
    expect(filterLinks(entries, 'broken', 10).map((e) => e.key)).toEqual(['m:b', 'm:c']);
    expect(filterLinks(entries, 'all', 10)).toHaveLength(4);
  });
});
