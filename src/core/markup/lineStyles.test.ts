import { describe, it, expect } from 'vitest';
import { dashArrayFor, lineStyleOf } from './lineStyles';
import { lineEndingShape, lineEndingSize, endpointAngles, shapeExtent } from './lineEndings';

describe('Tipos de línea (ADR-0018)', () => {
  it('los patrones son proporcionales al grosor y continua no tiene patrón', () => {
    expect(dashArrayFor('solid', 2)).toBeUndefined();
    expect(dashArrayFor('dashed', 1)).toEqual([4, 3]);
    expect(dashArrayFor('dashed', 2)).toEqual([8, 6]);
    expect(dashArrayFor('dotted', 2)).toEqual([2, 4]);
    expect(dashArrayFor('dashDot', 1)).toEqual([6, 2.5, 1, 2.5]);
  });

  it('nunca produce NaN ni ceros con grosores inválidos', () => {
    for (const w of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = dashArrayFor('dashed', w)!;
      expect(d.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
  });

  it('clasifica patrones propios y antiguos para la interfaz', () => {
    expect(lineStyleOf(undefined)).toBe('solid');
    expect(lineStyleOf([6, 4])).toBe('dashed'); // patrón antiguo del inspector
    for (const id of ['dashed', 'dotted', 'dashDot'] as const) {
      expect(lineStyleOf(dashArrayFor(id, 3))).toBe(id);
    }
  });
});

describe('Geometría de extremos de línea (ADR-0018)', () => {
  const tip = { x: 100, y: 50 };

  it('la flecha cerrada apunta en la dirección de la línea y está rellena', () => {
    // Línea horizontal que llega por la izquierda: la flecha queda detrás de la punta (x menores)
    const shape = lineEndingShape(tip, 0, 'closedArrow', 10)!;
    expect(shape.kind).toBe('polygon');
    expect(shape.filled).toBe(true);
    if (shape.kind !== 'circle') {
      expect(shape.points[1]).toEqual(tip);
      expect(shape.points[0].x).toBeLessThan(tip.x);
      expect(shape.points[2].x).toBeLessThan(tip.x);
      expect(shape.points[0].y).not.toBeCloseTo(shape.points[2].y, 5); // alas simétricas a ambos lados
      expect(Math.hypot(shape.points[0].x - tip.x, shape.points[0].y - tip.y)).toBeCloseTo(10, 10);
    }
  });

  it('la flecha abierta es un trazo sin relleno; ninguno no dibuja nada', () => {
    expect(lineEndingShape(tip, 0, 'openArrow', 10)).toMatchObject({ kind: 'polyline', filled: false });
    expect(lineEndingShape(tip, 0, 'none', 10)).toBeNull();
    expect(lineEndingShape(tip, Number.NaN, 'openArrow', 10)).toBeNull();
  });

  it('círculo, cuadrado y rombo se centran en la punta', () => {
    const circle = lineEndingShape(tip, 0, 'circle', 9)!;
    expect(circle).toMatchObject({ kind: 'circle', cx: 100, cy: 50, r: 3 });
    for (const ending of ['square', 'diamond'] as const) {
      const s = lineEndingShape(tip, 0.3, ending, 13)!;
      const ext = shapeExtent(s);
      const cx = ext.reduce((a, p) => a + p.x, 0) / ext.length;
      const cy = ext.reduce((a, p) => a + p.y, 0) / ext.length;
      expect(cx).toBeCloseTo(100, 8);
      expect(cy).toBeCloseTo(50, 8);
    }
  });

  it('el tamaño crece con el grosor y tiene un mínimo legible', () => {
    // Proporciones de Acrobat (ADR-0032): 9 pt con 1 pt de grosor
    expect(lineEndingSize(1)).toBe(9);
    expect(lineEndingSize(4)).toBe(21);
    expect(lineEndingSize(Number.NaN)).toBe(9);
  });

  it('calcula el ángulo de llegada a cada extremo de una polilínea', () => {
    const a = endpointAngles([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])!;
    expect(a.start).toBeCloseTo(Math.PI, 10); // el inicio "llega" desde la derecha
    expect(a.end).toBeCloseTo(Math.PI / 2, 10); // el final llega hacia +y
    expect(endpointAngles([{ x: 0, y: 0 }])).toBeNull();
  });
});
