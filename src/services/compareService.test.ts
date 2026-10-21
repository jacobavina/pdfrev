import { describe, it, expect, beforeEach } from 'vitest';
import { applyComparison, comparisonClouds, COMPARISON_LAYER } from './compareService';
import { useMarkupStore } from '../store/useMarkupStore';

const W = 400;
const H = 300;
const blank = () => new Uint8ClampedArray(W * H * 4).fill(255);
const ink = (img: Uint8ClampedArray, x0: number, y0: number, w: number, h: number) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
};

describe('Compare Documents: nubes en la capa Comparison (ADR-0091)', () => {
  beforeEach(() => useMarkupStore.setState({ markups: [], selectedMarkupIds: [] }));

  it('crea una nube por cada región cambiada en la capa Comparison, en un solo paso de historial', () => {
    const a = blank();
    const b = blank();
    ink(b, 200, 60, 80, 20);
    ink(a, 100, 200, 30, 70);
    const n = applyComparison({ data: a, width: W, height: H }, { data: b, width: W, height: H }, 2, 'Rev B.pdf');
    expect(n).toBe(2);
    const { markups } = useMarkupStore.getState();
    expect(markups).toHaveLength(2);
    for (const m of markups) {
      expect(m).toMatchObject({ type: 'cloud', pageIndex: 2, layer: COMPARISON_LAYER, status: 'pending' });
      expect(m.text).toContain('Rev B.pdf');
      expect(m.points).toHaveLength(2);
    }
    useMarkupStore.getState().undo();
    expect(useMarkupStore.getState().markups).toHaveLength(0);
  });

  it('sin diferencias no crea marcas, y dos tamaños distintos se rechazan', () => {
    const a = { data: blank(), width: W, height: H };
    expect(applyComparison(a, { data: blank(), width: W, height: H }, 0, 'x')).toBe(0);
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    expect(() => applyComparison(a, { data: new Uint8ClampedArray(4), width: 1, height: 1 }, 0, 'x')).toThrow();
  });

  it('cada nube lleva el tamaño de lóbulos de las nubes nuevas y numera el cambio', () => {
    const [m] = comparisonClouds([{ x: 0.1, y: 0.1, width: 0.2, height: 0.1 }], 0, 'B.pdf', 'Ana');
    expect(m.author).toBe('Ana');
    expect(m.customFields?.arcStep).toBeGreaterThan(0);
    expect(m.text).toBe('Changed vs B.pdf (1 of 1)');
  });
});
