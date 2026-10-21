/**
 * Comparación de dos revisiones de una página (ADR-0091). Puro: trabaja sobre píxeles RGBA ya rasterizados.
 *
 * 1. Marca las celdas de una rejilla donde algún píxel difiere más que el umbral.
 * 2. Dilata la máscara para unir trazos cercanos del mismo cambio.
 * 3. Agrupa las celdas en componentes conexas y devuelve la caja de cada una, normalizada a la hoja (0..1).
 */

export interface CompareOptions {
  /** Diferencia mínima de luminancia (0..255) para considerar que un píxel cambió. */
  threshold?: number;
  /** Lado de la celda de la rejilla, en píxeles. */
  cell?: number;
  /** Celdas que se dilata la máscara para unir trazos cercanos. */
  dilate?: number;
  /** Celdas mínimas de un grupo para contarlo (descarta ruido de antialiasing). */
  minCells?: number;
  /** Margen que se añade a cada caja, en píxeles. */
  padding?: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULTS: Required<CompareOptions> = { threshold: 48, cell: 8, dilate: 2, minCells: 2, padding: 6 };

const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Máscara de celdas con cambios. `a` y `b` deben tener el mismo tamaño. */
export function diffMask(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  opts: CompareOptions = {}
): { mask: Uint8Array; cols: number; rows: number } {
  const { threshold, cell } = { ...DEFAULTS, ...opts };
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const mask = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const rowBase = Math.floor(y / cell) * cols;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(luma(a, i) - luma(b, i)) > threshold) mask[rowBase + Math.floor(x / cell)] = 1;
    }
  }
  return { mask, cols, rows };
}

/** Dilata la máscara `radius` celdas en cuadrado. */
export function dilateMask(mask: Uint8Array, cols: number, rows: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!mask[y * cols + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out[ny * cols + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Componentes conexas (4 vecinos) de la máscara: caja en celdas y número de celdas de cada una. */
export function connectedBoxes(
  mask: Uint8Array,
  cols: number,
  rows: number
): { x0: number; y0: number; x1: number; y1: number; cells: number }[] {
  const seen = new Uint8Array(mask.length);
  const boxes: { x0: number; y0: number; x1: number; y1: number; cells: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const box = { x0: cols, y0: rows, x1: -1, y1: -1, cells: 0 };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % cols;
      const y = (idx - x) / cols;
      box.cells++;
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x > box.x1) box.x1 = x;
      if (y > box.y1) box.y1 = y;
      const next = [x > 0 ? idx - 1 : -1, x < cols - 1 ? idx + 1 : -1, y > 0 ? idx - cols : -1, y < rows - 1 ? idx + cols : -1];
      for (const n of next) {
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    boxes.push(box);
  }
  return boxes;
}

/**
 * Regiones que cambiaron entre dos rasterizaciones del mismo tamaño, normalizadas a la hoja y ordenadas de arriba
 * abajo y de izquierda a derecha.
 */
export function compareRasters(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  opts: CompareOptions = {}
): NormalizedRect[] {
  const o = { ...DEFAULTS, ...opts };
  const { mask, cols, rows } = diffMask(a, b, width, height, o);
  // Los grupos se cuentan sobre la máscara sin dilatar, para que el ruido suelto no se cuele al unirse
  const dilated = dilateMask(mask, cols, rows, o.dilate);
  const rects: NormalizedRect[] = [];
  for (const box of connectedBoxes(dilated, cols, rows)) {
    let real = 0;
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) real += mask[y * cols + x];
    if (real < o.minCells) continue;
    const px0 = Math.max(0, box.x0 * o.cell - o.padding);
    const py0 = Math.max(0, box.y0 * o.cell - o.padding);
    const px1 = Math.min(width, (box.x1 + 1) * o.cell + o.padding);
    const py1 = Math.min(height, (box.y1 + 1) * o.cell + o.padding);
    rects.push({ x: px0 / width, y: py0 / height, width: (px1 - px0) / width, height: (py1 - py0) / height });
  }
  return rects.sort((p, q) => p.y - q.y || p.x - q.x);
}
