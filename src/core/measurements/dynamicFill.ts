/**
 * Relleno dinámico de áreas (ADR-0095). Puro: trabaja sobre una rasterización RGBA de la hoja.
 *
 * A partir de un punto dentro de un recinto:
 * 1. marca como "tinta" los píxeles oscuros (muros, líneas) y los engrosa `gap` píxeles, lo que cierra los huecos
 *    pequeños (un vano de puerta mal dibujado, una línea discontinua);
 * 2. inunda desde el punto el espacio libre (4 vecinos);
 * 3. si la inundación toca el borde de la hoja o ocupa casi toda, el recinto no está cerrado;
 * 4. devuelve el contorno exterior simplificado, normalizado a la hoja (0..1).
 */

export interface DynamicFillOptions {
  /** Luminancia (0..255) por debajo de la cual un píxel es tinta. */
  inkThreshold?: number;
  /** Píxeles que se engrosa la tinta para cerrar huecos. */
  gap?: number;
  /** Tolerancia de la simplificación del contorno, en píxeles. */
  simplify?: number;
  /** Fracción máxima de la hoja que puede ocupar un recinto. */
  maxFraction?: number;
}

export type DynamicFillResult =
  | { ok: true; points: { x: number; y: number }[]; areaPx: number }
  | { ok: false; reason: 'on-line' | 'open' | 'empty' };

const DEFAULTS: Required<DynamicFillOptions> = { inkThreshold: 160, gap: 3, simplify: 1.5, maxFraction: 0.6 };

/** Dilatación cuadrada de radio `r` en dos pasadas (horizontal y vertical). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    // Pasada izquierda → derecha: distancia al último píxel activo
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) last = x;
      if (x - last <= r) tmp[y * w + x] = 1;
    }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) last = x;
      if (last - x <= r) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) last = y;
      if (last - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Inundación por líneas de barrido desde (sx, sy) sobre los píxeles no bloqueados. */
function floodFill(blocked: Uint8Array, w: number, h: number, sx: number, sy: number) {
  const region = new Uint8Array(blocked.length);
  const stack: number[] = [sx, sy];
  let count = 0;
  let touchesEdge = false;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (region[y * w + x] || blocked[y * w + x]) continue;
    let x0 = x;
    while (x0 > 0 && !blocked[y * w + x0 - 1] && !region[y * w + x0 - 1]) x0--;
    let x1 = x;
    while (x1 < w - 1 && !blocked[y * w + x1 + 1] && !region[y * w + x1 + 1]) x1++;
    for (let i = x0; i <= x1; i++) region[y * w + i] = 1;
    count += x1 - x0 + 1;
    if (x0 === 0 || x1 === w - 1 || y === 0 || y === h - 1) touchesEdge = true;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inRun = false;
      for (let i = x0; i <= x1; i++) {
        const free = !blocked[ny * w + i] && !region[ny * w + i];
        if (free && !inRun) stack.push(i, ny);
        inRun = free;
      }
    }
  }
  return { region, count, touchesEdge };
}

const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
const DY = [0, -1, -1, -1, 0, 1, 1, 1];
const dirIndex = (dx: number, dy: number) => {
  for (let d = 0; d < 8; d++) if (DX[d] === dx && DY[d] === dy) return d;
  return 0;
};

/** Contorno exterior de la región (vecindad de Moore), en píxeles, en sentido horario. */
export function traceOuterContour(region: Uint8Array, w: number, h: number): [number, number][] {
  let sx = -1;
  let sy = -1;
  for (let i = 0; i < region.length && sx < 0; i++) {
    if (region[i]) {
      sx = i % w;
      sy = (i - sx) / w;
    }
  }
  if (sx < 0) return [];
  const inRegion = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1;
  const pts: [number, number][] = [];
  let cx = sx;
  let cy = sy;
  let bdir = 0; // la vecina oeste del píxel inicial es fondo
  const cap = 4 * (w + h) * 8 + 16;
  for (let guard = 0; guard < cap; guard++) {
    pts.push([cx, cy]);
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = (bdir + k) % 8;
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (inRegion(nx, ny)) {
        const prev = (bdir + k - 1) % 8;
        const px = cx + DX[prev];
        const py = cy + DY[prev];
        cx = nx;
        cy = ny;
        bdir = dirIndex(px - cx, py - cy);
        moved = true;
        break;
      }
    }
    if (!moved || (cx === sx && cy === sy)) break;
  }
  return pts;
}

function perpDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function douglasPeucker(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  const left = douglasPeucker(pts.slice(0, idx + 1), eps);
  const right = douglasPeucker(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

/** Simplifica un anillo cerrado partiéndolo por su punto más lejano al primero. */
export function simplifyRing(ring: [number, number][], eps: number): [number, number][] {
  if (ring.length < 4) return ring;
  let far = 0;
  let best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = douglasPeucker(ring.slice(0, far + 1), eps);
  const b = douglasPeucker([...ring.slice(far), ring[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Área de un polígono (fórmula del topógrafo), en píxeles cuadrados. */
export function ringArea(ring: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Detecta el recinto que contiene el punto `seed` (píxeles de la rasterización).
 */
export function detectEnclosure(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  seed: { x: number; y: number },
  opts: DynamicFillOptions = {}
): DynamicFillResult {
  const o = { ...DEFAULTS, ...opts };
  const sx = Math.max(0, Math.min(w - 1, Math.round(seed.x)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(seed.y)));
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const luma = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    if (luma < o.inkThreshold && rgba[p + 3] > 0) ink[i] = 1;
  }
  const blocked = dilate(ink, w, h, o.gap);
  if (blocked[sy * w + sx]) return { ok: false, reason: 'on-line' };
  const { region, count, touchesEdge } = floodFill(blocked, w, h, sx, sy);
  if (count === 0) return { ok: false, reason: 'empty' };
  if (touchesEdge || count > o.maxFraction * w * h) return { ok: false, reason: 'open' };
  // La tinta engrosada dejó el recinto `gap` píxeles por dentro de los muros: se recupera sin pisar la tinta
  const grown = dilate(region, w, h, o.gap);
  for (let i = 0; i < grown.length; i++) if (ink[i]) grown[i] = 0;
  const ring = simplifyRing(traceOuterContour(grown, w, h), o.simplify);
  if (ring.length < 3) return { ok: false, reason: 'empty' };
  const points = ring.map(([x, y]) => ({ x: (x + 0.5) / w, y: (y + 0.5) / h }));
  return { ok: true, points, areaPx: ringArea(ring.map(([x, y]) => ({ x, y }))) };
}
