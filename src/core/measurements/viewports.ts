import { MarkupPoint, MeasurementViewport, PageCalibration } from '../../types/markup';

/**
 * Comprueba si un punto en coordenadas normalizadas [0, 1] se encuentra dentro de los límites del viewport.
 */
export function isPointInViewport(
  point: MarkupPoint,
  viewport: MeasurementViewport,
  tolerance = 1e-4
): boolean {
  const { x, y, width, height } = viewport.bounds;
  return (
    point.x >= x - tolerance &&
    point.x <= x + width + tolerance &&
    point.y >= y - tolerance &&
    point.y <= y + height + tolerance
  );
}

/**
 * Encuentra el viewport que contiene una marca (o conjunto de puntos).
 * Si hay múltiples viewports anidados o superpuestos, devuelve el de menor superficie (detalle más específico).
 */
export function findMatchingViewport(
  points: MarkupPoint[],
  viewports: MeasurementViewport[] | undefined
): MeasurementViewport | null {
  if (!points || points.length === 0 || !viewports || viewports.length === 0) return null;

  // Calculamos el centro de la caja envolvente de los puntos
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centerPoint: MarkupPoint = { x: cx, y: cy };

  let best: { vp: MeasurementViewport; area: number } | null = null;
  for (const vp of viewports) {
    if (isPointInViewport(centerPoint, vp)) {
      const area = Math.max(1e-6, vp.bounds.width * vp.bounds.height);
      if (!best || area < best.area) {
        best = { vp, area };
      }
    }
  }

  return best?.vp ?? null;
}

/**
 * Obtiene la calibración efectiva aplicable a un conjunto de puntos:
 * la del viewport que los contenga, o la calibración general de la página en su defecto.
 */
export function getEffectiveCalibrationForPoints(
  pageCalibration: PageCalibration,
  points: MarkupPoint[] | undefined,
  viewports: MeasurementViewport[] | undefined
): PageCalibration {
  if (!points || points.length === 0 || !viewports || viewports.length === 0) {
    return pageCalibration;
  }
  const matched = findMatchingViewport(points, viewports);
  return matched ? matched.calibration : pageCalibration;
}
