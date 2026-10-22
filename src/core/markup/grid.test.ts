import { describe, it, expect } from 'vitest';
import { GRID_MAJOR_EVERY, gridLines, gridStepPt, niceStep, snapToGrid } from './grid';

describe('Rejilla de la hoja: Show Grid y Snap to Grid (ADR-0106)', () => {
  it('el paso automático es un 1, 2 o 5 por una potencia de diez', () => {
    expect([0.7, 1, 1.4, 2, 3, 5, 6, 12, 130, 0.034].map(niceStep)).toEqual([1, 1, 2, 2, 5, 5, 10, 20, 200, 0.05]);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });

  it('la rejilla automática deja las líneas a no menos de 48 px y se adapta al zoom', () => {
    // Sin calibrar: milímetros de papel (0.3528 mm por punto) y 1 pt = 1 px
    const s = 25.4 / 72;
    const step100 = gridStepPt(null, s, 1);
    expect(step100 * 1).toBeGreaterThanOrEqual(48);
    // El paso es un número redondo de milímetros: 20 mm = 56.7 pt
    expect((step100 * s)).toBeCloseTo(20, 6);
    // Al acercar, el paso baja; al alejar, sube
    expect(gridStepPt(null, s, 4)).toBeLessThan(step100);
    expect(gridStepPt(null, s, 0.25)).toBeGreaterThan(step100);
    // Calibrada a 1 pt = 0.05 m, con zoom 2: 24 pt = 1.2 m, que sube al paso redondo de 2 m
    expect(gridStepPt(null, 0.05, 2) * 0.05).toBeCloseTo(2, 6);
  });

  it('un espaciado elegido se convierte a puntos y uno diminuto se agrupa para no llenar la hoja', () => {
    // 5 mm de papel = 14.17 pt
    expect(gridStepPt(5, 25.4 / 72, 1)).toBeCloseTo(5 / (25.4 / 72), 9);
    // A zoom 0.1 serían 1.4 px entre líneas: se agrupan hasta pasar de 6 px
    const grouped = gridStepPt(5, 25.4 / 72, 0.1);
    expect(grouped * 0.1).toBeGreaterThanOrEqual(6);
    expect(grouped / (5 / (25.4 / 72))).toBe(Math.round(grouped / (5 / (25.4 / 72))));
  });

  it('las líneas cubren la hoja desde su origen y cada cinco hay una principal', () => {
    const g = gridLines(400, 300, 50);
    expect(g.xs.map((l) => l.at)).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400]);
    expect(g.ys.map((l) => l.at)).toEqual([0, 50, 100, 150, 200, 250, 300]);
    expect(g.xs.filter((l) => l.major).map((l) => l.at)).toEqual([0, 250]);
    expect(GRID_MAJOR_EVERY).toBe(5);
    expect(gridLines(400, 300, 0)).toEqual({ xs: [], ys: [] });
  });

  it('una hoja enorme con un paso diminuto no genera más de 600 líneas por eje', () => {
    const g = gridLines(21600, 14400, 1);
    expect(g.xs.length).toBeLessThanOrEqual(601);
    expect(g.ys.length).toBeLessThanOrEqual(601);
    expect(g.xs.length).toBeGreaterThan(10);
  });

  it('el ajuste lleva el punto a la intersección más cercana sin salirse de la hoja', () => {
    const dims = { width: 400, height: 300 };
    const p = snapToGrid({ x: 123 / 400, y: 74 / 300 }, 50, dims);
    expect(p.x * 400).toBeCloseTo(100, 9);
    expect(p.y * 300).toBeCloseTo(50, 9);
    // En el borde con paso 70: x=400 iría a 420 (fuera de la hoja) y se queda en el borde; y=300 va a 280
    const edge = snapToGrid({ x: 1, y: 1 }, 70, dims);
    expect(edge.x).toBe(1);
    expect(edge.y * 300).toBeCloseTo(280, 9);
    expect(snapToGrid({ x: 0.2, y: 0.2 }, 0, dims)).toEqual({ x: 0.2, y: 0.2 });
  });
});
