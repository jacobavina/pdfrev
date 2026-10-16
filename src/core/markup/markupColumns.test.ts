import { describe, it, expect } from 'vitest';
import { DEFAULT_VISIBLE_COLUMNS, MARKUP_COLUMNS, columnText, groupBySubject, parseVisibleColumns, toggleColumn } from './markupColumns';
import { Markup, MarkupType } from '../../types/markup';

const mk = (id: string, type: MarkupType, extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 2,
  points: [{ x: 0.1, y: 0.1 }],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '2026-10-16T12:00:00Z',
  updatedAt: '2026-10-16T12:00:00Z',
  status: 'pending',
  ...extra,
});

describe('Columnas de la lista de marcas como Revu (ADR-0060)', () => {
  it('ofrece las columnas de Revu, con las de Revu visibles por defecto, y recuerda las elegidas en su orden', () => {
    expect(MARKUP_COLUMNS.map((c) => c.label).slice(0, 8)).toEqual([
      'Subject',
      'Page Label',
      'Comments',
      'Page Index',
      'Lock',
      'Author',
      'Date',
      'Creation Date',
    ]);
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(['subject', 'pageLabel', 'comments', 'author', 'date', 'measurement', 'status', 'color', 'layer', 'unit']);
    // Guardadas en desorden, con repetidos o desconocidas: vuelven en el orden de Revu
    expect(parseVisibleColumns('["layer","subject","bogus","subject"]')).toEqual(['subject', 'layer']);
    expect(parseVisibleColumns('no-json')).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(parseVisibleColumns(null)).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(toggleColumn(['subject', 'layer'], 'pageIndex')).toEqual(['subject', 'pageIndex', 'layer']);
    expect(toggleColumn(['subject', 'layer'], 'layer')).toEqual(['subject']);
  });

  it('agrupa por Subject en orden alfabético y el texto de cada columna sale de la marca', () => {
    const rect = mk('r', 'rectangle', { layer: 'Electrical', locked: true });
    const area = mk('a', 'area', { measurement: { value: 12.5, unit: 'm', formatted: '12.50 m²' } });
    const vol = mk('v', 'volume', { measurement: { value: 3, unit: 'm', formatted: '3.00 m³' }, customFields: { volumeDepth: 2 } });
    const cnt = mk('c', 'count', { points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], customFields: { countSymbol: 'check' } });
    const groups = groupBySubject([rect, cnt, area, mk('r2', 'rectangle')]);
    expect(groups.map((g) => `${g.subject} (${g.items.length})`)).toEqual(['Area (1)', 'Count (1)', 'Rectangle (2)']);
    expect(groupBySubject([rect, area], true).map((g) => g.subject)).toEqual(['Rectangle', 'Area']);

    expect(columnText('subject', rect)).toBe('Rectangle');
    expect(columnText('pageLabel', rect)).toBe('3');
    expect(columnText('lock', rect)).toBe('Yes');
    expect(columnText('layer', rect)).toBe('Electrical');
    expect(columnText('area', area)).toBe('12.50 m²');
    expect(columnText('length', area)).toBe('');
    expect(columnText('unit', area)).toBe('m²');
    expect(columnText('depth', vol)).toBe('2 m');
    expect(columnText('count', cnt)).toBe('2');
    expect(columnText('unit', cnt)).toBe('—');
  });
});
