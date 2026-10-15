import { MeasurementUnit, PageCalibration } from '../../types/markup';

/**
 * Escalas de medición (ADR-0025), como el panel Format › Measure de Foxit y la escala de página de Revu:
 * presets métricos, arquitectónicos e ingenieriles, relación personalizada "papel = real", pies y pulgadas con
 * fracciones, y escala Y separada. Puro: sin React ni DOM.
 */

export type PaperUnit = 'mm' | 'cm' | 'in' | 'pt';
/** Unidad de presentación: 'ftin' = pies y pulgadas (12'-6 1/2"). */
export type DisplayUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'ftin';

export const PAPER_UNITS: PaperUnit[] = ['mm', 'cm', 'in', 'pt'];
export const DISPLAY_UNITS: DisplayUnit[] = ['mm', 'cm', 'm', 'in', 'ft', 'ftin'];
export const DISPLAY_UNIT_LABELS: Record<DisplayUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  in: 'in',
  ft: 'ft',
  ftin: "ft'in",
};

const MM_PER: Record<PaperUnit | MeasurementUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
  pt: 25.4 / 72,
};

/** Unidad base de cálculo de una unidad de presentación. */
export function baseUnitOf(display: DisplayUnit): MeasurementUnit {
  return display === 'ftin' ? 'ft' : display;
}

export function displayUnitOf(calibration: Pick<PageCalibration, 'unit' | 'format'>): DisplayUnit {
  return calibration.unit === 'ft' && calibration.format === 'ftin' ? 'ftin' : calibration.unit;
}

/** Convierte un valor entre unidades de longitud. */
export function convertLength(value: number, from: PaperUnit | MeasurementUnit, to: PaperUnit | MeasurementUnit): number {
  return (value * MM_PER[from]) / MM_PER[to];
}

/** Unidades reales (de presentación) por punto PDF para la relación "papel = real". */
export function scaleFromRatio(
  paperValue: number,
  paperUnit: PaperUnit,
  realValue: number,
  realUnit: DisplayUnit,
  display: DisplayUnit
): number {
  const paperPt = convertLength(paperValue, paperUnit, 'pt');
  const real = convertLength(realValue, baseUnitOf(realUnit), baseUnitOf(display));
  if (!(paperPt > 0) || !(real > 0)) return NaN;
  return real / paperPt;
}

/**
 * Lee una longitud en pies y pulgadas: 12'-6 1/2", 12' 6", 6 1/2", 12', 12.5 (pies). Devuelve pies o NaN.
 */
