/**
 * Festón de nube de revisión estilo Revu (ADR-0021): cada lóbulo es un arco circular de 200° (algo más que una
 * semicircunferencia, así los lóbulos se solapan y forman la cúspide característica). Pura: devuelve un trazado
 * SVG con M/C/Z en el espacio de página visual (pt, y hacia abajo) que la pantalla, el /AP y el aplanado
 * convierten a su sistema; así la nube es la misma en REA, Revu y Acrobat.
 *
 * - `step`: longitud aproximada de la cuerda de cada lóbulo (pt). En la interfaz, "Tamaño" = step / 10.
 * - `invert`: lóbulos hacia dentro (las cúspides quedan hacia fuera), como la opción Invertir de Revu.
 */

export interface CloudPt {
  x: number;
  y: number;
}

export const CLOUD_ARC_SWEEP = (200 * Math.PI) / 180;
export const CLOUD_SIZE_FACTOR = 10; // Tamaño 2.0 ↔ 20 pt por lóbulo
export const DEFAULT_CLOUD_STEP = 20;

/** Vértices del contorno: caja de 2 puntos → 4 esquinas; si no, los puntos tal cual. */
export function cloudOutline(points: CloudPt[]): CloudPt[] {
  if (points.length === 2) {
    const [a, b] = points;
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
  }
  return points;
}

const f = (n: number) => n.toFixed(2);

/**
 * Trazado de la nube sobre un contorno ya en unidades de página (pt o píxeles, y hacia abajo).
 */
export function revisionCloudPath(outline: CloudPt[], step: number, invert = false): string {
  const n = outline.length;
  if (n < 2 || !(step > 0)) return '';
  // Orientación: área con signo (>0 = horario en y hacia abajo)
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    area2 += a.x * b.y - b.x * a.y;
  }
  const cw = area2 >= 0;

  let d = '';
  const half = CLOUD_ARC_SWEEP / 2;
  const segments = 3; // 200° en 3 cúbicas de ~67°
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    // Normal exterior (horario en y hacia abajo: exterior a la izquierda del avance)
    let nx = cw ? dy / len : -dy / len;
    let ny = cw ? -dx / len : dx / len;
    if (invert) {
      nx = -nx;
      ny = -ny;
    }
    const arcs = Math.max(1, Math.round(len / step));
    const chord = len / arcs;
    const r = chord / (2 * Math.sin(half));
    const centerOffset = -r * Math.cos(half); // > 0 para barridos de más de 180°: el centro sale hacia fuera
    for (let j = 0; j < arcs; j++) {
      const s = { x: a.x + (dx * j) / arcs, y: a.y + (dy * j) / arcs };
      const e = { x: a.x + (dx * (j + 1)) / arcs, y: a.y + (dy * (j + 1)) / arcs };
      if (d === '') d = `M ${f(s.x)} ${f(s.y)}`;
      const c = { x: (s.x + e.x) / 2 + nx * centerOffset, y: (s.y + e.y) / 2 + ny * centerOffset };
      const t0 = Math.atan2(s.y - c.y, s.x - c.x);
      const apex = Math.atan2(ny, nx);
      // Sentido de giro que pasa por el vértice exterior del lóbulo
      const norm = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
      const sign = Math.abs(norm(t0 + half - apex)) < Math.abs(norm(t0 - half - apex)) ? 1 : -1;
      const phi = (sign * CLOUD_ARC_SWEEP) / segments;
      const k = (4 / 3) * Math.tan(phi / 4) * r;
      for (let m = 0; m < segments; m++) {
        const u0 = t0 + phi * m;
        const u1 = u0 + phi;
        const p0 = { x: c.x + r * Math.cos(u0), y: c.y + r * Math.sin(u0) };
        const p3 = m === segments - 1 ? e : { x: c.x + r * Math.cos(u1), y: c.y + r * Math.sin(u1) };
        const p1 = { x: p0.x - k * Math.sin(u0), y: p0.y + k * Math.cos(u0) };
        const p2 = { x: c.x + r * Math.cos(u1) + k * Math.sin(u1), y: c.y + r * Math.sin(u1) - k * Math.cos(u1) };
        d += ` C ${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`;
      }
    }
  }
  return d ? `${d} Z` : '';
}

/** Nube a partir de puntos normalizados y el tamaño de la página (o del área en pantalla). */
export function revisionCloudPathNormalized(
  points: CloudPt[],
  size: { width: number; height: number },
  step: number,
  invert = false
): string {
  const outline = cloudOutline(points).map((p) => ({ x: p.x * size.width, y: p.y * size.height }));
  return revisionCloudPath(outline, step, invert);
}

/** Paso (pt) e inversión guardados en la marca. */
export function cloudParams(customFields: Record<string, unknown> | undefined, defaultStep: number) {
  const step = typeof customFields?.arcStep === 'number' && customFields.arcStep > 0 ? customFields.arcStep : defaultStep;
  const invert = customFields?.cloudInvert === 1 || customFields?.cloudInvert === '1';
  return { step, invert };
}
