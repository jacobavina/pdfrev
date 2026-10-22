import type { Markup, MarkupPoint } from '../../types/markup';
import { markupBounds, type Bounds } from './transformHandles';

/**
 * Lasso (ADR-0110): selección con una forma libre. Una marca queda elegida cuando el lazo toca su caja envolvente,
 * igual que el marco elástico de Select. Puro; las coordenadas son las normalizadas de la página.
 */

/** Distancia mínima entre dos puntos del lazo (en coordenadas normalizadas) para no acumular ruido. */
export const LASSO_MIN_STEP = 0.002;

/** Un lazo necesita al menos tres puntos y algo de área para elegir algo. */
export function isUsableLasso(poly: MarkupPoint[]): boolean {
  return poly.length >= 3 && Math.abs(polygonArea(poly)) > 1e-7;
}

function polygonArea(poly: MarkupPoint[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Punto dentro del polígono (par-impar). */
export function pointInPolygon(pt: MarkupPoint, poly: MarkupPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const cross = (o: MarkupPoint, a: MarkupPoint, b: MarkupPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function segmentsIntersect(p1: MarkupPoint, p2: MarkupPoint, p3: MarkupPoint, p4: MarkupPoint): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** El polígono toca el rectángulo: un vértice dentro de la caja, una esquina dentro del polígono o un lado que lo cruza. */
export function polygonTouchesBounds(poly: MarkupPoint[], b: Bounds): boolean {
  if (poly.some((p) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY)) return true;
  const corners: MarkupPoint[] = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
  if (corners.some((c) => pointInPolygon(c, poly))) return true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const z = poly[(i + 1) % poly.length];
    for (let k = 0; k < 4; k++) if (segmentsIntersect(a, z, corners[k], corners[(k + 1) % 4])) return true;
  }
  return false;
}

/** Ids de las marcas que el lazo toca. */
export function lassoSelect(markups: Markup[], poly: MarkupPoint[]): string[] {
  if (!isUsableLasso(poly)) return [];
  const ids: string[] = [];
  for (const m of markups) {
    const b = markupBounds(m);
    if (b && polygonTouchesBounds(poly, b)) ids.push(m.id);
  }
  return ids;
}
