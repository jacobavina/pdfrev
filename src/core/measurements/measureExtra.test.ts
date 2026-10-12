import { describe, it, expect } from 'vitest';
import { calculatePerimeter, calculateVolume, calculateAngle, rescaleVolumeDepth, PageDimensionsPt } from './calculate';
import { niceStep, rulerTicks } from './rulers';
import { computeMeasureTotals, measureCategoryOf } from './totals';
import { controlPointsOf } from '../markup/controlPoints';
import { snapPoint } from '../markup/snap';
import { Markup, MarkupType, PageCalibration } from '../../types/markup';

const page: PageDimensionsPt = { width: 800, height: 600 };
const cal: PageCalibration = { scale: 0.01, unit: 'm', precision: 2 }; // 1 pt = 1 cm
// Rectángulo de 400 x 300 pt = 4 x 3 m
const rect = [
  { x: 0.25, y: 0.25 },
  { x: 0.75, y: 0.25 },
  { x: 0.75, y: 0.75 },
  { x: 0.25, y: 0.75 },
];

const mk = (id: string, type: MarkupType, points: Markup['points'], value?: number): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
  ...(value !== undefined ? { measurement: { value, unit: 'm', formatted: `${value}` } } : {}),
});

describe('Mediciones adicionales (ADR-0029)', () => {
  it('Perimeter: contorno cerrado (incluye el lado de cierre) en la unidad de la escala', () => {
    const m = calculatePerimeter(rect, page, cal);
    expect(m.value).toBeCloseTo(14, 6);
    expect(m.formatted).toBe('14.00 m');
  });

  it('Volume: área por profundidad, con ³; profundidad inválida da 0', () => {
    const m = calculateVolume(rect, page, cal, 2.5);
    expect(m.value).toBeCloseTo(30, 6);
    expect(m.formatted).toBe('30.00 m³');
    expect(calculateVolume(rect, page, cal, -1).value).toBe(0);
  });

  it('Angle: ángulo en el vértice central sobre la geometría real (respeta la escala Y separada)', () => {
    const right = [
      { x: 0.75, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.25 },
    ];
    expect(calculateAngle(right, page, cal).formatted).toBe('90.0°');
    // 45° en papel: 100 pt a la derecha y 100 pt arriba
    const diag = [
      { x: 0.625, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.625, y: 0.5 - 100 / 600 },
    ];
    expect(calculateAngle(diag, page, cal).value).toBeCloseTo(45, 6);
    // Con escala vertical doble el lado vertical mide el doble: atan(2) = 63.43°
    expect(calculateAngle(diag, page, { ...cal, scaleY: 0.02 }).value).toBeCloseTo(63.4349, 3);
    expect(calculateAngle(diag.slice(0, 2), page, cal).value).toBe(0);
  });

  it('rescaleVolumeDepth: cambiar la profundidad escala el volumen sin recalcular el área', () => {
    const v = calculateVolume(rect, page, cal, 2);
    const r = rescaleVolumeDepth(v, 2, 3, 2)!;
    expect(r.value).toBeCloseTo(36, 6);
    expect(r.formatted).toBe('36.00 m³');
    expect(rescaleVolumeDepth(v, 0, 3)).toBeNull();
    expect(rescaleVolumeDepth(v, 2, 0)).toBeNull();
  });

  it('totales: perímetro suma como longitud, volumen va aparte y ángulo/radio/diámetro no se suman', () => {
    expect(measureCategoryOf(mk('p', 'perimeter', rect, 1))).toBe('length');
    expect(measureCategoryOf(mk('v', 'volume', rect, 1))).toBe('volume');
    for (const t of ['angle', 'radius', 'diameter'] as const) expect(measureCategoryOf(mk(t, t, rect, 1))).toBe('other');
    const totals = computeMeasureTotals([
      mk('p', 'perimeter', rect, 14),
      mk('l', 'length', rect.slice(0, 2), 4),
      mk('v', 'volume', rect, 30),
      mk('a', 'angle', rect.slice(0, 3), 90),
    ]);
    const byCat = Object.fromEntries(totals.map((t) => [t.category, t]));
    expect(byCat.length.total).toBeCloseTo(18, 6);
    expect(byCat.volume.total).toBeCloseTo(30, 6);
    expect(totals.map((t) => t.category)).toEqual(['length', 'volume']);
  });

  it('puntos de control y snap en las mediciones nuevas', () => {
    expect(controlPointsOf(mk('p', 'perimeter', rect))).toHaveLength(4);
    expect(controlPointsOf(mk('a', 'angle', rect.slice(0, 3)))).toHaveLength(3);
    expect(controlPointsOf(mk('r', 'radius', rect.slice(0, 2)))).toHaveLength(2);
    const snapped = snapPoint({ x: 0.252, y: 0.748 }, [mk('v', 'volume', rect)], { width: 800, height: 600 }, {
      endpoint: true,
      midpoint: false,
      nearest: false,
    });
    expect(snapped?.point).toEqual({ x: 0.25, y: 0.75 });
  });
});

describe('Reglas (ADR-0029)', () => {
  it('niceStep redondea a 1, 2 o 5 × 10^k', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(13)).toBe(20);
    expect(niceStep(31)).toBe(50);
    expect(niceStep(0.0042)).toBeCloseTo(0.005, 12);
    expect(niceStep(100)).toBe(100);
  });

  it('marcas: el cero cae en el borde de la hoja, principales con número y subdivisiones', () => {
    // 1 px = 0.5 mm; principales cada ≥64 px → paso 50 mm (100 px), 5 subdivisiones de 20 px
    const ticks = rulerTicks({ originPx: 40, lengthPx: 400, unitsPerPx: 0.5 });
    const majors = ticks.filter((t) => t.major);
    expect(majors.map((t) => t.label)).toEqual(['0', '50', '100', '150']);
    expect(majors[0].pos).toBeCloseTo(40, 9);
    expect(majors[1].pos).toBeCloseTo(140, 9);
    expect(ticks[0].pos).toBeCloseTo(0, 9); // la primera subdivisión, a la izquierda del cero
    expect(ticks.filter((t) => !t.major).every((t) => t.label === undefined)).toBe(true);
  });

  it('marcas negativas fuera de la hoja y decimales cuando el paso es fraccionario', () => {
    const ticks = rulerTicks({ originPx: 300, lengthPx: 200, unitsPerPx: 0.002 });
    const labels = ticks.filter((t) => t.major).map((t) => t.label);
    expect(labels).toEqual(['-0.6', '-0.4', '-0.2']);
  });

  it('entradas inválidas no producen marcas', () => {
    expect(rulerTicks({ originPx: 0, lengthPx: 0, unitsPerPx: 1 })).toEqual([]);
    expect(rulerTicks({ originPx: 0, lengthPx: 100, unitsPerPx: 0 })).toEqual([]);
    expect(rulerTicks({ originPx: NaN, lengthPx: 100, unitsPerPx: 1 })).toEqual([]);
  });
});
