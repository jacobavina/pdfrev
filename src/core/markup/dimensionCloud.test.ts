import { describe, it, expect } from 'vitest';
import {
  dimensionGeometry,
  dimensionTextBaseline,
  defaultDimensionLinePoint,
  dimensionSegmentsNormalized,
} from './dimension';
import { controlPointsOf, applyControlPointDrag } from './controlPoints';
import { revisionCloudPath, cloudOutline, cloudParams } from './revisionCloud';
import { lineEndingShape } from './lineEndings';
import { Markup, MarkupType } from '../../types/markup';

const mk = (type: MarkupType, points: { x: number; y: number }[]): Markup => ({
  id: `m-${type}`,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Revisor',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
});

describe('Cota: geometría (ADR-0020)', () => {
  it('trazada de izquierda a derecha, la línea de cota queda por encima; de derecha a izquierda, por debajo', () => {
    const above = defaultDimensionLinePoint({ x: 0, y: 100 }, { x: 200, y: 100 }, 15);
    expect(above).toEqual({ x: 100, y: 85 });
    const below = defaultDimensionLinePoint({ x: 200, y: 100 }, { x: 0, y: 100 }, 15);
    expect(below).toEqual({ x: 100, y: 115 });
  });

  it('línea de cota paralela con desfase, líneas de referencia que sobresalen y texto legible', () => {
    const g = dimensionGeometry({ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 70 })!;
    expect(g.offset).toBeCloseTo(30);
    expect(g.dimStart).toEqual({ x: 0, y: 70 });
    expect(g.dimEnd).toEqual({ x: 200, y: 70 });
    // Referencias: desde 2 pt fuera del punto hasta 4 pt más allá de la línea de cota
    expect(g.extensions[0][0].y).toBeCloseTo(98);
    expect(g.extensions[0][1].y).toBeCloseTo(66);
    // Cota trazada hacia la izquierda: el texto no queda cabeza abajo
    const rev = dimensionGeometry({ x: 200, y: 100 }, { x: 0, y: 100 }, { x: 50, y: 130 })!;
    expect(Math.abs(rev.textAngle)).toBeLessThan(1e-9);
  });

  it('el texto nunca tapa la línea: si la cota queda bajo los puntos, la base baja una altura de mayúscula', () => {
    const aboveGeom = dimensionGeometry({ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 0, y: 70 })!;
    expect(dimensionTextBaseline(aboveGeom, 10, false)).toEqual(aboveGeom.textAnchor);
    const belowGeom = dimensionGeometry({ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 0, y: 130 })!;
    expect(dimensionTextBaseline(belowGeom, 10, false).y).toBeCloseTo(belowGeom.textAnchor.y + 7.2);
  });

  it('segmentos en coordenadas normalizadas para seleccionar la cota por su línea', () => {
    const segs = dimensionSegmentsNormalized(
      [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.3, y: 0.45 }],
      { width: 800, height: 600 }
    );
    expect(segs).toHaveLength(3);
    expect(segs[0][0].y).toBeCloseTo(0.45);
    expect(segs[0][1].x).toBeCloseTo(0.5);
  });
});

describe('Extremos de cota: trazo perpendicular y barra (ADR-0020)', () => {
  it('el trazo es perpendicular a la línea y la barra se refleja entre pantalla y PDF', () => {
    const butt = lineEndingShape({ x: 0, y: 0 }, 0, 'butt', 10)!;
    expect(butt.kind).toBe('polyline');
    if (butt.kind !== 'polyline') throw new Error();
    expect(butt.points[0].x).toBeCloseTo(0);
    expect(Math.abs(butt.points[0].y)).toBeCloseTo(5);
    const screen = lineEndingShape({ x: 0, y: 0 }, 0, 'slash', 10, false)!;
    const pdf = lineEndingShape({ x: 0, y: 0 }, 0, 'slash', 10, true)!;
    if (screen.kind !== 'polyline' || pdf.kind !== 'polyline') throw new Error();
    expect(screen.points[1].y).toBeCloseTo(-pdf.points[1].y);
  });
});

describe('Puntos de control (ADR-0021)', () => {
  it('una nube rectangular ofrece 4 vértices y al arrastrar uno se vuelve poligonal', () => {
    const cloud = mk('cloud', [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.5 }]);
    expect(controlPointsOf(cloud)).toHaveLength(4);
    const next = applyControlPointDrag(cloud, 2, { x: 0.8, y: 0.7 });
    expect(next).toEqual([
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.2 },
      { x: 0.8, y: 0.7 },
      { x: 0.2, y: 0.5 },
    ]);
  });

  it('un rectángulo se redimensiona con la esquina opuesta fija; una polilínea mueve solo su vértice', () => {
    const rect = mk('rectangle', [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.5 }]);
    expect(applyControlPointDrag(rect, 0, { x: 0.1, y: 0.1 })).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.5 },
    ]);
    const poly = mk('polyLine', [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.3 }, { x: 0.4, y: 0.1 }]);
    expect(applyControlPointDrag(poly, 1, { x: 0.25, y: 1.4 })[1]).toEqual({ x: 0.25, y: 1 });
    expect(controlPointsOf(mk('stickyNote', [{ x: 0.1, y: 0.1 }]))).toBeNull();
  });
});

describe('Nube de revisión estilo Revu (ADR-0021)', () => {
  const square = cloudOutline([{ x: 0, y: 0 }, { x: 100, y: 100 }]);

  it('un lóbulo por cada paso de cuerda, cada uno de 3 cúbicas, y trazado cerrado', () => {
    const d = revisionCloudPath(square, 20);
    expect(d.startsWith('M 0.00 0.00')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/C /g)).toHaveLength(4 * 5 * 3);
  });

  it('los lóbulos salen hacia fuera; con Invertir, hacia dentro', () => {
    const ys = (d: string) => (d.match(/-?\d+\.\d+/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);
    // Borde superior (y = 0): hacia fuera = y negativa
    expect(Math.min(...ys(revisionCloudPath(square, 20)))).toBeLessThan(-5);
    expect(Math.min(...ys(revisionCloudPath(square, 20, true)))).toBeGreaterThan(-1);
  });

  it('tamaño e inversión se leen de la marca', () => {
    expect(cloudParams({ arcStep: 30, cloudInvert: 1 }, 20)).toEqual({ step: 30, invert: true });
    expect(cloudParams(undefined, 20)).toEqual({ step: 20, invert: false });
  });
});
