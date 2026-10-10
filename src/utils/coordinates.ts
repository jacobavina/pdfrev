import { MarkupPoint, Markup, BoundingBox, ViewportTransform } from '../types/markup';

/**
 * Converte coordenadas nativas PDF (origen inferior-izquierdo)
 * a coordenadas normalizadas UI (0..1, origen superior-izquierdo).
 */
export function pdfToNormalized(
  pdfX: number,
  pdfY: number,
  pageWidth: number,
  pageHeight: number
): MarkupPoint {
  return {
    x: Math.max(0, Math.min(1, pdfX / pageWidth)),
    y: Math.max(0, Math.min(1, (pageHeight - pdfY) / pageHeight)),
  };
}

/**
 * Convierte coordenadas normalizadas UI (0..1, origen superior-izquierdo)
 * a coordenadas nativas PDF (origen inferior-izquierdo).
 */
export function normalizedToPdf(
  normX: number,
  normY: number,
  pageWidth: number,
  pageHeight: number
): { x: number; y: number } {
  return {
    x: normX * pageWidth,
    y: pageHeight - normY * pageHeight,
  };
}

/**
 * Convierte un punto normalizado (0..1) a coordenadas de pantalla (píxeles),
 * considerando ancho de página, alto, zoom (scale) y desplazamiento (pan).
 */
export function normalizedToScreen(
  point: MarkupPoint,
  transform: ViewportTransform
): { x: number; y: number } {
  return {
    x: point.x * transform.width * transform.scale + transform.offsetX,
    y: point.y * transform.height * transform.scale + transform.offsetY,
  };
}

/**
 * Convierte coordenadas de pantalla (píxeles del contenedor)
 * a coordenadas normalizadas (0..1) relativas a la página.
 */
export function screenToNormalized(
  screenX: number,
  screenY: number,
  transform: ViewportTransform
): MarkupPoint {
  const scaledWidth = transform.width * transform.scale;
  const scaledHeight = transform.height * transform.scale;

  if (scaledWidth === 0 || scaledHeight === 0) {
    return { x: 0, y: 0 };
  }

  const normX = (screenX - transform.offsetX) / scaledWidth;
  const normY = (screenY - transform.offsetY) / scaledHeight;

  return {
    x: Math.max(0, Math.min(1, normX)),
    y: Math.max(0, Math.min(1, normY)),
  };
}

/**
 * Obtiene la caja delimitadora (Bounding Box normalizada 0..1) de una anotación.
 */
export function getMarkupBounds(markup: Markup): BoundingBox {
  if (markup.points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const pt of markup.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0.0001, maxX - minX),
    height: Math.max(0.0001, maxY - minY),
  };
}

/**
 * Comprueba si un punto normalizado se encuentra dentro de una caja delimitadora
 * con una tolerancia dada (en espacio normalizado 0..1).
 */
export function isPointInBounds(
  point: MarkupPoint,
  bounds: BoundingBox,
  tolerance = 0.01
): boolean {
  return (
    point.x >= bounds.x - tolerance &&
    point.x <= bounds.x + bounds.width + tolerance &&
    point.y >= bounds.y - tolerance &&
    point.y <= bounds.y + bounds.height + tolerance
  );
}

/**
 * Hit-testing técnico para comprobar si un clic impacta una anotación.
 */
export function hitTestMarkup(
  point: MarkupPoint,
  markup: Markup,
  tolerance = 0.015
): boolean {
  const bounds = getMarkupBounds(markup);

  // Verificación rápida con bounding box expandido
  if (!isPointInBounds(point, bounds, tolerance)) {
    return false;
  }

  // Para rectángulos y círculos con relleno o nubes:
  if (markup.type === 'rectangle' || markup.type === 'circle' || markup.type === 'cloud') {
    // Si tiene fill, cualquier punto interior cuenta
    if (markup.style.fillColor && markup.style.fillColor !== 'transparent') {
      return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      );
    }

    // Si solo tiene borde, hit test en el perímetro con tolerancia
    const nearLeft = Math.abs(point.x - bounds.x) <= tolerance;
    const nearRight = Math.abs(point.x - (bounds.x + bounds.width)) <= tolerance;
    const nearTop = Math.abs(point.y - bounds.y) <= tolerance;
    const nearBottom = Math.abs(point.y - (bounds.y + bounds.height)) <= tolerance;

    const inYRange = point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.height + tolerance;
    const inXRange = point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.width + tolerance;

    return (
      ((nearLeft || nearRight) && inYRange) ||
      ((nearTop || nearBottom) && inXRange)
    );
  }

  // Para líneas y segmentos (distancia punto a segmento)
  if (markup.type === 'line' && markup.points.length >= 2) {
    const p1 = markup.points[0];
    const p2 = markup.points[1];
    return distanceToSegment(point, p1, p2) <= tolerance;
  }

  // Por defecto, bounding box con tolerancia
  return true;
}

/**
 * Distancia euclidiana mínima de un punto a un segmento de recta.
 */
function distanceToSegment(p: MarkupPoint, v: MarkupPoint, w: MarkupPoint): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  };
  return Math.hypot(p.x - projection.x, p.y - projection.y);
}
