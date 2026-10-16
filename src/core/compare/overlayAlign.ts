/**
 * Alineación por puntos de Overlay Pages (ADR-0050), como Align de Revu: pares de puntos (en la página actual y en
 * la comparada) definen la transformación que lleva la página comparada sobre la actual. Puro: pt de página
 * visual, y hacia abajo. La transformación es T(p) = M·p + t, con M = [a, b, c, d] como en canvas
 * (x' = a·x + c·y + e, y' = b·x + d·y + f).
 */

export interface Pt {
  x: number;
  y: number;
}

export type Linear = [number, number, number, number];

export const IDENTITY: Linear = [1, 0, 0, 1];

export function applyAffine(m: Linear, t: Pt, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + t.x, y: m[1] * p.x + m[3] * p.y + t.y };
}

/** Inversa: el punto de la página comparada que T lleva a `q`, o null si M no es invertible. */
export function invertAffine(m: Linear, t: Pt, q: Pt): Pt | null {
  const det = m[0] * m[3] - m[2] * m[1];
  if (Math.abs(det) < 1e-12) return null;
  const x = q.x - t.x;
  const y = q.y - t.y;
  return { x: (m[3] * x - m[2] * y) / det, y: (-m[1] * x + m[0] * y) / det };
}

/**
 * Transformación que lleva `other[i]` sobre `base[i]`: con 2 pares, semejanza (desplazamiento, giro y escala
 * uniforme); con 3, afín completa (también escalas distintas y sesgo, p. ej. un escaneo deformado). Null si los
 * puntos coinciden o, con 3, si son colineales.
 */
export function solveAlignment(base: Pt[], other: Pt[]): { matrix: Linear; offset: Pt } | null {
  const n = Math.min(base.length, other.length);
  if (n >= 3) {
    const [o1, o2, o3] = other;
    const [b1, b2, b3] = base;
    const det = o1.x * (o2.y - o3.y) - o1.y * (o2.x - o3.x) + (o2.x * o3.y - o3.x * o2.y);
    if (Math.abs(det) < 1e-9) return null;
    // Resolver [x y 1]·[a c e]ᵀ = x' para los tres pares (Cramer)
    const solve = (v1: number, v2: number, v3: number) => {
      const p = (v1 * (o2.y - o3.y) - o1.y * (v2 - v3) + (v2 * o3.y - v3 * o2.y)) / det;
      const q = (o1.x * (v2 - v3) - v1 * (o2.x - o3.x) + (o2.x * v3 - o3.x * v2)) / det;
      const r = (o1.x * (o2.y * v3 - o3.y * v2) - o1.y * (o2.x * v3 - o3.x * v2) + v1 * (o2.x * o3.y - o3.x * o2.y)) / det;
      return [p, q, r];
    };
    const [a, c, e] = solve(b1.x, b2.x, b3.x);
    const [b, d, f] = solve(b1.y, b2.y, b3.y);
    return { matrix: [a, b, c, d], offset: { x: e, y: f } };
  }
  if (n === 2) {
    const [o1, o2] = other;
    const [b1, b2] = base;
    const ox = o2.x - o1.x;
    const oy = o2.y - o1.y;
    const den = ox * ox + oy * oy;
    if (den < 1e-12) return null;
    // Cociente complejo (b2 − b1) / (o2 − o1) = p + i·q
    const bx = b2.x - b1.x;
    const by = b2.y - b1.y;
    const p = (bx * ox + by * oy) / den;
    const q = (by * ox - bx * oy) / den;
    const matrix: Linear = [p, q, -q, p];
    const r = applyAffine(matrix, { x: 0, y: 0 }, o1);
    return { matrix, offset: { x: b1.x - r.x, y: b1.y - r.y } };
  }
  return null;
}

/** Escala y giro (grados) de una transformación, para mostrarlos en la barra. */
export function describeLinear(m: Linear): { scale: number; rotationDeg: number } {
  return { scale: Math.hypot(m[0], m[1]), rotationDeg: (Math.atan2(m[1], m[0]) * 180) / Math.PI };
}
