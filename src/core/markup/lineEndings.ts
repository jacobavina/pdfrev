import { LineEndingStyle } from '../../types/markup';

/**
 * Geometría única de los extremos de línea (ADR-0018). Pura y válida en cualquier sistema de coordenadas:
 * la usan la pantalla (SVG, y hacia abajo) y el PDF (/AP y aplanado, y hacia arriba), siempre que el ángulo se
 * calcule en el mismo sistema que los puntos. Así la flecha que se ve en REA es la que se ve en Revu y Acrobat.
 */

export interface Pt {
  x: number;
  y: number;
}

export type LineEndingShape =
  | { kind: 'polyline' | 'polygon'; points: Pt[]; filled: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; filled: boolean };

/** Tamaño del extremo en puntos de página, proporcional al grosor de la línea. */
export function lineEndingSize(strokeWidthPt: number): number {
  const w = Number.isFinite(strokeWidthPt) && strokeWidthPt > 0 ? strokeWidthPt : 1;
  return Math.max(7, w * 3 + 4);
}

const ARROW_HALF_ANGLE = 0.45; // ≈ 26°

/**
 * Forma del extremo en `tip`. `angle` es la dirección con la que la línea llega a la punta
 * (atan2 del vector "punto anterior → punta"). `size` en las mismas unidades que los puntos.
 */
export function lineEndingShape(
  tip: Pt,
  angle: number,
  ending: LineEndingStyle | undefined,
  size: number
): LineEndingShape | null {
  if (!ending || ending === 'none' || !Number.isFinite(angle) || !(size > 0)) return null;

  if (ending === 'openArrow' || ending === 'closedArrow') {
    const back = angle + Math.PI;
    const a1 = { x: tip.x + size * Math.cos(back - ARROW_HALF_ANGLE), y: tip.y + size * Math.sin(back - ARROW_HALF_ANGLE) };
    const a2 = { x: tip.x + size * Math.cos(back + ARROW_HALF_ANGLE), y: tip.y + size * Math.sin(back + ARROW_HALF_ANGLE) };
    return ending === 'openArrow'
      ? { kind: 'polyline', points: [a1, tip, a2], filled: false }
      : { kind: 'polygon', points: [a1, tip, a2], filled: true };
  }

  if (ending === 'circle') {
    return { kind: 'circle', cx: tip.x, cy: tip.y, r: size / 3, filled: true };
  }

  // Cuadrado alineado con la línea; rombo = cuadrado girado 45°
  const r = size / 2.6;
  const rot = ending === 'diamond' ? Math.PI / 4 : 0;
  const points = [0, 1, 2, 3].map((i) => {
    const a = angle + rot + Math.PI / 4 + (i * Math.PI) / 2;
    return { x: tip.x + r * Math.SQRT2 * Math.cos(a), y: tip.y + r * Math.SQRT2 * Math.sin(a) };
  });
  return { kind: 'polygon', points, filled: true };
}

/** Ángulo de llegada a cada extremo de una polilínea (inicio: segmento 1 invertido; final: último segmento). */
export function endpointAngles(points: Pt[]): { start: number; end: number } | null {
  if (points.length < 2) return null;
  const [a, b] = [points[0], points[1]];
  const [y, z] = [points[points.length - 2], points[points.length - 1]];
  return {
    start: Math.atan2(a.y - b.y, a.x - b.x),
    end: Math.atan2(z.y - y.y, z.x - y.x),
  };
}

/** Puntos que delimitan la forma (para ampliar cajas envolventes del /AP). */
export function shapeExtent(shape: LineEndingShape): Pt[] {
  if (shape.kind === 'circle') {
    return [
      { x: shape.cx - shape.r, y: shape.cy - shape.r },
      { x: shape.cx + shape.r, y: shape.cy + shape.r },
    ];
  }
  return shape.points;
}
