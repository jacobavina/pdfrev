import { dimensionSegmentsNormalized } from '../core/markup/dimension';
import {
  MarkupPoint,
  Markup,
  BoundingBox,
  ViewportTransform,
  STICKY_NOTE_SIZE_PT,
} from '../types/markup';

export { STICKY_NOTE_SIZE_PT };

/**
 * Convierte el tamaño estándar en puntos (STICKY_NOTE_SIZE_PT = 24 pt) a dimensiones
 * normalizadas [0..1] por eje en función del ancho y alto de la página.
 * Garantiza que en pantalla y en exportación el icono sea estrictamente cuadrado en puntos (24x24 pt).
 */
export function getStickyNoteNormalizedSize(pageDimensions: {
  width: number;
  height: number;
}): { width: number; height: number } {
  if (
    !pageDimensions ||
    typeof pageDimensions.width !== 'number' ||
    typeof pageDimensions.height !== 'number' ||
    pageDimensions.width <= 0 ||
    pageDimensions.height <= 0
  ) {
    throw new Error(
      `[getStickyNoteNormalizedSize] pageDimensions is required and must have width > 0 and height > 0`
    );
  }
  return {
    width: STICKY_NOTE_SIZE_PT / pageDimensions.width,
    height: STICKY_NOTE_SIZE_PT / pageDimensions.height,
  };
}

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
 * Determina si la distancia entre dos puntos normalizados supera el umbral en píxeles de pantalla.
 * Permite que el umbral de creación (p. ej. 4 px) sea invariable a la escala de visualización.
 */
export function exceedsScreenThreshold(
  p1: MarkupPoint,
  p2: MarkupPoint,
  transform: ViewportTransform,
  thresholdPx = 4
): boolean {
  const p1Scr = normalizedToScreen(p1, transform);
  const p2Scr = normalizedToScreen(p2, transform);
  const distScreen = Math.hypot(p2Scr.x - p1Scr.x, p2Scr.y - p1Scr.y);
  return distScreen >= thresholdPx;
}

/**
 * Obtiene la caja delimitadora (Bounding Box normalizada 0..1) de una anotación.
 */
