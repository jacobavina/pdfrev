/**
 * Nube de revisión como la de Revu (ADR-0021, rehecha en ADR-0041). Cada lóbulo es un círculo centrado sobre el
 * contorno: en cada vértice y a intervalos regulares a lo largo de cada lado. Se dibuja la parte exterior de cada
 * círculo, desde su corte con el anterior hasta su corte con el siguiente, y el arco sigue un poco dentro del
 * lóbulo siguiente: el "gancho" que da a la nube de Revu su aspecto de festón superpuesto. Pura: devuelve un
 * trazado SVG con M/C/Z en el espacio de página visual (pt, y hacia abajo) que la pantalla, el /AP y el aplanado
 * convierten a su sistema; así la nube es la misma en REA, Revu y Acrobat.
 *
 * - `step`: distancia máxima entre centros de lóbulos (pt). En la interfaz, "Size" = step / 10.
 * - `invert`: lóbulos hacia dentro, como la opción Invert de Revu.
 * - El gancho sale y vuelve sobre el mismo arco: no añade área, así el relleno no cambia.
 */

export interface CloudPt {
  x: number;
  y: number;
}

export const CLOUD_SIZE_FACTOR = 10; // Size 2.0 ↔ 20 pt entre lóbulos
export const DEFAULT_CLOUD_STEP = 20;
/** Radio de cada lóbulo respecto al paso: > 0.5 para que los círculos vecinos siempre se corten. */
export const CLOUD_RADIUS_FACTOR = 0.62;
/** Ángulo del gancho que entra en el lóbulo siguiente. */
export const CLOUD_TAIL = (22 * Math.PI) / 180;

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
const TAU = Math.PI * 2;
const mod2pi = (a: number) => ((a % TAU) + TAU) % TAU;

/** Radio de los lóbulos para un paso dado. */
export function cloudRadius(step: number): number {
  return step * CLOUD_RADIUS_FACTOR;
}

/** Centros de los lóbulos: los vértices y puntos intermedios a no más de `step`; se descartan los casi repetidos. */
export function cloudCenters(pts: CloudPt[], closed: boolean, step: number): CloudPt[] {
  const n = pts.length;
  const raw: CloudPt[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const arcs = Math.max(1, Math.ceil(len / step - 1e-6));
    for (let j = 0; j < arcs; j++) raw.push({ x: a.x + ((b.x - a.x) * j) / arcs, y: a.y + ((b.y - a.y) * j) / arcs });
  }
  if (!closed && n > 0) raw.push(pts[n - 1]);
  const minGap = step * 0.2;
  const kept: CloudPt[] = [];
  for (const c of raw) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(c.x - last.x, c.y - last.y) >= minGap) kept.push(c);
    else if (!closed && c === raw[raw.length - 1]) kept[kept.length - 1] = c; // el extremo final manda
  }
  if (closed && kept.length > 2) {
    const a = kept[kept.length - 1];
    if (Math.hypot(a.x - kept[0].x, a.y - kept[0].y) < minGap) kept.pop();
  }
  return kept;
}

/** Arco circular en cúbicas (≤ 90° cada una) desde el ángulo `t0`, con barrido con signo `delta`. */
function arcCubics(c: CloudPt, r: number, t0: number, delta: number): string {
  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const phi = delta / n;
  const k = (4 / 3) * Math.tan(phi / 4) * r;
  let d = '';
  for (let m = 0; m < n; m++) {
    const u0 = t0 + phi * m;
    const u1 = u0 + phi;
    const p1 = { x: c.x + r * Math.cos(u0) - k * Math.sin(u0), y: c.y + r * Math.sin(u0) + k * Math.cos(u0) };
    const p2 = { x: c.x + r * Math.cos(u1) + k * Math.sin(u1), y: c.y + r * Math.sin(u1) - k * Math.cos(u1) };
    const p3 = { x: c.x + r * Math.cos(u1), y: c.y + r * Math.sin(u1) };
    d += ` C ${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`;
  }
  return d;
}

