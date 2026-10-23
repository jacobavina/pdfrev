import { describe, it, expect } from 'vitest';
import type { Markup } from '../../types/markup';
import { canBeSpace, formatSpaceArea, isSpace, nextSpaceName, spaceInfo, spaceLabel, spaceRows, spacesCsvRows, totalsByUnit, withSpace, withoutSpace } from './spaces';

const area = (id: string, pageIndex: number, value: number, extra: Partial<Markup> = {}, y = 0.2): Markup =>
  ({
    id,
    type: 'area',
    pageIndex,
    points: [{ x: 0.1, y }, { x: 0.4, y }, { x: 0.4, y: y + 0.2 }],
    style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
    author: 'a',
    createdAt: '',
    updatedAt: '',
    status: 'pending',
    measurement: { value, unit: 'm', formatted: `${value} m²`, perimeter: value / 2 },
    ...extra,
  }) as Markup;

describe('Spaces: salas sobre mediciones de área (ADR-0118)', () => {
  it('solo una medición de área con valor puede ser espacio, y lo es si lleva la marca', () => {
    expect(canBeSpace(area('a', 0, 10))).toBe(true);
    expect(canBeSpace({ type: 'rectangle', measurement: undefined })).toBe(false);
    expect(canBeSpace({ type: 'length', measurement: { value: 1, unit: 'm', formatted: '1' } })).toBe(false);
    expect(isSpace(area('a', 0, 10))).toBe(false);
    expect(isSpace(withSpace(area('a', 0, 10), { name: 'Sala', number: '' }, 't'))).toBe(true);
    expect(isSpace({ type: 'rectangle', customFields: { isSpace: 1 } })).toBe(false);
  });

  it('hacer espacio guarda número y nombre y los escribe como etiqueta de la medición', () => {
    const m = withSpace(area('a', 0, 10), { name: '  Sala de juntas ', number: '101' }, 't1');
    expect(spaceInfo(m)).toEqual({ name: 'Sala de juntas', number: '101' });
    expect(m.customFields).toMatchObject({ isSpace: 1, measureLabel: '101 · Sala de juntas' });
    expect(m.updatedAt).toBe('t1');
    // Solo nombre, solo número y ninguno
    expect(withSpace(m, { name: 'Hall', number: '' }, 't').customFields?.measureLabel).toBe('Hall');
    expect(withSpace(m, { name: '', number: '7' }, 't').customFields?.measureLabel).toBe('7');
    const blank = withSpace(m, { name: '', number: '' }, 't');
    expect(blank.customFields?.measureLabel).toBeUndefined();
    expect(blank.customFields?.spaceName).toBeUndefined();
    expect(spaceLabel({ name: 'A', number: '1' })).toBe('1 · A');
  });

  it('quitar el espacio devuelve la medición de siempre y respeta los demás campos', () => {
    const base = area('a', 0, 10, { customFields: { volumeDepth: 3 } });
    const space = withSpace(base, { name: 'Sala', number: '1' }, 't');
    expect(space.customFields).toMatchObject({ volumeDepth: 3, isSpace: 1 });
    expect(withoutSpace(space, 't').customFields).toEqual({ volumeDepth: 3 });
    expect(withoutSpace(withSpace(area('b', 0, 1), { name: 'x', number: '' }, 't'), 't').customFields).toBeUndefined();
  });

  it('el nombre automático es el primer "Space N" libre, sin distinguir mayúsculas', () => {
    const list = [withSpace(area('a', 0, 1), { name: 'Space 1', number: '' }, ''), withSpace(area('b', 0, 1), { name: 'space 2', number: '' }, ''), area('c', 0, 1)];
    expect(nextSpaceName(list)).toBe('Space 3');
    expect(nextSpaceName(list, ['Space 3', 'Space 4'])).toBe('Space 5');
    expect(nextSpaceName([])).toBe('Space 1');
  });

  it('las filas salen por página y número con orden natural, sin las ocultas ni las marcas que no son espacio', () => {
    const rows = spaceRows([
      withSpace(area('c', 1, 30), { name: 'C', number: '10' }, ''),
      withSpace(area('a', 0, 10), { name: 'A', number: '2' }, ''),
      withSpace(area('b', 0, 20), { name: 'B', number: '10' }, ''),
      withSpace({ ...area('h', 0, 5), hidden: true }, { name: 'H', number: '1' }, ''),
      area('suelta', 0, 99),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({ number: '2', name: 'A', area: 10, perimeter: 5, unit: 'm', pageIndex: 0 });
  });

  it('los totales se separan por unidad y suman áreas y perímetros', () => {
    const feet = withSpace({ ...area('f', 0, 100), measurement: { value: 100, unit: 'ft', formatted: '100 ft²', perimeter: 40 } }, { name: 'F', number: '' }, '');
    const rows = spaceRows([withSpace(area('a', 0, 10), { name: 'A', number: '' }, ''), withSpace(area('b', 1, 20), { name: 'B', number: '' }, ''), feet]);
    expect(totalsByUnit(rows)).toEqual([
      { unit: 'm', area: 30, perimeter: 15, count: 2 },
      { unit: 'ft', area: 100, perimeter: 40, count: 1 },
    ]);
    expect(formatSpaceArea(30, 'm')).toBe('30.00 m²');
  });

  it('el CSV lleva nivel, número, nombre, área, perímetro y unidad', () => {
    const rows = spaceRows([withSpace(area('a', 0, 12.5), { name: 'Sala', number: '101' }, '')]);
    expect(spacesCsvRows(rows, (i) => `Planta ${i}`)).toEqual([
      ['Level', 'Number', 'Name', 'Area', 'Perimeter', 'Unit'],
      ['Planta 0', '101', 'Sala', '12.50', '6.25', 'm'],
    ]);
  });
});
