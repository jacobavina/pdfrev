import {
  MarkupPoint,
  PageCalibration,
  MarkupMeasurement,
  MeasurementUnit,
} from '../../types/markup';
import { formatWithCalibration } from './scale';

export interface PageDimensionsPt {
  width: number;
  height: number;
}

/**
 * Calibración por defecto para páginas sin calibrar: escala de papel en milímetros, como hacen los
 * editores técnicos sin calibrar (1 pt = 1/72 in = 25.4/72 mm ≈ 0.3528 mm).
 * Antes era "1 pt = 1 m", que mostraba una línea de 300 pt como "300.00 m" (auditoría 2026-10-11).
 */
export const DEFAULT_PAGE_CALIBRATION: PageCalibration = {
  scale: 25.4 / 72, // milímetros de papel por punto PDF
  unit: 'mm',
  precision: 1,
};

/**
 * Formatea un valor numérico con su unidad y símbolo de área si aplica.
 */
export function formatMeasurement(
  value: number,
  unit: MeasurementUnit,
  precision = 2,
  isArea = false
): string {
  const safeVal = Number.isFinite(value) ? Math.max(0, value) : 0;
  const unitStr = isArea ? `${unit}²` : unit;
  return `${safeVal.toFixed(precision)} ${unitStr}`;
}

/** Escalas por eje (unidades reales por pt); Y igual a X salvo "Separate Y Scale". */
function axisScales(calibration: PageCalibration): { sx: number; sy: number } {
  const sx = Number.isFinite(calibration.scale) && calibration.scale > 0 ? calibration.scale : 1;
  const sy = Number.isFinite(calibration.scaleY) && (calibration.scaleY ?? 0) > 0 ? (calibration.scaleY as number) : sx;
  return { sx, sy };
}

/**
 * Calcula la longitud euclídea entre dos puntos en espacio físico de página (pt)
 * y la convierte a unidades del mundo real según la calibración.
 */
export function calculateLength(
  points: MarkupPoint[],
  pageDimsPt: PageDimensionsPt,
  calibration: PageCalibration = DEFAULT_PAGE_CALIBRATION
): MarkupMeasurement {
  if (!points || points.length < 2) {
    return {
      value: 0,
      unit: calibration.unit,
      formatted: formatWithCalibration(0, calibration),
    };
  }

  const p1 = points[0];
  const p2 = points[1];

  const { sx, sy } = axisScales(calibration);
  const value = Math.hypot((p2.x - p1.x) * pageDimsPt.width * sx, (p2.y - p1.y) * pageDimsPt.height * sy);

  return {
    value,
    unit: calibration.unit,
    formatted: formatWithCalibration(value, calibration),
  };
}

/**
 * Calcula la longitud total acumulada de una polilínea abierta en unidades reales.
 */
export function calculatePolylineLength(
  points: MarkupPoint[],
  pageDimsPt: PageDimensionsPt,
  calibration: PageCalibration = DEFAULT_PAGE_CALIBRATION
): MarkupMeasurement {
  if (!points || points.length < 2) {
    return {
      value: 0,
      unit: calibration.unit,
      formatted: formatWithCalibration(0, calibration),
    };
  }

  const { sx, sy } = axisScales(calibration);
  let value = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const pA = points[i];
    const pB = points[i + 1];
    value += Math.hypot((pB.x - pA.x) * pageDimsPt.width * sx, (pB.y - pA.y) * pageDimsPt.height * sy);
  }

  return {
    value,
    unit: calibration.unit,
    formatted: formatWithCalibration(value, calibration),
  };
}

/**
 * Calcula el área y perímetro de un polígono cerrado o rectángulo en unidades reales.
 */
export function calculateArea(
  points: MarkupPoint[],
  pageDimsPt: PageDimensionsPt,
  calibration: PageCalibration = DEFAULT_PAGE_CALIBRATION,
  isRectangle = false
): MarkupMeasurement {
  if (!points || points.length < 2) {
    return {
      value: 0,
      unit: calibration.unit,
      formatted: formatWithCalibration(0, calibration, true),
      perimeter: 0,
    };
  }

  const { sx, sy } = axisScales(calibration);
  // Coordenadas ya en unidades reales (escala X e Y independientes)
  const W = pageDimsPt.width * sx;
  const H = pageDimsPt.height * sy;
  let areaPt = 0;
  let perimeterPt = 0;

  if (isRectangle || points.length === 2) {
    const p1 = points[0];
    const p2 = points[1];
    const wPt = Math.abs(p2.x - p1.x) * W;
    const hPt = Math.abs(p2.y - p1.y) * H;
    areaPt = wPt * hPt;
    perimeterPt = 2 * (wPt + hPt);
  } else {
    // Fórmula de Gauss (Shoelace)
    const n = points.length;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const pA = points[i];
      const pB = points[(i + 1) % n];
      const xA = pA.x * W;
      const yA = pA.y * H;
      const xB = pB.x * W;
      const yB = pB.y * H;

      sum += xA * yB - xB * yA;
      perimeterPt += Math.hypot(xB - xA, yB - yA);
    }
    areaPt = Math.abs(sum) / 2;
  }

  const areaValue = areaPt;
  const perimeterValue = perimeterPt;

  return {
    value: areaValue,
    unit: calibration.unit,
    formatted: formatWithCalibration(areaValue, calibration, true),
    perimeter: perimeterValue,
  };
}

/**
 * Calcula o genera los datos de medición para un contador (Takeoff Count).
 */
export function calculateCount(
  countIndex: number,
  unit: MeasurementUnit = 'm'
): MarkupMeasurement {
  const safeIdx = Math.max(1, Math.floor(countIndex || 1));
  return {
    value: safeIdx,
    unit,
    formatted: String(safeIdx),
    countIndex: safeIdx,
  };
}
