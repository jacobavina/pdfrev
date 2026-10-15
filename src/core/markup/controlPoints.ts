import { Markup, MarkupPoint } from '../../types/markup';

/**
 * Puntos de control (ADR-0021), como los tiradores amarillos de Revu: arrastrar uno cambia la forma de la marca.
 * Puro: sin React ni DOM. Coordenadas normalizadas 0..1.
 */

/** Tipos definidos por su caja (2 puntos): se editan por sus cuatro esquinas. */
const BOX_TYPES = new Set(['rectangle', 'circle', 'highlightVector']);
/** Tipos cuya caja de 2 puntos se convierte en polígono al editar un vértice (la nube cambia de forma). */
const POLYGONIZABLE_TYPES = new Set(['cloud', 'cloudPlus', 'area']);
/** Tipos cuyos puntos son directamente sus vértices. */
const VERTEX_TYPES = new Set([
  'line', 'length', 'dimension', 'polygon', 'polyLine', 'polylineMeasure', 'cloud', 'cloudPlus', 'area',
  'perimeter', 'volume', 'angle', 'radius', 'diameter',
]);

const corners = (a: MarkupPoint, b: MarkupPoint): MarkupPoint[] => {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
};

/** Puntos de control visibles de una marca, o null si no se edita por vértices. */
export function controlPointsOf(markup: Markup): MarkupPoint[] | null {
  const pts = markup.points;
  if (!pts || pts.length < 2) return null;
  if ((BOX_TYPES.has(markup.type) || POLYGONIZABLE_TYPES.has(markup.type)) && pts.length === 2) {
    return corners(pts[0], pts[1]);
  }
  // Distancia sin desplazar (ADR-0035): un tercer tirador en el centro mueve la línea en paralelo (crea sus guías)
  if (markup.type === 'length' && pts.length === 2) {
    return [{ ...pts[0] }, { ...pts[1] }, { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }];
  }
  if (VERTEX_TYPES.has(markup.type)) return pts.map((p) => ({ ...p }));
  return null;
}

const clamp01 = (p: MarkupPoint): MarkupPoint => ({
  x: Math.max(0, Math.min(1, p.x)),
  y: Math.max(0, Math.min(1, p.y)),
});

/** Nuevos puntos de la marca tras llevar el punto de control `index` a `target`. */
export function applyControlPointDrag(markup: Markup, index: number, target: MarkupPoint): MarkupPoint[] {
  const pts = markup.points;
  const t = clamp01(target);
  if (pts.length === 2 && BOX_TYPES.has(markup.type)) {
    // Esquina opuesta fija: la caja se redimensiona como en cualquier editor
    const c = corners(pts[0], pts[1]);
    const opposite = c[(index + 2) % 4];
    return [
      { x: Math.min(opposite.x, t.x), y: Math.min(opposite.y, t.y) },
      { x: Math.max(opposite.x, t.x), y: Math.max(opposite.y, t.y) },
    ];
  }
  if (pts.length === 2 && POLYGONIZABLE_TYPES.has(markup.type)) {
    // Nube rectangular → nube poligonal de 4 vértices con el vértice arrastrado en su nueva posición
    const c = corners(pts[0], pts[1]);
    c[index] = t;
    return c;
  }
  if (markup.type === 'length' && pts.length === 2 && index === 2) return [{ ...pts[0] }, { ...pts[1] }, t];
  return pts.map((p, i) => (i === index ? t : { ...p }));
}
