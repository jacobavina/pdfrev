import type { MarkupPoint } from '../../types/markup';

/**
 * Trazo restringido con Shift (ADR-0047/0048), como en Revu y Acrobat:
 * - en los trazos de puntos, el segmento desde el punto anterior se ajusta a la dirección más cercana múltiplo de
 *   45° (horizontal, vertical o diagonal);
 * - en las cajas (rectángulo, elipse, nube rectangular) el arrastre forma un cuadrado o un círculo.
 * Puro: coordenadas normalizadas y el tamaño de la página para trabajar en la misma unidad en ambos ejes.
 */

/** Herramientas de trazo de puntos que se ajustan a 45° con Shift. */
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
  'polygonCutout',
]);

/** Herramientas de caja que con Shift dibujan un cuadrado (o un círculo). */
export const SQUARE_TOOLS = new Set<string>(['rectangle', 'circle', 'cloud', 'cloudPlus']);

const STEP = Math.PI / 4;

/** Lleva `pt` a la recta por `anchor` con el ángulo múltiplo de 45° más cercano (proyección ortogonal). */
export function orthoConstrain(
  anchor: MarkupPoint,
  pt: MarkupPoint,
  dims: { width: number; height: number }
): MarkupPoint {
  const dx = (pt.x - anchor.x) * dims.width;
  const dy = (pt.y - anchor.y) * dims.height;
  if (dx === 0 && dy === 0) return { ...pt };
  const angle = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
  const ux = Math.round(Math.cos(angle) * 1e12) / 1e12;
  const uy = Math.round(Math.sin(angle) * 1e12) / 1e12;
  const len = dx * ux + dy * uy;
  return { x: anchor.x + (ux * len) / dims.width, y: anchor.y + (uy * len) / dims.height };
}

/** Esquina opuesta de un cuadrado desde `start` hacia el cursor (el lado mayor de los dos manda). */
export function squareConstrain(
  start: MarkupPoint,
  pt: MarkupPoint,
  dims: { width: number; height: number }
): MarkupPoint {
  const dx = (pt.x - start.x) * dims.width;
  const dy = (pt.y - start.y) * dims.height;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + ((dx < 0 ? -1 : 1) * side) / dims.width,
    y: start.y + ((dy < 0 ? -1 : 1) * side) / dims.height,
  };
}
