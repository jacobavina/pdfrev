import { describe, it, expect } from 'vitest';
import { segmentsFromOperatorList, PathOps } from '../pdf/contentGeometry';
import { ContentSnapIndex } from './contentSnap';
import { snapPoint } from './snap';
import { remeasureMarkup } from '../measurements/remeasure';
import { Markup, PageCalibration } from '../../types/markup';

// Códigos ficticios: la función solo compara identidades
const OPS: PathOps = {
  save: 10,
  restore: 11,
  transform: 12,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  constructPath: 91,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
};
const CLIP = 29;
const END_PATH = 28;

// Viewport de PDF.js a escala 1 de una página de 800 × 600 pt sin girar: invierte el eje Y
const VIEW: [number, number, number, number, number, number] = [1, 0, 0, -1, 0, 600];

const list = (...items: [number, unknown][]) => ({
  fnArray: items.map(([f]) => f),
  argsArray: items.map(([, a]) => a),
});
const segs = (f: Float32Array) => Array.from(f).map((v) => Math.round(v * 10000) / 10000);

describe('Geometría del plano para Snap to Content (ADR-0031)', () => {
  it('líneas trazadas pasan a segmentos normalizados con el eje Y de la vista', () => {
    const out = segmentsFromOperatorList(
      list([OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [100, 500, 300, 500]]], [OPS.stroke, null]),
      OPS,
      VIEW,
      800,
      600
    );
    expect(segs(out)).toEqual([0.125, 0.1667, 0.375, 0.1667]);
  });

  it('rectángulo = 4 lados, closePath cierra el subtrazado y las curvas se aproximan por su cuerda', () => {
    const out = segmentsFromOperatorList(
      list(
        [OPS.constructPath, [[OPS.rectangle], [0, 0, 80, 60]]],
        [OPS.fill, null],
        [OPS.constructPath, [[OPS.moveTo, OPS.lineTo, OPS.lineTo, OPS.closePath], [0, 0, 400, 0, 400, 300]]],
        [OPS.stroke, null],
        [OPS.constructPath, [[OPS.moveTo, OPS.curveTo], [0, 0, 10, 10, 20, 10, 800, 600]]],
        [OPS.stroke, null]
      ),
      OPS,
      VIEW,
      800,
      600
    );
    expect(out.length / 4).toBe(4 + 3 + 1);
    // Último: la cuerda de la curva, de (0,0) a (800,600) en PDF = de abajo-izquierda a arriba-derecha
    expect(segs(out.slice(28))).toEqual([0, 1, 1, 0]);
  });

  it('los trazados de recorte (sin pintar) se descartan', () => {
    const out = segmentsFromOperatorList(
      list(
        [OPS.constructPath, [[OPS.rectangle], [0, 0, 800, 600]]],
        [CLIP, null],
        [END_PATH, null],
        [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [0, 0, 100, 0]]],
        [OPS.stroke, null]
      ),
      OPS,
      VIEW,
      800,
      600
    );
    expect(out.length).toBe(4);
  });

  it('respeta cm, save/restore y la matriz de los XObjects de formulario', () => {
    const line = [OPS.constructPath, [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]]] as [number, unknown];
    const out = segmentsFromOperatorList(
      list(
        [OPS.save, null],
        [OPS.transform, [2, 0, 0, 2, 100, 100]],
        line,
        [OPS.stroke, null],
        [OPS.restore, null],
        [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 400, 0], [0, 0, 10, 10]]],
        line,
        [OPS.stroke, null],
        [OPS.paintFormXObjectEnd, null],
        line,
        [OPS.stroke, null]
      ),
      OPS,
      [1, 0, 0, 1, 0, 0],
      800,
      600
    );
    expect(segs(out)).toEqual([
      0.125, 0.1667, 0.15, 0.1667, // escalado ×2 y desplazado
      0.5, 0, 0.5125, 0, // dentro del formulario, desplazado 400
      0, 0, 0.0125, 0, // de vuelta a la identidad
    ]);
  });

  it('límite de segmentos por página', () => {
    const coords: number[] = [];
    const opsList: number[] = [];
    for (let i = 0; i < 50; i++) {
      opsList.push(OPS.moveTo, OPS.lineTo);
      coords.push(i, 0, i, 10);
    }
    const out = segmentsFromOperatorList(list([OPS.constructPath, [opsList, coords]], [OPS.stroke, null]), OPS, VIEW, 800, 600, 20);
    expect(out.length / 4).toBe(20);
  });
});

