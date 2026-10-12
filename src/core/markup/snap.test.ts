import { describe, it, expect } from 'vitest';
import { snapPoint } from './snap';
import { Markup, MarkupType } from '../../types/markup';

const mk = (type: MarkupType, points: { x: number; y: number }[]): Markup => ({
  id: `m-${type}`,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
});

const page = { width: 1000, height: 1000 };
const all = { endpoint: true, midpoint: true, nearest: true };

describe('Snap a marcas existentes (ADR-0025)', () => {
  const line = mk('line', [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }]);

  it('se ajusta al extremo dentro de la tolerancia en píxeles', () => {
    expect(snapPoint({ x: 0.105, y: 0.104 }, [line], page, all)).toEqual({ point: { x: 0.1, y: 0.1 }, kind: 'endpoint' });
    expect(snapPoint({ x: 0.13, y: 0.1 }, [line], page, { endpoint: true, midpoint: false, nearest: false })).toBeNull();
  });

  it('punto medio y punto más cercano de la arista', () => {
    expect(snapPoint({ x: 0.302, y: 0.103 }, [line], page, all)?.kind).toBe('midpoint');
    const near = snapPoint({ x: 0.2, y: 0.105 }, [line], page, all)!;
    expect(near.kind).toBe('nearest');
    expect(near.point.x).toBeCloseTo(0.2, 6);
    expect(near.point.y).toBeCloseTo(0.1, 6);
  });

  it('los rectángulos aportan sus cuatro esquinas; sin modos activos no hay snap', () => {
    const rect = mk('rectangle', [{ x: 0.6, y: 0.6 }, { x: 0.8, y: 0.7 }]);
    expect(snapPoint({ x: 0.801, y: 0.601 }, [rect], page, all)?.point).toEqual({ x: 0.8, y: 0.6 });
    expect(snapPoint({ x: 0.801, y: 0.601 }, [rect], page, { endpoint: false, midpoint: false, nearest: false })).toBeNull();
  });
});
