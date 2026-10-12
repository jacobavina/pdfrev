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

/**
 * Perímetro de un contorno cerrado (ADR-0029, herramienta Perimeter): suma de lados incluido el de cierre.
 */
export function calculatePerimeter(
  points: MarkupPoint[],
  pageDimsPt: PageDimensionsPt,
  calibration: PageCalibration = DEFAULT_PAGE_CALIBRATION
): MarkupMeasurement {
  const { sx, sy } = axisScales(calibration);
  let value = 0;
  const n = points?.length ?? 0;
  if (n >= 2) {
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      if (n === 2 && i === 1) break;
      value += Math.hypot((b.x - a.x) * pageDimsPt.width * sx, (b.y - a.y) * pageDimsPt.height * sy);
    }
  }
  return { value, unit: calibration.unit, formatted: formatWithCalibration(value, calibration) };
}

/**
 * Volumen (ADR-0029, herramienta Volume): área del contorno × profundidad, en unidades cúbicas de la escala.
 */
export function calculateVolume(
  points: MarkupPoint[],
  pageDimsPt: PageDimensionsPt,
  calibration: PageCalibration = DEFAULT_PAGE_CALIBRATION,
  depth = 1
): MarkupMeasurement {
  const area = calculateArea(points, pageDimsPt, calibration, false);
  const d = Number.isFinite(depth) && depth > 0 ? depth : 0;
  const value = area.value * d;
  const precision = calibration.precision ?? 2;
  return {
    value,
    unit: calibration.unit,
    formatted: `${value.toFixed(precision)} ${calibration.unit}³`,
    perimeter: area.perimeter,
  };
}

/**
 * Volumen con otra profundidad sin recalcular el área (el volumen es lineal en la profundidad).
 * Devuelve null si la profundidad anterior no permite deducir el área.
 */
export function rescaleVolumeDepth(
  measurement: MarkupMeasurement,
  oldDepth: number,
  newDepth: number,
  precision = 2
): MarkupMeasurement | null {
  if (!(oldDepth > 0) || !(newDepth > 0) || !Number.isFinite(newDepth)) return null;
  const value = (measurement.value / oldDepth) * newDepth;
  return { ...measurement, value, formatted: `${value.toFixed(precision)} ${measurement.unit}³` };
}

/**
 * Ángulo en el vértice central de tres puntos (ADR-0029, herramienta Angle), en grados sobre la geometría real
 * (respeta la escala Y separada).
 */
export function calculateAngle(
  points: MarkupPoint[],
  pageDimsPt: PageDimensionsPt,
  calibration: PageCalibration = DEFAULT_PAGE_CALIBRATION
): MarkupMeasurement {
  const { sx, sy } = axisScales(calibration);
  if (!points || points.length < 3) return { value: 0, unit: calibration.unit, formatted: '0.0°' };
  const [a, v, b] = points;
  const ax = (a.x - v.x) * pageDimsPt.width * sx;
  const ay = (a.y - v.y) * pageDimsPt.height * sy;
  const bx = (b.x - v.x) * pageDimsPt.width * sx;
  const by = (b.y - v.y) * pageDimsPt.height * sy;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  let deg = 0;
  if (la > 0 && lb > 0) {
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    deg = (Math.acos(cos) * 180) / Math.PI;
  }
  return { value: deg, unit: calibration.unit, formatted: `${deg.toFixed(1)}°` };
}