/**
 * Trazado de la nube sobre un contorno (cerrado o abierto) en unidades de página (pt o píxeles, y hacia abajo).
 * En un contorno abierto (línea o polilínea con tipo de línea Cloud) los lóbulos salen a la izquierda del avance.
 */
export function cloudPathFromOutline(pts: CloudPt[], closed: boolean, step: number, invert = false): string {
  if (pts.length < 2 || !(step > 0)) return '';
  // Lado exterior: horario en y hacia abajo (área con signo > 0) → exterior a la izquierda del avance
  let side = 1;
  if (closed) {
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area2 += a.x * b.y - b.x * a.y;
    }
    side = area2 >= 0 ? 1 : -1;
  }
  if (invert) side = -side;

  const C = cloudCenters(pts, closed, step);
  const m = C.length;
  const R = cloudRadius(step);
  if (m === 0) return '';
  if (m === 1) {
    const c = C[0];
    return `M ${f(c.x + R)} ${f(c.y)}${arcCubics(c, R, 0, TAU)} Z`;
  }
  const normalOf = (P: CloudPt, Q: CloudPt) => {
    const len = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
    return { x: (side * (Q.y - P.y)) / len, y: (-side * (Q.x - P.x)) / len };
  };
  /** Corte exterior de los lóbulos de P y Q (mismo radio). */
  const outerHit = (P: CloudPt, Q: CloudPt) => {
    const dist = Math.hypot(Q.x - P.x, Q.y - P.y);
    const h = Math.sqrt(Math.max(0, R * R - (dist / 2) ** 2));
    const nrm = normalOf(P, Q);
    return { x: (P.x + Q.x) / 2 + nrm.x * h, y: (P.y + Q.y) / 2 + nrm.y * h };
  };
  const ang = (c: CloudPt, p: CloudPt) => Math.atan2(p.y - c.y, p.x - c.x);

  let d = '';
  for (let i = 0; i < m; i++) {
    const c = C[i];
    const prev = closed ? C[(i - 1 + m) % m] : i > 0 ? C[i - 1] : null;
    const next = closed ? C[(i + 1) % m] : i < m - 1 ? C[i + 1] : null;
    let t0: number;
    let sign: number;
    if (prev) {
      // Empieza en el corte con el lóbulo anterior y gira alejándose de él
      t0 = ang(c, outerHit(prev, c));
      const rel = Math.atan2(Math.sin(t0 - ang(c, prev)), Math.cos(t0 - ang(c, prev)));
      sign = rel >= 0 ? 1 : -1;
    } else {
      // Inicio de un contorno abierto: desde el punto de atrás, girando hacia el lado exterior
      const nrm = normalOf(c, next!);
      t0 = ang(c, next!) + Math.PI;
      const rel = Math.atan2(nrm.y, nrm.x) - t0;
      sign = Math.atan2(Math.sin(rel), Math.cos(rel)) >= 0 ? 1 : -1;
    }
    const t1 = next ? ang(c, outerHit(c, next)) : ang(c, prev!) + Math.PI;
    const delta = sign > 0 ? mod2pi(t1 - t0) : -mod2pi(t0 - t1);
    if (d === '') d = `M ${f(c.x + R * Math.cos(t0))} ${f(c.y + R * Math.sin(t0))}`;
    d += arcCubics(c, R, t0, delta);
    if (next) {
      // Gancho: el arco entra en el lóbulo siguiente y vuelve por el mismo camino
      const tail = sign * CLOUD_TAIL;
      d += arcCubics(c, R, t0 + delta, tail) + arcCubics(c, R, t0 + delta + tail, -tail);
    }
  }
  return closed ? `${d} Z` : d;
}

/** Trazado de la nube sobre un contorno cerrado ya en unidades de página (pt o píxeles, y hacia abajo). */
export function revisionCloudPath(outline: CloudPt[], step: number, invert = false): string {
  return cloudPathFromOutline(outline, true, step, invert);
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

/** Cuánto sobresale la nube de su contorno (pt), para la caja de selección. */
export function cloudOverhang(step: number, invert: boolean): number {
  return invert ? cloudRadius(step) * 0.25 : cloudRadius(step);
}
