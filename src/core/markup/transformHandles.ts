import { Markup, MarkupPoint } from '../../types/markup';

/**
 * Tiradores de transformación (ADR-0039), como los de Revu: cuadros en las esquinas de la caja para escalar y un
 * círculo sobre ella para rotar. Puro: coordenadas normalizadas 0..1; la rotación trabaja en pt de página para no
 * deformar (el espacio normalizado no es isótropo).
 */

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Caja de los puntos y las directrices de una marca. */
export function markupBounds(markup: Pick<Markup, 'points' | 'leaders'>): Bounds | null {
  const pts = [...markup.points, ...(markup.leaders ?? []).flat()];
  if (pts.length === 0) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** Esquinas de la caja: 0 arriba-izquierda, 1 arriba-derecha, 2 abajo-derecha, 3 abajo-izquierda. */
export function boundsCorners(b: Bounds): MarkupPoint[] {
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
}

/**
 * Tipos que se escalan con la caja (todo lo que se define por puntos, salvo los de un solo punto). La llamada tiene
 * sus propios tiradores (punta de flecha y "+"): un cuadro de esquina caería sobre su punta.
 */
export function canScale(markup: Pick<Markup, 'type' | 'points'>): boolean {
  if (markup.points.length < 2) return false;
  return !['count', 'stickyNote', 'callout'].includes(markup.type);
}

/**
 * Tipos que se pueden girar sin deformarse: los definidos por sus vértices. Los de caja (rectángulo, elipse, textos,
 * sellos, campos) quedan fuera; nube y área rectangulares se giran pasando a polígono.
 */
export function canRotate(markup: Pick<Markup, 'type' | 'points'>): boolean {
  const vertexTypes = new Set([
    'line', 'polyLine', 'polygon', 'polylineMeasure', 'perimeter', 'volume', 'angle', 'length', 'dimension',
    'freehand', 'radius', 'diameter', 'cloud', 'cloudPlus', 'area',
  ]);
  return vertexTypes.has(markup.type) && markup.points.length >= 2;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Escala respecto a la esquina opuesta a `corner` para llevar esa esquina a `target`. Con `uniform` mantiene la
 * proporción. Devuelve puntos y directrices nuevos.
 */
export function scaleMarkup(
  markup: Pick<Markup, 'points' | 'leaders'>,
  corner: number,
  target: MarkupPoint,
  uniform = false
): { points: MarkupPoint[]; leaders?: MarkupPoint[][] } {
  const b = markupBounds(markup)!;
  const corners = boundsCorners(b);
  const anchor = corners[(corner + 2) % 4];
  const from = corners[corner];
  const dx = from.x - anchor.x;
  const dy = from.y - anchor.y;
  let fx = Math.abs(dx) > 1e-9 ? (target.x - anchor.x) / dx : 1;
  let fy = Math.abs(dy) > 1e-9 ? (target.y - anchor.y) / dy : 1;
  if (uniform) {
    const f = Math.max(Math.abs(fx), Math.abs(fy));
    fx = f * Math.sign(fx || 1);
    fy = f * Math.sign(fy || 1);
  }
  const map = (p: MarkupPoint) => ({ x: clamp01(anchor.x + (p.x - anchor.x) * fx), y: clamp01(anchor.y + (p.y - anchor.y) * fy) });
  return {
    points: markup.points.map(map),
    ...(markup.leaders ? { leaders: markup.leaders.map((l) => l.map(map)) } : {}),
  };
}

/** Puntos que se giran: las nubes y áreas rectangulares (2 puntos) pasan a sus cuatro esquinas. */
export function rotatablePoints(markup: Pick<Markup, 'type' | 'points'>): MarkupPoint[] {
  if ((markup.type === 'cloud' || markup.type === 'cloudPlus' || markup.type === 'area') && markup.points.length === 2) {
    const [a, b] = markup.points;
    return boundsCorners({ minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) });
  }
  return markup.points.map((p) => ({ ...p }));
}

/** Gira `angle` radianes (sentido horario en pantalla) alrededor del centro de la caja, en pt de página. */
export function rotateMarkup(
  markup: Pick<Markup, 'type' | 'points' | 'leaders'>,
  angle: number,
  pageDims: { width: number; height: number }
): { points: MarkupPoint[]; leaders?: MarkupPoint[][] } {
  const b = markupBounds(markup)!;
  const cx = ((b.minX + b.maxX) / 2) * pageDims.width;
  const cy = ((b.minY + b.maxY) / 2) * pageDims.height;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const map = (p: MarkupPoint) => {
    const x = p.x * pageDims.width - cx;
    const y = p.y * pageDims.height - cy;
    return { x: clamp01((cx + x * cos - y * sin) / pageDims.width), y: clamp01((cy + x * sin + y * cos) / pageDims.height) };
  };
  return {
    points: rotatablePoints(markup).map(map),
    ...(markup.leaders ? { leaders: markup.leaders.map((l) => l.map(map)) } : {}),
  };
}

/** Ángulo de rotación ajustado a pasos de 15° con Mayús. */
export function snapAngle(angle: number, snap: boolean): number {
  if (!snap) return angle;
  const step = Math.PI / 12;
  return Math.round(angle / step) * step;
}
