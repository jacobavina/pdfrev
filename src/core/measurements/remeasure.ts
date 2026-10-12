import { Markup, MarkupPoint, PageCalibration } from '../../types/markup';
import {
  PageDimensionsPt,
  calculateAngle,
  calculateArea,
  calculateLength,
  calculatePerimeter,
  calculatePolylineLength,
  calculateVolume,
} from './calculate';

/** Tipos cuyo valor depende de la escala de la página. */
export const SCALED_MEASURE_TYPES = new Set([
  'length',
  'polylineMeasure',
  'area',
  'perimeter',
  'volume',
  'radius',
  'diameter',
  'dimension',
]);

/**
 * La marca con su medida recalculada para `points` y la escala `calib` (ADR-0021/0031): la usan el arrastre de
 * vértices y el cambio de escala de la página. El texto se actualiza cuando era el valor anterior (o vacío), para
 * no pisar un comentario escrito por el usuario; `previous` es la escala con la que se escribió ese valor.
 */
export function remeasureMarkup(
  original: Markup,
  points: MarkupPoint[],
  dims: PageDimensionsPt,
  calib: PageCalibration,
  previous: PageCalibration = calib
): Markup {
  const next: Markup = { ...original, points };
  const keepsValueText = (oldFormatted: string | undefined) =>
    !original.text || original.text === oldFormatted || original.text === original.measurement?.formatted;
  let measurement: Markup['measurement'] | undefined;
  switch (original.type) {
    case 'length':
    case 'radius':
    case 'diameter':
      measurement = calculateLength(points, dims, calib);
      break;
    case 'polylineMeasure':
      measurement = calculatePolylineLength(points, dims, calib);
      break;
    case 'area':
      if (points.length >= 3) measurement = calculateArea(points, dims, calib, false);
      break;
    case 'perimeter':
      measurement = calculatePerimeter(points, dims, calib);
      break;
    case 'volume':
      measurement = calculateVolume(points, dims, calib, Number(original.customFields?.volumeDepth ?? 1));
      break;
    case 'angle':
      measurement = calculateAngle(points, dims, calib);
      break;
    case 'dimension': {
      // La cota guarda su valor como texto editable: solo se actualiza si sigue siendo el valor medido
      const before = calculateLength(original.points.slice(0, 2), dims, previous).formatted;
      if (!original.text || original.text === before) {
        next.text = calculateLength(points.slice(0, 2), dims, calib).formatted;
      }
      return next;
    }
    default:
      return next;
  }
  if (measurement) {
    if (keepsValueText(measurement.formatted)) next.text = measurement.formatted;
    next.measurement = measurement;
  }
  return next;
}
