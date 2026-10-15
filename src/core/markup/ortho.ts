import type { MarkupPoint } from '../../types/markup';

/**
 * Trazo ortogonal con Shift (ADR-0047), como en Revu y AutoCAD: el punto se lleva a la horizontal o a la vertical que
 * pasa por el punto anterior del trazo, la más cercana al cursor. Puro: coordenadas normalizadas y el tamaño de la
 * página para comparar las dos direcciones en la misma unidad.
 */

/** Herramientas de trazo que se enderezan con Shift (las de caja y la mano alzada no). */
export const ORTHO_TOOLS = new Set<string>([
  'line',
  'arrow',
  'dimension',
  'length',
  'polyLine',
  'polylineMeasure',
  'polygon',
  'area',
  'perimeter',
  'volume',
  'cloud',
  'cloudPlus',
  'radius',
  'diameter',
  'calibrate',
]);

export function orthoConstrain(
  anchor: MarkupPoint,
  pt: MarkupPoint,
  dims: { width: number; height: number }
): MarkupPoint {
  const dx = (pt.x - anchor.x) * dims.width;
  const dy = (pt.y - anchor.y) * dims.height;
  return Math.abs(dx) >= Math.abs(dy) ? { x: pt.x, y: anchor.y } : { x: anchor.x, y: pt.y };
}