describe('Índice y snap al plano (ADR-0031)', () => {
  // Cuadrícula: verticales en x = 0.25, 0.5, 0.75 y horizontales en y = 0.25, 0.5
  const grid = new Float32Array([
    0.25, 0, 0.25, 1, 0.5, 0, 0.5, 1, 0.75, 0, 0.75, 1, 0, 0.25, 1, 0.25, 0, 0.5, 1, 0.5,
  ]);
  const index = new ContentSnapIndex(grid, 16);
  const page = { width: 800, height: 600 };

  it('near devuelve solo los segmentos de las celdas cercanas, sin repetir', () => {
    const near = index.near({ x: 0.26, y: 0.9 }, 0.01, 0.01);
    expect(near).toHaveLength(1);
    expect(near[0][0].x).toBeCloseTo(0.25, 6);
    expect(index.near({ x: 0.25, y: 0.25 }, 0.01, 0.01)).toHaveLength(2);
    expect(index.size).toBe(5);
  });

  it('el snap se engancha a la intersección de dos líneas del plano, no solo a las marcas', () => {
    const r = snapPoint({ x: 0.5 + 3 / 800, y: 0.25 + 2 / 600 }, [], page, {
      endpoint: true,
      midpoint: true,
      nearest: false,
      intersection: true,
      content: true,
    }, 8, index);
    expect(r?.kind).toBe('intersection');
    expect(r!.point.x).toBeCloseTo(0.5, 6);
    expect(r!.point.y).toBeCloseTo(0.25, 6);
  });

  it('extremos del plano, y sin "Snap to drawing" el plano se ignora', () => {
    const near = { x: 0.25 + 4 / 800, y: 1 - 3 / 600 };
    const modes = { endpoint: true, midpoint: false, nearest: false, intersection: false, content: true };
    const r = snapPoint(near, [], page, modes, 8, index);
    expect(r?.kind).toBe('endpoint');
    expect(r!.point.y).toBeCloseTo(1, 6);
    expect(snapPoint(near, [], page, { ...modes, content: false }, 8, index)).toBeNull();
  });
});

describe('Recalcular mediciones (ADR-0031)', () => {
  const mm: PageCalibration = { scale: 25.4 / 72, unit: 'mm', precision: 1 };
  const ft: PageCalibration = { scale: 0.7, unit: 'ft', precision: 2, format: 'ftin', fractionDenominator: 16 };
  const len: Markup = {
    id: 'l',
    type: 'length',
    pageIndex: 0,
    points: [
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.25 },
    ],
    style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
    author: 'A',
    createdAt: '',
    updatedAt: '',
    status: 'pending',
    measurement: { value: 70.56, unit: 'mm', formatted: '70.6 mm' },
    text: '70.6 mm',
  };

  it('con otra escala, el valor y su texto se recalculan', () => {
    const next = remeasureMarkup(len, len.points, { width: 800, height: 600 }, ft, mm);
    expect(next.measurement!.value).toBeCloseTo(140, 9);
    expect(next.text).toBe(next.measurement!.formatted);
    expect(next.text).toBe("140'-0\"");
  });

  it('un comentario escrito por el usuario no se pisa', () => {
    const next = remeasureMarkup({ ...len, text: 'Muro norte' }, len.points, { width: 800, height: 600 }, ft, mm);
    expect(next.measurement!.value).toBeCloseTo(140, 9);
    expect(next.text).toBe('Muro norte');
  });
});
