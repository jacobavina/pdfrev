import { MarkupPoint, Markup, BoundingBox, ViewportTransform } from '../types/markup';

export interface ViewportLike {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[] | [number, number];
  convertToPdfPoint(x: number, y: number): number[] | [number, number];
}

/**
 * Convierte un punto PDF (origen inferior-izquierdo) a coordenadas normalizadas UI (0..1)
 * usando el PageViewport de PDF.js como fuente única de verdad.
 * Respeta de forma unificada tanto la rotación intrínseca (/Rotate) como la rotación del store.
 */
export function pdfToNormalizedWithViewport(
  pdfX: number,
  pdfY: number,
  viewport: ViewportLike
): MarkupPoint {
  const [vx, vy] = viewport.convertToViewportPoint(pdfX, pdfY);
  return {
    x: Math.max(0, Math.min(1, vx / viewport.width)),
    y: Math.max(0, Math.min(1, vy / viewport.height)),
  };
}

/**
 * Convierte un punto normalizado UI (0..1) a coordenadas nativas PDF
 * usando el PageViewport de PDF.js como fuente única de verdad.
 * Respeta de forma unificada tanto la rotación intrínseca (/Rotate) como la rotación del store.
 */
export function normalizedToPdfWithViewport(
  normX: number,
  normY: number,
  viewport: ViewportLike
): { x: number; y: number } {
  const vx = normX * viewport.width;
  const vy = normY * viewport.height;
  const [pdfX, pdfY] = viewport.convertToPdfPoint(vx, vy);
  return { x: pdfX, y: pdfY };
}

/**
 * Convierte coordenadas nativas PDF (origen inferior-izquierdo)
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

  // Si tiene directrices (Callout), incluir sus puntos en el bounding box
  if (markup.leaders && Array.isArray(markup.leaders)) {
    for (const leader of markup.leaders) {
      for (const pt of leader) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
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
 * Algoritmo Ray-Casting para determinar si un punto está dentro de un polígono 2D.
 */
export function isPointInPolygon(point: MarkupPoint, polygon: MarkupPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Hit-testing técnico y geométrico para comprobar si un clic impacta una anotación.
 * Cobertura matemática exacta para elipse, polígono, polilínea y directrices.
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

  const hasFill =
    Boolean(markup.style.fillColor) &&
    markup.style.fillColor !== 'transparent' &&
    markup.style.fillColor !== 'rgba(0,0,0,0)';

  // 1. Círculo / Elipse inscrita en bbox de 2 puntos (B5 y Criterio 2)
  if (markup.type === 'circle' && markup.points.length >= 2) {
    const p1 = markup.points[0];
    const p2 = markup.points[1];
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const rx = Math.max(0.0001, Math.abs(p2.x - p1.x) / 2);
    const ry = Math.max(0.0001, Math.abs(p2.y - p1.y) / 2);

    const dx = point.x - cx;
    const dy = point.y - cy;
    const q = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);

    if (hasFill) {
      return q <= 1.0 + tolerance;
    }

    // Anillo perimétrico con tolerancia geométrica
    const r = Math.hypot(dx, dy);
    if (r === 0) return false;
    const distToPerimeter = Math.abs(r - r / Math.sqrt(q));
    return distToPerimeter <= tolerance;
  }

  // 2. Polígono (N puntos >= 3)
  if (markup.type === 'polygon' && markup.points.length >= 3) {
    if (hasFill && isPointInPolygon(point, markup.points)) {
      return true;
    }
    // Perímetro / aristas
    for (let i = 0, j = markup.points.length - 1; i < markup.points.length; j = i++) {
      if (distanceToSegment(point, markup.points[j], markup.points[i]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  // 3. Trazo a mano alzada (Freehand)
  if (markup.type === 'freehand' && markup.points.length >= 2) {
    for (let i = 1; i < markup.points.length; i++) {
      if (distanceToSegment(point, markup.points[i - 1], markup.points[i]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  // 4. Rectángulo / Highlight / Text / Stamp
  if (
    markup.type === 'rectangle' ||
    markup.type === 'highlight' ||
    markup.type === 'highlightVector' ||
    markup.type === 'highlightText' ||
    markup.type === 'text' ||
    markup.type === 'stamp'
  ) {
    if (hasFill || markup.type === 'text' || markup.type === 'stamp' || markup.type.startsWith('highlight')) {
      return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      );
    }

    // Si solo tiene borde
    const nearLeft = Math.abs(point.x - bounds.x) <= tolerance;
    const nearRight = Math.abs(point.x - (bounds.x + bounds.width)) <= tolerance;
    const nearTop = Math.abs(point.y - bounds.y) <= tolerance;
    const nearBottom = Math.abs(point.y - (bounds.y + bounds.height)) <= tolerance;

    const inYRange = point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.height + tolerance;
    const inXRange = point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.width + tolerance;

    return ((nearLeft || nearRight) && inYRange) || ((nearTop || nearBottom) && inXRange);
  }

  // 5. Línea (2 puntos)
  if (markup.type === 'line' && markup.points.length >= 2) {
    return distanceToSegment(point, markup.points[0], markup.points[1]) <= tolerance;
  }

  // 6. Callout (Caja de texto + directrices)
  if (markup.type === 'callout') {
    // Si cae dentro de la caja de texto
    const inBox =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height;
    if (inBox) return true;

    // Si cae en alguna de sus directrices
    if (markup.leaders && Array.isArray(markup.leaders)) {
      for (const leader of markup.leaders) {
        for (let i = 1; i < leader.length; i++) {
          if (distanceToSegment(point, leader[i - 1], leader[i]) <= tolerance) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // 7. StickyNote (Caja del icono)
  if (markup.type === 'stickyNote') {
    return isPointInBounds(point, bounds, tolerance);
  }

  // 8. Cloud / CloudPlus (Interior si tiene relleno o cerca del contorno)
  if (markup.type === 'cloud' || markup.type === 'cloudPlus') {
    return isPointInBounds(point, bounds, tolerance);
  }

  return false;
}

/**
 * Distancia euclidiana mínima de un punto a un segmento de recta.
 */
export function distanceToSegment(p: MarkupPoint, v: MarkupPoint, w: MarkupPoint): number {
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
