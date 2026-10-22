import { describe, it, expect } from 'vitest';
import type { Markup, PageCalibration } from '../../types/markup';
import { canOffset, multiplyMarkups, offsetMarkups, offsetPath } from './copyTools';

const dims = { width: 600, height: 400 };
const MM: PageCalibration = { scale: 1, unit: 'mm' }; // 1 mm por punto, para contar fácil
const calibFor = () => MM;

const base = (over: Partial<Markup>): Markup =>
  ({
    id: 'a',
    type: 'rectangle',
    pageIndex: 0,
    points: [],
    style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    createdAt: '',
    updatedAt: '',
    ...over,
  }) as Markup;

const px = (m: Markup) => m.points.map((p) => [Math.round(p.x * dims.width * 1000) / 1000, Math.round(p.y * dims.height * 1000) / 1000]);

describe('Multiply (ADR-0107)', () => {
  const box = base({ id: 'r', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }); // 60×40 pt

  it('repite el bloque en filas y columnas con el espacio indicado entre bordes', () => {
    const { created, skipped } = multiplyMarkups([box], { rows: 2, columns: 3, gapX: 10, gapY: 20 }, MM, dims);
    expect(skipped).toBe(0);
    expect(created).toHaveLength(5);
    // Paso en x = 60 + 10 = 70 pt; en y = 40 + 20 = 60 pt
    const origins = created.map((m) => px(m)[0]);
    expect(origins).toEqual([
      [130, 40],
      [200, 40],
      [60, 100],
      [130, 100],
      [200, 100],
    ]);
    expect(new Set(created.map((m) => m.id)).size).toBe(5);
    expect(created.every((m) => m.id !== 'r')).toBe(true);
  });

  it('las celdas que se saldrían de la hoja se omiten y se cuentan', () => {
    const { created, skipped } = multiplyMarkups([box], { rows: 1, columns: 20, gapX: 0, gapY: 0 }, MM, dims);
    // La hoja mide 600 pt y cada celda 60: caben 9 más aparte de la original (x desde 60)
    expect(created).toHaveLength(8);
    expect(skipped).toBe(11);
  });

  it('un grupo se copia como grupo nuevo por celda y el espacio usa la escala de la página', () => {
    const a = base({ id: 'a', groupId: 'g', points: [{ x: 0.1, y: 0.1 }, { x: 0.15, y: 0.15 }] });
    const b = base({ id: 'b', groupId: 'g', points: [{ x: 0.2, y: 0.1 }, { x: 0.25, y: 0.15 }] });
    const { created } = multiplyMarkups([a, b], { rows: 1, columns: 3, gapX: 0.5, gapY: 0 }, { scale: 0.5, unit: 'm' }, dims);
    expect(created).toHaveLength(4);
    const groups = created.map((m) => m.groupId);
    expect(groups[0]).toBe(groups[1]);
    expect(groups[2]).toBe(groups[3]);
    expect(groups[0]).not.toBe(groups[2]);
    expect(groups[0]).not.toBe('g');
    // Bloque de 0.1..0.25 → 90 pt de ancho; hueco de 0.5 m a 0.5 m/pt = 1 pt
    expect(px(created[0])[0][0]).toBeCloseTo(60 + 91, 6);
  });

  it('rechaza una cuadrícula de más de 400 celdas', () => {
    const r = multiplyMarkups([box], { rows: 21, columns: 20, gapX: 0, gapY: 0 }, MM, dims);
    expect(r.created).toHaveLength(0);
    expect(r.reason).toMatch(/400/);
  });
});

