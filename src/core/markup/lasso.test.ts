import { describe, it, expect } from 'vitest';
import type { Markup } from '../../types/markup';
import { isUsableLasso, lassoSelect, pointInPolygon, polygonTouchesBounds } from './lasso';

const mk = (id: string, points: { x: number; y: number }[]): Markup =>
  ({ id, type: 'line', pageIndex: 0, points, style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending' }) as Markup;

// Un lazo en forma de "L" para distinguir formas libres de rectángulos
const L = [
  { x: 0.1, y: 0.1 },
  { x: 0.4, y: 0.1 },
  { x: 0.4, y: 0.3 },
  { x: 0.2, y: 0.3 },
  { x: 0.2, y: 0.6 },
  { x: 0.1, y: 0.6 },
];

describe('Lasso: selección con una forma libre (ADR-0110)', () => {
  it('el punto dentro de la forma se detecta y el de la esquina entrante no', () => {
    expect(pointInPolygon({ x: 0.15, y: 0.4 }, L)).toBe(true);
    expect(pointInPolygon({ x: 0.3, y: 0.2 }, L)).toBe(true);
    expect(pointInPolygon({ x: 0.3, y: 0.5 }, L)).toBe(false); // el hueco de la L
    expect(pointInPolygon({ x: 0.9, y: 0.9 }, L)).toBe(false);
  });

  it('elige las marcas que el lazo toca y deja las demás, incluida una que cae en el hueco de la L', () => {
    const inside = mk('dentro', [{ x: 0.12, y: 0.45 }, { x: 0.15, y: 0.5 }]);
    const crossing = mk('cruza', [{ x: 0.05, y: 0.2 }, { x: 0.5, y: 0.2 }]); // atraviesa el lazo sin vértices dentro
    const notch = mk('hueco', [{ x: 0.28, y: 0.45 }, { x: 0.35, y: 0.55 }]);
    const far = mk('lejos', [{ x: 0.7, y: 0.7 }, { x: 0.8, y: 0.8 }]);
    expect(lassoSelect([inside, crossing, notch, far], L).sort()).toEqual(['cruza', 'dentro']);
  });

  it('un lazo que envuelve entera una marca grande la elige aunque ninguno de sus lados la cruce', () => {
    const big = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const small = mk('chica', [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }]);
    expect(lassoSelect([small], big)).toEqual(['chica']);
    // Y a la inversa: una marca enorme que contiene al lazo también se toca
    const huge = { minX: -1, minY: -1, maxX: 2, maxY: 2 };
    expect(polygonTouchesBounds(L, huge)).toBe(true);
  });

  it('un lazo con menos de tres puntos o sin área no elige nada', () => {
    const m = mk('a', [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]);
    expect(isUsableLasso([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }])).toBe(false);
    expect(isUsableLasso([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }])).toBe(false); // colineales
    expect(lassoSelect([m], [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }])).toEqual([]);
  });
});
