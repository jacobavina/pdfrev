import { Markup, MarkupPoint } from '../../types/markup';
import type { ContentSnapIndex } from './contentSnap';

/**
 * Snap (ADR-0025), como la sección Snap de Foxit y Revu: al dibujar o medir, el cursor se ajusta a los extremos,
 * a los puntos medios o al punto más cercano de las marcas existentes. Puro: trabaja en píxeles de la página para
 * que la tolerancia sea la misma a cualquier zoom.
 */

export interface SnapModes {
  endpoint: boolean;
  midpoint: boolean;
  nearest: boolean;
  /** Cruce de dos líneas (ADR-0031). */
  intersection?: boolean;
  /** Ajustar también a los trazos del plano ("Snap to Content" de Revu, ADR-0031). */
  content?: boolean;
}

export type SnapKind = 'endpoint' | 'midpoint' | 'nearest' | 'intersection';

/** Máximo de segmentos cercanos que se cruzan entre sí para buscar intersecciones (coste cuadrático). */
const MAX_INTERSECTION_SEGMENTS = 300;

export interface SnapResult {
  point: MarkupPoint;
  kind: SnapKind;
}

type Seg = [MarkupPoint, MarkupPoint];

/** Vértices y segmentos de una marca (normalizados) que admiten snap. */
export function snapGeometry(markup: Markup): { vertices: MarkupPoint[]; segments: Seg[] } {
  const p = markup.points ?? [];
  const closedPoly = (pts: MarkupPoint[]): Seg[] => pts.map((a, i) => [a, pts[(i + 1) % pts.length]] as Seg);
  const openPoly = (pts: MarkupPoint[]): Seg[] => pts.slice(1).map((b, i) => [pts[i], b] as Seg);
  switch (markup.type) {
    case 'line':
    case 'length':
    case 'dimension':
    case 'radius':
    case 'diameter':
      return p.length >= 2 ? { vertices: [p[0], p[1]], segments: [[p[0], p[1]]] } : { vertices: [], segments: [] };
    case 'polyLine':
    case 'polylineMeasure':
    case 'angle':
      return { vertices: p, segments: openPoly(p) };
    case 'perimeter':
    case 'volume':
      return p.length >= 3 ? { vertices: p, segments: closedPoly(p) } : { vertices: p, segments: openPoly(p) };
    case 'polygon':
    case 'area':
    case 'cloud':
    case 'cloudPlus':
    case 'rectangle':
    case 'highlightVector': {
      if (p.length === 2) {
        const [a, b] = p;
        const c = [
          { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
          { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
          { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
          { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
        ];
        return { vertices: c, segments: closedPoly(c) };
      }
      return p.length >= 3 ? { vertices: p, segments: closedPoly(p) } : { vertices: p, segments: [] };
    }
    case 'count':
      return { vertices: markup.customFields?.countSymbol ? p : p.slice(0, 1), segments: [] };
    default:
      return { vertices: [], segments: [] };
  }
}

/**
 * Punto ajustado más cercano dentro de `thresholdPx`, con prioridad extremo > punto medio > más cercano (como en
 * los editores CAD: un extremo cercano gana aunque una arista pase más cerca).
 */
export function snapPoint(
  pt: MarkupPoint,
  markups: Markup[],
  pagePx: { width: number; height: number },
  modes: SnapModes,
  thresholdPx = 8,
  content?: ContentSnapIndex | null
): SnapResult | null {
  if (!modes.endpoint && !modes.midpoint && !modes.nearest && !modes.intersection) return null;
  const W = pagePx.width || 1;
  const H = pagePx.height || 1;
  const distPx = (a: MarkupPoint, b: MarkupPoint) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
  let best: { r: SnapResult; d: number; rank: number } | null = null;
  const consider = (point: MarkupPoint, kind: SnapKind, rank: number) => {
    const d = distPx(pt, point);
    if (d > thresholdPx) return;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { r: { point, kind }, d, rank };
  };
  // Geometría candidata: la de las marcas y, si está activo, la del plano cercana al cursor
  const groups: { vertices: MarkupPoint[]; segments: Seg[] }[] = markups.map(snapGeometry);
  if (content && modes.content !== false && content.size > 0) {
    const near = content.near(pt, thresholdPx / W, thresholdPx / H);
    groups.push({ vertices: near.flatMap(([a, b]) => [a, b]), segments: near });
  }
  if (modes.intersection) {
    // Solo los segmentos que pasan cerca del cursor pueden cruzarse dentro de la tolerancia
    const close: Seg[] = [];
    for (const g of groups) {
      for (const sg of g.segments) {
        if (distToSegPx(pt, sg, W, H) <= thresholdPx) close.push(sg);
        if (close.length >= MAX_INTERSECTION_SEGMENTS) break;
      }
    }
    for (let i = 0; i < close.length; i++) {
      for (let j = i + 1; j < close.length; j++) {
        const x = intersect(close[i], close[j]);
        if (x) consider(x, 'intersection', 0);
      }
    }
  }
  for (const g of groups) {
    if (modes.endpoint) for (const v of g.vertices) consider(v, 'endpoint', 0);
    if (modes.midpoint) {
      for (const [a, b] of g.segments) consider({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint', 1);
    }
    if (modes.nearest) {
      for (const [a, b] of g.segments) {
        // Proyección en píxeles (el espacio normalizado no es isótropo)
        const ax = a.x * W;
        const ay = a.y * H;
        const bx = b.x * W;
        const by = b.y * H;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-9) continue;
        const t = Math.max(0, Math.min(1, ((pt.x * W - ax) * dx + (pt.y * H - ay) * dy) / len2));
        consider({ x: (ax + t * dx) / W, y: (ay + t * dy) / H }, 'nearest', 2);
      }
    }
  }
  return best ? (best as { r: SnapResult }).r : null;
}

/** Distancia en píxeles de un punto a un segmento normalizado. */
function distToSegPx(p: MarkupPoint, [a, b]: Seg, W: number, H: number): number {
  const ax = a.x * W;
  const ay = a.y * H;
  const dx = b.x * W - ax;
  const dy = b.y * H - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x * W - ax) * dx + (p.y * H - ay) * dy) / len2));
  return Math.hypot(p.x * W - (ax + t * dx), p.y * H - (ay + t * dy));
}

/** Cruce de dos segmentos (incluidos sus extremos), o null si son paralelos o no se tocan. */
function intersect([a, b]: Seg, [c, d]: Seg): MarkupPoint | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}