describe('Offset (ADR-0107)', () => {
  it('un trazado abierto se desplaza a la izquierda o a la derecha del sentido de dibujo', () => {
    const left = offsetPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, false);
    expect(left).toEqual([{ x: 0, y: -10 }, { x: 100, y: -10 }]); // izquierda de ir hacia la derecha = arriba
    const right = offsetPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], -10, false);
    expect(right).toEqual([{ x: 0, y: 10 }, { x: 100, y: 10 }]);
  });

  it('las esquinas se resuelven con inglete', () => {
    const out = offsetPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], -10, false);
    expect(out[0]).toEqual({ x: 0, y: 10 });
    expect(out[1].x).toBeCloseTo(90, 9);
    expect(out[1].y).toBeCloseTo(10, 9);
    expect(out[2].x).toBeCloseTo(90, 9);
  });

  it('Line: la copia queda a la distancia en unidades de la escala y su medida se recalcula', () => {
    const line = base({
      id: 'l',
      type: 'length',
      points: [{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }],
      measurement: { value: 180, unit: 'mm', formatted: '180.00 mm' },
    });
    const { created } = offsetMarkups([line], { distance: 25, side: 'left' }, calibFor, dims);
    expect(created).toHaveLength(1);
    expect(px(created[0])).toEqual([[60, 175], [240, 175]]);
    expect(created[0].measurement!.value).toBeCloseTo(180, 6);
    expect(created[0].id).not.toBe('l');
  });

  it('una forma cerrada crece hacia fuera con "left" sin importar el sentido en que se dibujó', () => {
    const cw = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }];
    const ccw = [...cw].reverse();
    for (const pts of [cw, ccw]) {
      const poly = base({ id: 'p', type: 'polygon', points: pts });
      const { created } = offsetMarkups([poly], { distance: 10, side: 'left' }, calibFor, dims);
      const xs = created[0].points.map((p) => p.x * dims.width);
      const ys = created[0].points.map((p) => p.y * dims.height);
      expect(Math.min(...xs)).toBeCloseTo(50, 6);
      expect(Math.max(...xs)).toBeCloseTo(190, 6);
      expect(Math.min(...ys)).toBeCloseTo(30, 6);
      expect(Math.max(...ys)).toBeCloseTo(130, 6);
      const inner = offsetMarkups([poly], { distance: 10, side: 'right' }, calibFor, dims).created[0];
      expect(Math.min(...inner.points.map((p) => p.x * dims.width))).toBeCloseTo(70, 6);
    }
  });

  it('Area: la copia hacia fuera mide más y la medida sale del contorno nuevo', () => {
    const area = base({
      id: 'ar',
      type: 'area',
      points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }],
      measurement: { value: 120 * 80, unit: 'mm', formatted: '9600.00 mm²', perimeter: 400 },
    });
    const { created } = offsetMarkups([area], { distance: 10, side: 'left' }, calibFor, dims);
    expect(created[0].measurement!.value).toBeCloseTo(140 * 100, 4);
  });

  it('un rectángulo crece o se encoge por los cuatro lados y uno que se invertiría se omite', () => {
    const r = base({ id: 'r', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] });
    expect(px(offsetMarkups([r], { distance: 5, side: 'left' }, calibFor, dims).created[0])).toEqual([[55, 35], [125, 85]]);
    expect(px(offsetMarkups([r], { distance: 5, side: 'right' }, calibFor, dims).created[0])).toEqual([[65, 45], [115, 75]]);
    const none = offsetMarkups([r], { distance: 40, side: 'right' }, calibFor, dims);
    expect(none.created).toHaveLength(0);
    expect(none.skipped).toBe(1);
  });

  it('las marcas que Offset no sabe desplazar se omiten y una distancia no positiva se rechaza', () => {
    const note = base({ id: 'n', type: 'stickyNote', points: [{ x: 0.5, y: 0.5 }] });
    expect(canOffset(note)).toBe(false);
    const r = offsetMarkups([note], { distance: 5, side: 'left' }, calibFor, dims);
    expect(r).toMatchObject({ created: [], skipped: 1 });
    expect(offsetMarkups([note], { distance: 0, side: 'left' }, calibFor, dims).reason).toMatch(/greater than zero/);
  });
});
