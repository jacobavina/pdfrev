import { describe, it, expect } from 'vitest';
import { sketchToScale, sketchProblem, type SketchContext, type SketchSpec } from './sketchToScale';

// Hoja de 1000 × 800 pt; 1 pt = 0,01 m
const ctx = (over: Partial<SketchContext> = {}): SketchContext => ({
  pageIndex: 2,
  center: { x: 0.5, y: 0.5 },
  calibration: { scale: 0.01, unit: 'm', precision: 2 },
  dims: { width: 1000, height: 800 },
  style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
  author: 'Reviewer',
  ...over,
});
const spec = (over: Partial<SketchSpec>): SketchSpec => ({ shape: 'rectangle', width: 4, height: 3, angle: 0, sides: 6, ...over });
const markup = (s: SketchSpec, c = ctx()) => {
  const r = sketchToScale(s, c);
  if (!r.ok) throw new Error(r.reason);
  return r.markup;
};

describe('Sketch to Scale (ADR-0128)', () => {
  it('un rectángulo de 4 × 3 m a 0,01 m/pt mide 400 × 300 pt y queda centrado', () => {
    const m = markup(spec({}));
    expect(m.type).toBe('rectangle');
    expect(m.pageIndex).toBe(2);
    const [a, b] = m.points;
    expect((b.x - a.x) * 1000).toBeCloseTo(400, 6);
    expect((b.y - a.y) * 800).toBeCloseTo(300, 6);
    expect((a.x + b.x) / 2).toBeCloseTo(0.5, 9);
    expect((a.y + b.y) / 2).toBeCloseTo(0.5, 9);
    expect(a.x).toBeLessThan(b.x);
    expect(a.y).toBeLessThan(b.y);
  });

  it('el círculo usa ancho y alto, y una escala distinta por eje reparte los puntos de cada eje con la suya', () => {
    const m = markup(spec({ shape: 'circle', width: 2, height: 2 }), ctx({ calibration: { scale: 0.01, scaleY: 0.02, unit: 'm' } }));
    expect(m.type).toBe('circle');
    const [a, b] = m.points;
    expect((b.x - a.x) * 1000).toBeCloseTo(200, 6);
    expect((b.y - a.y) * 800).toBeCloseTo(100, 6);
  });

  it('la línea parte de su centro con el largo y el ángulo pedidos (90 grados va hacia arriba)', () => {
    const horizontal = markup(spec({ shape: 'line', width: 5, angle: 0 })).points;
    expect((horizontal[1].x - horizontal[0].x) * 1000).toBeCloseTo(500, 6);
    expect(horizontal[1].y).toBeCloseTo(horizontal[0].y, 9);
    const up = markup(spec({ shape: 'line', width: 3, angle: 90 })).points;
    expect(up[1].y).toBeLessThan(up[0].y);
    expect(Math.hypot((up[1].x - up[0].x) * 1000, (up[1].y - up[0].y) * 800)).toBeCloseTo(300, 6);
  });

  it('un polígono regular tiene todos sus lados iguales al pedido y uno horizontal abajo', () => {
    const m = markup(spec({ shape: 'polygon', width: 2, sides: 6 }));
    expect(m.type).toBe('polygon');
    expect(m.points).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const p = m.points[i];
      const q = m.points[(i + 1) % 6];
      expect(Math.hypot((q.x - p.x) * 1000, (q.y - p.y) * 800)).toBeCloseTo(200, 6);
    }
    const bottom = Math.max(...m.points.map((p) => p.y));
    expect(m.points.filter((p) => Math.abs(p.y - bottom) < 1e-9)).toHaveLength(2);
  });

  it('copia el estilo y el autor y pone fechas y estado de una marca nueva', () => {
    const m = markup(spec({}), ctx({ layer: 'Obra' }));
    expect(m.style).toEqual({ strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 });
    expect(m).toMatchObject({ author: 'Reviewer', status: 'pending', layer: 'Obra' });
    expect(m.createdAt).toBe(m.updatedAt);
  });

  it('rechaza medidas no válidas con su motivo', () => {
    expect(sketchProblem(spec({ width: 0 }))).toMatch(/greater than zero/);
    expect(sketchProblem(spec({ height: -1 }))).toMatch(/Width and height/);
    expect(sketchProblem(spec({ shape: 'line', angle: NaN }))).toMatch(/angle/);
    expect(sketchProblem(spec({ shape: 'polygon', sides: 2 }))).toMatch(/between 3 and 24/);
    expect(sketchProblem(spec({ shape: 'polygon', sides: 30 }))).toMatch(/between 3 and 24/);
    expect(sketchToScale(spec({ width: NaN }), ctx())).toMatchObject({ ok: false });
  });

  it('si la forma no cabe en la hoja a esa escala no se crea', () => {
    const r = sketchToScale(spec({ width: 20, height: 3 }), ctx());
    expect(r).toEqual({ ok: false, reason: 'That shape does not fit on the page at this scale.' });
    const edge = sketchToScale(spec({ width: 4, height: 3 }), ctx({ center: { x: 0.95, y: 0.5 } }));
    expect(edge.ok).toBe(false);
  });
});
