import { describe, it, expect } from 'vitest';
import {
  scaleFromRatio,
  parseFeetInches,
  formatFeetInches,
  formatWithCalibration,
  buildCalibration,
  BUILT_IN_SCALE_PRESETS,
  describeCalibration,
} from './scale';
import { calculateLength, calculateArea } from './calculate';

describe('Escalas de medición (ADR-0025)', () => {
  it('1:100 en mm: 1 mm de papel = 100 mm reales; mostrado en m', () => {
    const s = scaleFromRatio(1, 'mm', 100, 'mm', 'm');
    // 1 mm de papel = 72/25.4 pt → 0.1 m
    expect(s).toBeCloseTo(0.1 / (72 / 25.4), 10);
  });

  it('1/4" = 1\'-0": una línea de 1 pulgada de papel mide 4 pies', () => {
    const cal = buildCalibration({
      paperValue: 0.25,
      paperUnit: 'in',
      realValue: 1,
      realUnit: 'ftin',
      display: 'ftin',
      precision: 'f16',
    })!;
    // 1 in = 72 pt sobre una página de 720 pt de ancho → 0.1 normalizado
    const m = calculateLength([{ x: 0, y: 0 }, { x: 0.1, y: 0 }], { width: 720, height: 720 }, cal);
    expect(m.value).toBeCloseTo(4, 10);
    expect(m.formatted).toBe(`4'-0"`);
  });

  it('pies-pulgadas: lectura y escritura con fracciones', () => {
    expect(parseFeetInches(`12'-6 1/2"`)).toBeCloseTo(12 + 6.5 / 12, 10);
    expect(parseFeetInches(`1'-0"`)).toBe(1);
    expect(parseFeetInches(`6"`)).toBe(0.5);
    expect(parseFeetInches('2.5')).toBe(2.5);
    expect(parseFeetInches('abc')).toBeNaN();
    expect(formatFeetInches(12 + 6.5 / 12, 16)).toBe(`12'-6 1/2"`);
    expect(formatFeetInches(0.999, 2)).toBe(`1'-0"`);
  });

  it('precisión decimal y fraccionaria en pulgadas', () => {
    expect(formatWithCalibration(3.14159, { scale: 1, unit: 'm', precision: 3 })).toBe('3.142 m');
    expect(formatWithCalibration(6.4, { scale: 1, unit: 'in', format: 'fraction', fractionDenominator: 4 })).toBe('6 1/2"');
    expect(formatWithCalibration(12, { scale: 1, unit: 'ft', format: 'ftin' }, true)).toBe('12.00 ft²');
  });

  it('escala Y separada: el área usa ambas escalas', () => {
    const cal = buildCalibration({
      paperValue: 1,
      paperUnit: 'pt',
      realValue: 2,
      realUnit: 'm',
      display: 'm',
      precision: 'd2',
      y: { paperValue: 1, paperUnit: 'pt', realValue: 3, realUnit: 'm' },
    })!;
    expect(cal.scaleY).toBeCloseTo(3, 10);
    const a = calculateArea([{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }], { width: 100, height: 100 }, cal, true);
    // 10 pt × 2 = 20 m de ancho; 10 pt × 3 = 30 m de alto
    expect(a.value).toBeCloseTo(600, 10);
  });

  it('presets incluidos y descripción para la barra de estado', () => {
    expect(BUILT_IN_SCALE_PRESETS.map((p) => p.label)).toEqual(
      expect.arrayContaining(['1:100', `1/4" = 1'-0"`, `1" = 20'`])
    );
    const cal = buildCalibration({
      paperValue: 1,
      paperUnit: 'mm',
      realValue: 50,
      realUnit: 'mm',
      display: 'm',
      precision: 'd2',
      presetId: 'm-1-50',
    })!;
    expect(describeCalibration(cal)).toBe('1:50');
    expect(buildCalibration({ paperValue: 0, paperUnit: 'mm', realValue: 1, realUnit: 'm', display: 'm', precision: 'd2' })).toBeNull();
  });
});
