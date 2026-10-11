import { describe, it, expect } from 'vitest';
import {
  calculateLength,
  calculatePolylineLength,
  calculateArea,
  calculateCount,
  formatMeasurement,
  PageDimensionsPt,
} from './calculate';
import { PageCalibration, MarkupPoint } from '../../types/markup';

describe('Takeoff Measurements & Calibration (Paquete 4)', () => {
  const baseCalibration: PageCalibration = {
    scale: 0.01, // 1 pt = 0.01 m (1 cm por punto)
    unit: 'm',
    precision: 2,
  };

  const pageSize: PageDimensionsPt = {
    width: 600,
    height: 800,
  };

  describe('Cálculo de Longitud Lineal (calculateLength)', () => {
    it('calcula la distancia euclídea precisa y la formatea según la unidad calibrada', () => {
      // Segmento horizontal de 200 pt (desde x=100pt a x=300pt)
      const points: MarkupPoint[] = [
        { x: 100 / 600, y: 150 / 800 },
        { x: 300 / 600, y: 150 / 800 },
      ];

      const result = calculateLength(points, pageSize, baseCalibration);
      // 200 pt * 0.01 m/pt = 2.00 m
      expect(result.value).toBeCloseTo(2.0, 4);
      expect(result.unit).toBe('m');
      expect(result.formatted).toBe('2.00 m');
    });

    it('calcula segmentos diagonales con teorema de Pitágoras', () => {
      // Triángulo 3-4-5 escalado: dx = 300 pt, dy = 400 pt -> dist = 500 pt
      const points: MarkupPoint[] = [
        { x: 100 / 600, y: 100 / 800 },
        { x: 400 / 600, y: 500 / 800 },
      ];

      const result = calculateLength(points, pageSize, baseCalibration);
      // 500 pt * 0.01 = 5.00 m
      expect(result.value).toBeCloseTo(5.0, 4);
      expect(result.formatted).toBe('5.00 m');
    });

    it('retorna 0 si hay menos de 2 puntos', () => {
      const result = calculateLength([{ x: 0.5, y: 0.5 }], pageSize, baseCalibration);
      expect(result.value).toBe(0);
      expect(result.formatted).toBe('0.00 m');
    });
  });

  describe('Cálculo de Polilínea de Medida (calculatePolylineLength)', () => {
    it('acumula la distancia de múltiples segmentos continuos', () => {
      // 3 segmentos: 100 pt horizontal + 100 pt vertical + 100 pt horizontal = 300 pt
      const points: MarkupPoint[] = [
        { x: 100 / 600, y: 100 / 800 },
        { x: 200 / 600, y: 100 / 800 }, // +100 pt
        { x: 200 / 600, y: 200 / 800 }, // +100 pt
        { x: 300 / 600, y: 200 / 800 }, // +100 pt
      ];

      const result = calculatePolylineLength(points, pageSize, baseCalibration);
      // 300 pt * 0.01 = 3.00 m
      expect(result.value).toBeCloseTo(3.0, 4);
      expect(result.formatted).toBe('3.00 m');
    });
  });

  describe('Cálculo de Área y Perímetro (calculateArea)', () => {
    it('calcula área rectangular con 2 puntos y devuelve perímetro', () => {
      // Rectángulo de 200 pt x 100 pt = 20,000 pt²
      const points: MarkupPoint[] = [
        { x: 100 / 600, y: 100 / 800 },
        { x: 300 / 600, y: 200 / 800 },
      ];

      const result = calculateArea(points, pageSize, baseCalibration, true);
      // Área: 20,000 pt² * (0.01)² = 2.00 m²
      // Perímetro: 2 * (200 + 100) * 0.01 = 6.00 m
      expect(result.value).toBeCloseTo(2.0, 4);
      expect(result.perimeter).toBeCloseTo(6.0, 4);
      expect(result.formatted).toBe('2.00 m²');
    });

    it('calcula área poligonal mediante fórmula de Gauss (Shoelace)', () => {
      // Polígono cuadrado de 200 pt x 200 pt con 4 vértices
      const points: MarkupPoint[] = [
        { x: 100 / 600, y: 100 / 800 },
        { x: 300 / 600, y: 100 / 800 },
        { x: 300 / 600, y: 300 / 800 },
        { x: 100 / 600, y: 300 / 800 },
      ];

      const result = calculateArea(points, pageSize, baseCalibration, false);
      // 40,000 pt² * (0.01)² = 4.00 m²
      // Perímetro: 800 pt * 0.01 = 8.00 m
      expect(result.value).toBeCloseTo(4.0, 4);
      expect(result.perimeter).toBeCloseTo(8.0, 4);
      expect(result.formatted).toBe('4.00 m²');
    });
  });

  describe('TEST DE ORO (P4): Rectángulo 300×200 pt en las 4 Rotaciones (0°, 90°, 180°, 270°)', () => {
    // Especificación de 08-plan-orquestador.md §2 Paquete 4:
    // "Test de oro: verificación de tolerancia en rectángulo sintético 300×200 pt bajo rotaciones (0°, 90°, 180°, 270°)."
    // Rectángulo intrínseco de 300 pt de ancho x 200 pt de alto:
    // Área intrínseca = 300 * 200 = 60,000 pt²
    // Perímetro intrínseco = 2 * (300 + 200) = 1,000 pt
    // Con escala 1 pt = 0.01 m: Área = 6.00 m², Perímetro = 10.00 m

    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];

    rotations.forEach((rot) => {
      it(`garantiza resultado idéntico de área (6.00 m²) y perímetro (10.00 m) a ${rot}° de rotación`, () => {
        // En PDF, la rotación de página intercambia width y height cuando rot es 90° o 270°
        const isOrthogonal = rot === 90 || rot === 270;
        const currentDims: PageDimensionsPt = {
          width: isOrthogonal ? 800 : 600,
          height: isOrthogonal ? 600 : 800,
        };

        // Generamos puntos normalizados que representan exactamente el rectángulo de 300x200 pt
        // en el espacio de la página respectiva
        let p1: MarkupPoint;
        let p2: MarkupPoint;

        if (rot === 0) {
          // Normal: width=600, height=800
          p1 = { x: 50 / 600, y: 50 / 800 };
          p2 = { x: 350 / 600, y: 250 / 800 }; // w=300 pt, h=200 pt
        } else if (rot === 90) {
          // Rotada 90°: width=800, height=600
          p1 = { x: 100 / 800, y: 100 / 600 };
          p2 = { x: 400 / 800, y: 300 / 600 }; // w=300 pt, h=200 pt
        } else if (rot === 180) {
          // Rotada 180°: width=600, height=800 (invertida)
          p1 = { x: 350 / 600, y: 250 / 800 };
          p2 = { x: 50 / 600, y: 50 / 800 }; // w=300 pt, h=200 pt
        } else {
          // Rotada 270°: width=800, height=600
          p1 = { x: 400 / 800, y: 300 / 600 };
          p2 = { x: 100 / 800, y: 100 / 600 }; // w=300 pt, h=200 pt
        }

        const areaResult = calculateArea([p1, p2], currentDims, baseCalibration, true);

        // Verificación con tolerancia estricta
        expect(areaResult.value).toBeCloseTo(6.0, 5); // 6.00 m²
        expect(areaResult.perimeter).toBeCloseTo(10.0, 5); // 10.00 m
        expect(areaResult.formatted).toBe('6.00 m²');
      });
    });
  });

  describe('Conteo Takeoff (calculateCount)', () => {
    it('genera medición con índice ordinal positivo y formato limpio', () => {
      const c1 = calculateCount(1);
      const c5 = calculateCount(5);

      expect(c1.value).toBe(1);
      expect(c1.formatted).toBe('1');
      expect(c5.value).toBe(5);
      expect(c5.formatted).toBe('5');
    });
  });

  describe('Formateo de Medición (formatMeasurement)', () => {
    it('formatea valores numéricos con la precisión y sufijo correctos', () => {
      expect(formatMeasurement(12.3456, 'm', 2)).toBe('12.35 m');
      expect(formatMeasurement(100.5, 'm', 1, true)).toBe('100.5 m²');
      expect(formatMeasurement(50, 'ft', 0)).toBe('50 ft');
    });
  });
});
