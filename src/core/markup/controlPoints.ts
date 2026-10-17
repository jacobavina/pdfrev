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
  // Count de Revu (ADR-0063): un tirador en cada símbolo, que lo mueve solo a él; el conteo sigue siendo uno
  if (markup.type === 'count' && markup.customFields?.countSymbol && pts?.length) return pts.map((p) => ({ ...p }));
  if (!pts || pts.length < 2) return null;
  if ((BOX_TYPES.has(markup.type) || POLYGONIZABLE_TYPES.has(markup.type)) && pts.length === 2) {
    return corners(pts[0], pts[1]);
  }
  // Caja del callout (ADR-0042), como en Revu: esquinas y centro de cada lado (arriba, derecha, abajo, izquierda)
  if (markup.type === 'callout' && pts.length >= 2) {
    const c = corners(pts[0], pts[1]);
    const mid = (a: MarkupPoint, b: MarkupPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return [...c, mid(c[0], c[1]), mid(c[1], c[2]), mid(c[2], c[3]), mid(c[3], c[0])];
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
  if (markup.type === 'callout' && pts.length >= 2) {
    const c = corners(pts[0], pts[1]);
    if (index < 4) {
      const opposite = c[(index + 2) % 4];
      return [
        { x: Math.min(opposite.x, t.x), y: Math.min(opposite.y, t.y) },
        { x: Math.max(opposite.x, t.x), y: Math.max(opposite.y, t.y) },
      ];
    }
    // Centro de un lado: solo se mueve ese lado
    let [x0, y0, x1, y1] = [c[0].x, c[0].y, c[2].x, c[2].y];
    if (index === 4) y0 = Math.min(t.y, y1);
    else if (index === 5) x1 = Math.max(t.x, x0);
    else if (index === 6) y1 = Math.max(t.y, y0);
    else x0 = Math.min(t.x, x1);
    return [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ];
  }
  if (markup.type === 'length' && pts.length === 2 && index === 2) return [{ ...pts[0] }, { ...pts[1] }, t];
  return pts.map((p, i) => (i === index ? t : { ...p }));
}

/** Forma del tirador, como en Revu: cuadro en el centro de los lados de la caja del callout, círculo en el resto. */
export function controlPointShape(markup: Pick<Markup, 'type'>, index: number): 'circle' | 'square' {
  return markup.type === 'callout' && index >= 4 ? 'square' : 'circle';
}

/**
 * Miembro que editan los puntos de control según la selección (ADR-0069):
 * - exactamente una marca seleccionada → esa marca (comportamiento actual);
 * - una selección que es exactamente UN grupo (todas las marcas comparten el mismo groupId) → el miembro
 *   redimensionable del grupo: la nube (cloud o cloudPlus); la llamada queda fija y su directriz no se mueve;
 * - cualquier otra selección (varios grupos, marcas sueltas o un grupo sin nube) → null: sin tiradores.
 */
export function editableControlPointTarget(selection: Markup[]): Markup | null {
  if (selection.length === 0) return null;
  if (selection.length === 1) return selection[0];
  const gid = selection[0].groupId;
  if (!gid || !selection.every((m) => m.groupId === gid)) return null;
  return selection.find((m) => m.type === 'cloud' || m.type === 'cloudPlus') ?? null;
}