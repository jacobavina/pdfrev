import { describe, it, expect } from 'vitest';
import { computeMeasureTotals, measureCategoryOf } from './totals';
import { Markup, MarkupType } from '../../types/markup';

const mk = (
  id: string,
  type: MarkupType,
  pageIndex: number,
  value: number,
  unit: 'm' | 'ft' | 'mm',
  perimeter?: number
): Markup => ({
  id,
  type,
  pageIndex,
  points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
  author: 'A',
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  status: 'pending',
  measurement: { value, unit, formatted: `${value} ${unit}`, perimeter },
});

describe('computeMeasureTotals (panel de mediciones)', () => {
  const markups: Markup[] = [
    mk('l1', 'length', 0, 2.5, 'm'),
    mk('l2', 'polylineMeasure', 0, 1.25, 'm'),
    mk('l3', 'length', 1, 10, 'ft'),
    mk('a1', 'area', 0, 12, 'm', 14),
    mk('a2', 'area', 1, 3, 'm', 7),
    mk('c1', 'count', 0, 1, 'm'),
    mk('c2', 'count', 0, 2, 'm'),
    { ...mk('r1', 'rectangle', 0, 99, 'm') },
  ];

  it('suma longitudes y polilíneas en la misma unidad, sin mezclar metros con pies', () => {
    const totals = computeMeasureTotals(markups);
    const lengthM = totals.find((t) => t.category === 'length' && t.unit === 'm')!;
    const lengthFt = totals.find((t) => t.category === 'length' && t.unit === 'ft')!;
    expect(lengthM.total).toBeCloseTo(3.75, 10);
    expect(lengthM.items).toBe(2);
    expect(lengthFt.total).toBe(10);
  });

  it('suma áreas y perímetros, y cuenta elementos de conteo', () => {
    const totals = computeMeasureTotals(markups);
    const area = totals.find((t) => t.category === 'area')!;
    expect(area.total).toBe(15);
    expect(area.perimeter).toBe(21);
    const count = totals.find((t) => t.category === 'count')!;
    expect(count.total).toBe(2);
    expect(count.unit).toBe('u');
  });

  it('filtra por página y ignora marcas sin medición', () => {
    const page0 = computeMeasureTotals(markups, 0);
    expect(page0.find((t) => t.category === 'area')!.total).toBe(12);
    expect(page0.some((t) => t.unit === 'ft')).toBe(false);
    expect(measureCategoryOf(markups[7])).toBeNull();
  });

  it('valores no finitos cuentan como 0 (nunca NaN en el total)', () => {
    const totals = computeMeasureTotals([mk('x', 'length', 0, Number.NaN, 'm'), mk('y', 'length', 0, 2, 'm')]);
    expect(totals[0].total).toBe(2);
  });
});