export function parseFeetInches(text: string): number {
  const t = text.trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'");
  if (!t) return NaN;
  const frac = (s: string): number => {
    const m = s.trim().match(/^(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?$/);
    if (!m || (!m[1] && !m[2])) return NaN;
    const whole = m[1] ? Number(m[1]) : 0;
    const f = m[2] ? Number(m[2]) / Number(m[3]) : 0;
    return whole + f;
  };
  const ft = t.match(/^(-?\d+(?:\.\d+)?)\s*'\s*-?\s*(.*)$/);
  if (ft) {
    const feet = Number(ft[1]);
    const rest = ft[2].replace(/"$/, '').trim();
    const inches = rest ? frac(rest) : 0;
    return Number.isFinite(feet) && Number.isFinite(inches) ? feet + inches / 12 : NaN;
  }
  if (t.endsWith('"')) {
    const inches = frac(t.slice(0, -1));
    return inches / 12;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Pulgadas redondeadas a 1/denominador, como texto "6 1/2" (sin comillas). */
function inchesWithFraction(inches: number, denominator: number): { whole: number; text: string } {
  const den = Math.max(1, Math.round(denominator));
  const units = Math.round(inches * den);
  const whole = Math.floor(units / den);
  let num = units - whole * den;
  let d = den;
  while (num > 0 && num % 2 === 0 && d % 2 === 0) {
    num /= 2;
    d /= 2;
  }
  return { whole, text: num > 0 ? `${whole ? `${whole} ` : ''}${num}/${d}` : String(whole) };
}

/** Pies y pulgadas: 12'-6 1/2" (redondeo a 1/denominador de pulgada). */
export function formatFeetInches(feetValue: number, denominator = 16): string {
  const totalInches = Math.max(0, feetValue) * 12;
  const den = Math.max(1, Math.round(denominator));
  const units = Math.round(totalInches * den);
  const feet = Math.floor(units / (12 * den));
  const restInches = (units - feet * 12 * den) / den;
  return `${groupThousands(String(feet))}'-${inchesWithFraction(restInches, den).text}"`;
}

/**
 * Texto de una medida con la presentación de la calibración: decimales, pies-pulgadas o pulgadas fraccionarias.
 * Las áreas siempre en decimales (ft² cuando la presentación es pies-pulgadas).
 */
/** Agrupa los miles con coma, como Acrobat (1,551.89): "1551.89" → "1,551.89" (ADR-0033). */
export function groupThousands(fixed: string): string {
  const neg = fixed.startsWith('-');
  const [int, dec] = (neg ? fixed.slice(1) : fixed).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${dec !== undefined ? `.${dec}` : ''}`;
}

/** Número con `precision` decimales y miles agrupados. */
export function formatNumber(value: number, precision: number): string {
  return groupThousands(value.toFixed(precision));
}

export function formatWithCalibration(value: number, calibration: PageCalibration, isArea = false): string {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const unit = calibration.unit;
  const precision = calibration.precision ?? 2;
  if (isArea) return `${formatNumber(v, precision)} ${unit}²`;
  if (calibration.format === 'ftin' && unit === 'ft') return formatFeetInches(v, calibration.fractionDenominator ?? 16);
  if (calibration.format === 'fraction' && unit === 'in') {
    return `${inchesWithFraction(v, calibration.fractionDenominator ?? 16).text}"`;
  }
  return `${formatNumber(v, precision)} ${unit}`;
}

export interface ScalePreset {
  id: string;
  label: string;
  paperValue: number;
  paperUnit: PaperUnit;
  realValue: number;
  realUnit: DisplayUnit;
  group: 'Metric' | 'Architectural' | 'Engineering' | 'Custom';
}

const metric = (n: number): ScalePreset => ({
  id: `m-1-${n}`,
  label: `1:${n}`,
  paperValue: 1,
  paperUnit: 'mm',
  realValue: n,
  realUnit: 'mm',
  group: 'Metric',
});
const arch = (label: string, inches: number): ScalePreset => ({
  id: `a-${label}`,
  label: `${label}" = 1'-0"`,
  paperValue: inches,
  paperUnit: 'in',
  realValue: 1,
  realUnit: 'ftin',
  group: 'Architectural',
});
const eng = (feet: number): ScalePreset => ({
  id: `e-${feet}`,
  label: `1" = ${feet}'`,
  paperValue: 1,
  paperUnit: 'in',
  realValue: feet,
  realUnit: 'ft',
  group: 'Engineering',
});

export const BUILT_IN_SCALE_PRESETS: ScalePreset[] = [
  ...[1, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000].map(metric),
  arch('1/16', 1 / 16),
  arch('3/32', 3 / 32),
  arch('1/8', 1 / 8),
  arch('3/16', 3 / 16),
  arch('1/4', 1 / 4),
  arch('3/8', 3 / 8),
  arch('1/2', 1 / 2),
  arch('3/4', 3 / 4),
  arch('1', 1),
  arch('1 1/2', 1.5),
  arch('3', 3),
  ...[10, 20, 30, 40, 50, 60, 100].map(eng),
];

/** Opciones de precisión según la unidad: decimales, o fracciones de pulgada para ft'in / in. */
export function precisionOptions(display: DisplayUnit): { value: string; label: string }[] {
  if (display === 'ftin' || display === 'in') {
    return [1, 2, 4, 8, 16, 32, 64].map((d) => ({ value: `f${d}`, label: d === 1 ? '1' : `1/${d}` }));
  }
  return [0, 1, 2, 3, 4].map((p) => ({ value: `d${p}`, label: p === 0 ? '1' : (1 / 10 ** p).toFixed(p) }));
}

/** Calibración completa a partir de los valores del panel. */
export function buildCalibration(input: {
  paperValue: number;
  paperUnit: PaperUnit;
  realValue: number;
  realUnit: DisplayUnit;
  display: DisplayUnit;
  precision: string;
  y?: { paperValue: number; paperUnit: PaperUnit; realValue: number; realUnit: DisplayUnit };
  presetId?: string;
}): PageCalibration | null {
  const scale = scaleFromRatio(input.paperValue, input.paperUnit, input.realValue, input.realUnit, input.display);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  let scaleY: number | undefined;
  if (input.y) {
    scaleY = scaleFromRatio(input.y.paperValue, input.y.paperUnit, input.y.realValue, input.y.realUnit, input.display);
    if (!Number.isFinite(scaleY) || scaleY <= 0) return null;
  }
  const isFraction = input.precision.startsWith('f');
  const num = Number(input.precision.slice(1));
  const base = baseUnitOf(input.display);
  return {
    scale,
    ...(scaleY !== undefined ? { scaleY } : {}),
    unit: base,
    precision: isFraction ? 2 : num,
    ...(input.display === 'ftin' ? { format: 'ftin' as const } : isFraction && base === 'in' ? { format: 'fraction' as const } : {}),
    ...(isFraction ? { fractionDenominator: num } : {}),
    ratio: {
      paperValue: input.paperValue,
      paperUnit: input.paperUnit,
      realValue: input.realValue,
      realUnit: input.realUnit,
      ...(input.y ? { y: input.y } : {}),
    },
    ...(input.presetId ? { presetId: input.presetId } : {}),
  };
}

/** Texto corto de la escala para la barra de estado: el preset, la relación o la escala por punto. */
export function describeCalibration(calibration: PageCalibration): string {
  const r = calibration.ratio;
  if (calibration.presetId) {
    const p = BUILT_IN_SCALE_PRESETS.find((x) => x.id === calibration.presetId);
    if (p) return p.label;
  }
  if (r) {
    // Hasta 4 decimales, sin ceros sobrantes (una escala por dos puntos no da números redondos)
    const num = (n: number) => String(Number(n.toFixed(4)));
    const real = r.realUnit === 'ftin' ? formatFeetInches(r.realValue) : `${num(r.realValue)} ${r.realUnit}`;
    return `${num(r.paperValue)} ${r.paperUnit} = ${real}`;
  }
  return `1 ${calibration.unit} = ${(1 / calibration.scale).toFixed(1)} pt`;
}