export function getMarkupBounds(
  markup: Markup,
  pageDimensions?: { width: number; height: number }
): BoundingBox {
  if (markup.points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  if (markup.type === 'stickyNote' && markup.points.length >= 1) {
    if (!pageDimensions) {
      throw new Error(`[getMarkupBounds] pageDimensions is required for 'stickyNote'`);
    }
    const size = getStickyNoteNormalizedSize(pageDimensions);
    return {
      x: markup.points[0].x,
      y: markup.points[0].y,
      width: size.width,
      height: size.height,
    };
  }

  if (markup.type === 'count' && markup.points.length >= 1) {
    const r = 0.02;
    return {
      x: Math.max(0, markup.points[0].x - r),
      y: Math.max(0, markup.points[0].y - r),
      width: r * 2,
      height: r * 2,
    };
  }

  for (const pt of markup.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  // La línea de cota puede quedar fuera de los puntos acotados
  if (markup.type === 'dimension') {
    for (const [a, b] of dimensionSegmentsNormalized(markup.points, pageDimensions)) {
      for (const pt of [a, b]) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
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
 * Sub-entregable A.2 (Condición 1 y 5): Criterio del Marquee por INTERSECCIÓN.
 * Determina si dos cajas delimitadoras intersectan o si una contiene a la otra.
 */
export function doBoundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/**
 * Sub-entregable A.2 (Condición 5): Selección por Marquee de alto rendimiento.
 * Corre en cada mousemove con prefiltro O(N) por getMarkupBounds.
 * Expande automáticamente todos los miembros de cualquier groupId presente.
 */
export function selectMarkupsInRect(
  markups: Markup[],
  marqueeRect: BoundingBox,
  pageDimensions?: { width: number; height: number }
): string[] {
  const selectedIds = new Set<string>();
  const selectedGroupIds = new Set<string>();

  for (const m of markups) {
    const bounds = getMarkupBounds(m, pageDimensions);
    if (doBoundsIntersect(marqueeRect, bounds)) {
      selectedIds.add(m.id);
      if (m.groupId) {
        selectedGroupIds.add(m.groupId);
      }
    }
  }

  if (selectedGroupIds.size > 0) {
    for (const m of markups) {
      if (m.groupId && selectedGroupIds.has(m.groupId)) {
        selectedIds.add(m.id);
      }
    }
  }

  return Array.from(selectedIds);
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
 * Algoritmo Ramer-Douglas-Peucker (RDP) para simplificación de polilíneas.
 * Reduce el número de vértices manteniendo la fidelidad geométrica dentro de epsilon.
 */
export function simplifyRamerDouglasPeucker(
  points: MarkupPoint[],
  epsilon = 0.002
): MarkupPoint[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], start, end);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }

  if (maxDistance > epsilon) {
    const left = simplifyRamerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const right = simplifyRamerDouglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

export interface CalloutHitComponent {
  type: 'box' | 'arrowTip' | 'leaderBody';
  leaderIndex?: number;
}

/**
 * Inspecciona un punto normalizado contra un Callout y detecta con precisión qué componente fue clickeado:
 * - 'box': la caja de texto.
 * - 'arrowTip': el ancla / punta de flecha de una directriz específica (leaderIndex).
 * - 'leaderBody': el cuerpo de una directriz (codo, hombro o tramos de polilínea).
 */
export function findCalloutComponentAtPoint(
  point: MarkupPoint,
  markup: Markup,
  tolerance = 0.015
): CalloutHitComponent | null {
  if (markup.type !== 'callout' || !markup.points || markup.points.length === 0) {
    return null;
  }

  const p1 = markup.points[0];
  const p2 = markup.points[1] || p1;
  const left = Math.min(p1.x, p2.x);
  const top = Math.min(p1.y, p2.y);
  // Dimensiones normalizadas de la caja con tamaño mínimo de seguridad
  const width = Math.max(0.0875, Math.abs(p2.x - p1.x));
  const height = Math.max(0.04, Math.abs(p2.y - p1.y));

  // 1. Detección de clic en la caja de texto
  const inBox =
    point.x >= left - tolerance &&
    point.x <= left + width + tolerance &&
    point.y >= top - tolerance &&
    point.y <= top + height + tolerance;

  // 2. Detección en directrices (puntas de flecha primero para máxima prioridad sobre handles)
  if (markup.leaders && Array.isArray(markup.leaders)) {
    // A. ¿Clic en punta de flecha / ancla?
    for (let i = 0; i < markup.leaders.length; i++) {
      const leader = markup.leaders[i];
      if (leader.length > 0) {
        const arrowHead = leader[0];
        const distArrow = Math.hypot(point.x - arrowHead.x, point.y - arrowHead.y);
        if (distArrow <= tolerance) {
          return { type: 'arrowTip', leaderIndex: i };
        }
      }
    }

    // Si estaba dentro de la caja y no tocó ninguna punta de flecha, la caja tiene prioridad sobre el cuerpo
    if (inBox) {
      return { type: 'box' };
    }

    // B. ¿Clic en el cuerpo de la directriz (codo, hombro o tramos de polilínea)?
    const boxCenterY = top + height / 2;
    for (let i = 0; i < markup.leaders.length; i++) {
      const leader = markup.leaders[i];
      if (leader.length === 0) continue;

      if (leader.length === 1) {
        const arrowHead = leader[0];
        let boxAttachment: MarkupPoint;
        let elbow: MarkupPoint;
        const shoulderNorm = 0.015;

        if (arrowHead.x < left) {
          boxAttachment = { x: left, y: boxCenterY };
          elbow = { x: Math.min(left - shoulderNorm, (left + arrowHead.x) / 2), y: boxCenterY };
        } else if (arrowHead.x > left + width) {
          boxAttachment = { x: left + width, y: boxCenterY };
          elbow = { x: Math.max(left + width + shoulderNorm, (left + width + arrowHead.x) / 2), y: boxCenterY };
        } else {
          if (arrowHead.y < top) {
            boxAttachment = { x: left + width / 2, y: top };
            elbow = { x: left + width / 2, y: Math.min(top - shoulderNorm, (top + arrowHead.y) / 2) };
          } else {
            boxAttachment = { x: left + width / 2, y: top + height };
            elbow = { x: left + width / 2, y: Math.max(top + height + shoulderNorm, (top + height + arrowHead.y) / 2) };
          }
        }

        if (
          distanceToSegment(point, arrowHead, elbow) <= tolerance ||
          distanceToSegment(point, elbow, boxAttachment) <= tolerance
        ) {
          return { type: 'leaderBody', leaderIndex: i };
        }
      } else {
        // Directriz multi-punto explícita: tramos consecutivos
        for (let j = 1; j < leader.length; j++) {
          if (distanceToSegment(point, leader[j - 1], leader[j]) <= tolerance) {
            return { type: 'leaderBody', leaderIndex: i };
          }
        }
        // Conexión del último punto al centro de la caja
        const lastPt = leader[leader.length - 1];
        const boxAttachment = { x: left, y: boxCenterY };
        if (distanceToSegment(point, lastPt, boxAttachment) <= tolerance) {
          return { type: 'leaderBody', leaderIndex: i };
        }
      }
    }
  }

  if (inBox) {
    return { type: 'box' };
  }

  return null;
}

/**
 * Hit-testing técnico y geométrico para comprobar si un clic impacta una anotación.
 * CERO fallback return true: cobertura matemática rigurosa para los 14 tipos de marcas.
 */
export function hitTestMarkup(
  point: MarkupPoint,
  markup: Markup,
  tolerance = 0.015,
  pageDimensions?: { width: number; height: number }
): boolean {
  if (!markup || !markup.points || markup.points.length === 0) {
    return false;
  }

  const bounds = getMarkupBounds(markup, pageDimensions);

  // Verificación rápida con bounding box expandido con tolerancia
  if (!isPointInBounds(point, bounds, tolerance)) {
    return false;
  }

  const hasFill =
    Boolean(markup.style?.fillColor) &&
    markup.style.fillColor !== 'transparent' &&
    markup.style.fillColor !== 'none' &&
    markup.style.fillColor !== 'rgba(0,0,0,0)';

  // 1. Círculo / Elipse (ecuación elíptica interior o anillo perimétrico si es hueco)
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

    // Anillo perimétrico con tolerancia geométrica si no tiene relleno
    const r = Math.hypot(dx, dy);
    if (r === 0) return false;
    const distToPerimeter = Math.abs(r - r / Math.sqrt(q));
    return distToPerimeter <= tolerance;
  }

  // 2. Polígono (Ray-Casting para interior y distancia a aristas para perímetro)
  if (markup.type === 'polygon' && markup.points.length >= 3) {
    if (isPointInPolygon(point, markup.points)) {
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

  // 3. Polilínea abierta (PolyLine y PolylineMeasure)
  if ((markup.type === 'polyLine' || markup.type === 'polylineMeasure') && markup.points.length >= 2) {
    for (let i = 1; i < markup.points.length; i++) {
      if (distanceToSegment(point, markup.points[i - 1], markup.points[i]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  // Herramienta de Área (rectángulo o polígono cerrado)
  if (markup.type === 'area') {
    if (markup.points.length <= 2) {
      return (
        point.x >= bounds.x - tolerance &&
        point.x <= bounds.x + bounds.width + tolerance &&
        point.y >= bounds.y - tolerance &&
        point.y <= bounds.y + bounds.height + tolerance
      );
    } else {
      if (isPointInPolygon(point, markup.points)) {
        return true;
      }
      for (let i = 0, j = markup.points.length - 1; i < markup.points.length; j = i++) {
        if (distanceToSegment(point, markup.points[j], markup.points[i]) <= tolerance) {
          return true;
        }
      }
      return false;
    }
  }

  // Herramienta de Conteo (Count)
  if (markup.type === 'count' && markup.points.length >= 1) {
    const center = markup.points[0];
    const dist = Math.hypot(point.x - center.x, point.y - center.y);
    return dist <= tolerance + 0.025;
  }

  // 4. Trazo a mano alzada (Freehand con simplificación RDP si N > 50)
  if (markup.type === 'freehand' && markup.points.length >= 2) {
    const pts =
      markup.points.length > 50
        ? simplifyRamerDouglasPeucker(markup.points, tolerance)
        : markup.points;

    for (let i = 1; i < pts.length; i++) {
      if (distanceToSegment(point, pts[i - 1], pts[i]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  // 5. Rectángulo / Highlight / HighlightVector / HighlightText / Underline / StrikeOut / Stamp
  if (
    markup.type === 'rectangle' ||
    markup.type === 'highlight' ||
    markup.type === 'highlightVector' ||
    markup.type === 'highlightText' ||
    markup.type === 'underline' ||
    markup.type === 'strikeOut' ||
    markup.type === 'stamp' ||
    markup.type === 'link' ||
    markup.type === 'fileAttachment' ||
    markup.type === 'formField'
  ) {
    if (
      hasFill ||
      markup.type === 'stamp' ||
      markup.type === 'link' ||
      markup.type === 'fileAttachment' ||
      markup.type === 'formField' ||
      markup.type === 'highlight' ||
      markup.type === 'highlightVector' ||
      markup.type === 'highlightText' ||
      markup.type === 'underline' ||
      markup.type === 'strikeOut'
    ) {
      return (
        point.x >= bounds.x - tolerance &&
        point.x <= bounds.x + bounds.width + tolerance &&
        point.y >= bounds.y - tolerance &&
        point.y <= bounds.y + bounds.height + tolerance
      );
    }

    // Rectángulo hueco (solo contorno con tolerancia)
    const nearLeft = Math.abs(point.x - bounds.x) <= tolerance;
    const nearRight = Math.abs(point.x - (bounds.x + bounds.width)) <= tolerance;
    const nearTop = Math.abs(point.y - bounds.y) <= tolerance;
    const nearBottom = Math.abs(point.y - (bounds.y + bounds.height)) <= tolerance;

    const inYRange = point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.height + tolerance;
    const inXRange = point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.width + tolerance;

    return ((nearLeft || nearRight) && inYRange) || ((nearTop || nearBottom) && inXRange);
  }

  // Cota: línea de cota y líneas de referencia (ADR-0020)
  if (markup.type === 'dimension' && markup.points.length >= 2) {
    return dimensionSegmentsNormalized(markup.points, pageDimensions).some(
      ([a, b]) => distanceToSegment(point, a, b) <= tolerance
    );
  }

  // 5. Línea y Medida de Longitud (distanceToSegment)
  if ((markup.type === 'line' || markup.type === 'length') && markup.points.length >= 2) {
    return distanceToSegment(point, markup.points[0], markup.points[1]) <= tolerance;
  }

  // 6. Callout (delegación al inspector diferenciado de componentes)
  if (markup.type === 'callout') {
    return findCalloutComponentAtPoint(point, markup, tolerance) !== null;
  }

  // 7. Texto (interior de la caja)
  if (markup.type === 'text') {
    if (markup.points.length === 0) return false;
    const p1 = markup.points[0];
    const p2 = markup.points[1] || { x: p1.x + 0.1, y: p1.y + 0.03 };
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    return (
      point.x >= minX - tolerance &&
      point.x <= maxX + tolerance &&
      point.y >= minY - tolerance &&
      point.y <= maxY + tolerance
    );
  }

  // 8. StickyNote (caja del icono de tamaño estándar)
  if (markup.type === 'stickyNote') {
    if (markup.points.length === 0) return false;
    if (!pageDimensions) {
      throw new Error(`[hitTestMarkup] pageDimensions is required for 'stickyNote'`);
    }
    const p1 = markup.points[0];
    const size = getStickyNoteNormalizedSize(pageDimensions);
    return (
      point.x >= p1.x - tolerance &&
      point.x <= p1.x + size.width + tolerance &&
      point.y >= p1.y - tolerance &&
      point.y <= p1.y + size.height + tolerance
    );
  }

  // 9. Cloud / CloudPlus (Ray-casting sobre los vértices base coherente con A.1)
  if (markup.type === 'cloud' || markup.type === 'cloudPlus') {
    let baseVertices: MarkupPoint[];
    if (markup.points.length >= 3) {
      baseVertices = markup.points;
    } else if (markup.points.length === 2) {
      const p1 = markup.points[0];
      const p2 = markup.points[1];
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      baseVertices = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];
    } else {
      return false;
    }

    if (isPointInPolygon(point, baseVertices)) {
      return true;
    }

    // Perímetro sobre los vértices base
    for (let i = 0, j = baseVertices.length - 1; i < baseVertices.length; j = i++) {
      if (distanceToSegment(point, baseVertices[j], baseVertices[i]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  // CERO fallback return true: cualquier geometría o tipo no satisfecho retorna false
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

/**
 * Calcula un delta de traslación restringido para que todo el bounding box
 * de la marca permanezca estrictamente dentro de los límites de página normalizados [0, 1].
 * Garantiza consistencia con migrateBbxDocument (cero desplazamiento espurio al recargar).
 */
export function clampTranslationDelta(
  markup: Markup,
  delta: MarkupPoint,
  pageDimensions?: { width: number; height: number }
): MarkupPoint {
  if (!markup.points || markup.points.length === 0) {
    return { x: 0, y: 0 };
  }

  const bounds = getMarkupBounds(markup, pageDimensions);
  const minX = bounds.x;
  const maxX = bounds.x + bounds.width;
  const minY = bounds.y;
  const maxY = bounds.y + bounds.height;

  let clampedDx = delta.x;
  let clampedDy = delta.y;

  if (minX + clampedDx < 0) {
    clampedDx = -minX;
  }
  if (maxX + clampedDx > 1) {
    clampedDx = 1 - maxX;
  }

  if (minY + clampedDy < 0) {
    clampedDy = -minY;
  }
  if (maxY + clampedDy > 1) {
    clampedDy = 1 - maxY;
  }

  return { x: clampedDx, y: clampedDy };
}

/**
 * Calcula un delta de traslación compartido para un conjunto de marcas (selección simple o múltiple)
 * de modo que ninguna de ellas sobrepase los límites de página [0, 1].
 */
export function clampGroupTranslationDelta(
  markups: Markup[],
  delta: MarkupPoint,
  pageDimensions?: { width: number; height: number }
): MarkupPoint {
  if (markups.length === 0) return { x: 0, y: 0 };
  if (markups.length === 1) return clampTranslationDelta(markups[0], delta, pageDimensions);

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const m of markups) {
    const b = getMarkupBounds(m, pageDimensions);
    if (b.x < minX) minX = b.x;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y < minY) minY = b.y;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  let clampedDx = delta.x;
  let clampedDy = delta.y;

  if (minX + clampedDx < 0) clampedDx = -minX;
  if (maxX + clampedDx > 1) clampedDx = 1 - maxX;
  if (minY + clampedDy < 0) clampedDy = -minY;
  if (maxY + clampedDy > 1) clampedDy = 1 - maxY;

  return { x: clampedDx, y: clampedDy };
}

/**
 * Aplica una traslación normalizada a todos los puntos y directrices de una anotación,
 * asegurando mediante Math.max(0, Math.min(1, ...)) que cada coordenada final queda dentro de [0, 1].
 */
export function translateMarkup(
  markup: Markup,
  delta: MarkupPoint
): Markup {
  const newPoints = markup.points.map((p) => ({
    x: Math.max(0, Math.min(1, p.x + delta.x)),
    y: Math.max(0, Math.min(1, p.y + delta.y)),
  }));

  let newLeaders = markup.leaders;
  if (markup.leaders && Array.isArray(markup.leaders)) {
    newLeaders = markup.leaders.map((leader) =>
      leader.map((lp) => ({
        x: Math.max(0, Math.min(1, lp.x + delta.x)),
        y: Math.max(0, Math.min(1, lp.y + delta.y)),
      }))
    );
  }

  return {
    ...markup,
    points: newPoints,
    leaders: newLeaders,
  };
}
