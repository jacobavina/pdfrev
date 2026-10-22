import type { MarkupPoint } from '../../types/markup';

/**
 * Rejilla de la hoja (ADR-0106). Puro. El origen es la esquina superior izquierda de la página y el espaciado se da en
 * las unidades de la escala de la página (milímetros de papel si no está calibrada); aquí se pasa a puntos PDF.
 */

/** Separación mínima entre líneas de la rejilla automática, en píxeles de pantalla. */
export const GRID_MIN_PX = 48;
/** Separación mínima de una rejilla con espaciado elegido: por debajo se agrupan las líneas. */
const GRID_FLOOR_PX = 6;
/** Cada cuántas líneas hay una principal. */
export const GRID_MAJOR_EVERY = 5;

/** El menor 1, 2 o 5 × 10^k que no baja de `v`. */
export function niceStep(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const m = v / base;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Separación de la rejilla en puntos PDF.
 * - `spacing`: espaciado elegido en unidades de la escala, o null para automático (un 1, 2 o 5 × 10^k de la unidad
 *   que deje las líneas a no menos de 48 px).
 * - `scale`: unidades de la escala por punto PDF.
 * - `zoom`: píxeles por punto PDF.
 */
export function gridStepPt(spacing: number | null, scale: number, zoom: number): number {
  const unitsPerPt = scale > 0 ? scale : 1;
  const z = zoom > 0 ? zoom : 1;
  if (spacing && spacing > 0) {
    let pt = spacing / unitsPerPt;
    // Un espaciado diminuto a este zoom se agrupa en múltiplos para no llenar la hoja de líneas
    if (pt * z < GRID_FLOOR_PX) pt *= Math.ceil(GRID_FLOOR_PX / (pt * z));
    return pt;
  }
  return niceStep((GRID_MIN_PX / z) * unitsPerPt) / unitsPerPt;
}

export interface GridLines {
  /** Posiciones en puntos desde el borde izquierdo, y cuáles son principales. */
  xs: { at: number; major: boolean }[];
  /** Posiciones en puntos desde el borde superior. */
  ys: { at: number; major: boolean }[];
}

/** Líneas de la rejilla que caben en la página (nunca más de `maxLines` por eje). */
export function gridLines(widthPt: number, heightPt: number, stepPt: number, maxLines = 600): GridLines {
  const xs: GridLines['xs'] = [];
  const ys: GridLines['ys'] = [];
  if (!(stepPt > 0)) return { xs, ys };
  let step = stepPt;
  const longest = Math.max(widthPt, heightPt);
  if (longest / step > maxLines) step *= Math.ceil(longest / step / maxLines);
  for (let i = 0, x = 0; x <= widthPt + 1e-6; i++, x = i * step) xs.push({ at: x, major: i % GRID_MAJOR_EVERY === 0 });
  for (let i = 0, y = 0; y <= heightPt + 1e-6; i++, y = i * step) ys.push({ at: y, major: i % GRID_MAJOR_EVERY === 0 });
  return { xs, ys };
}

/** Punto normalizado llevado a la intersección más cercana de la rejilla. */
export function snapToGrid(pt: MarkupPoint, stepPt: number, dims: { width: number; height: number }): MarkupPoint {
  if (!(stepPt > 0) || !(dims.width > 0) || !(dims.height > 0)) return pt;
  const snap = (v: number, size: number) => Math.max(0, Math.min(1, (Math.round((v * size) / stepPt) * stepPt) / size));
  return { x: snap(pt.x, dims.width), y: snap(pt.y, dims.height) };
}
