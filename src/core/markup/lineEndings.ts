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

/**
 * Tamaño del extremo en puntos de página, proporcional al grosor de la línea como en Acrobat (ADR-0032):
 * 9 pt con una línea de 1 pt, 13 pt con 2 pt.
 */
export function lineEndingSize(strokeWidthPt: number): number {
  const w = Number.isFinite(strokeWidthPt) && strokeWidthPt > 0 ? strokeWidthPt : 1;
  return Math.max(9, w * 4 + 5);
}

/**
 * Media apertura de las flechas: ~16° (punta de ~32°), la de las flechas de medición terminadas de Acrobat
 * (ADR-0035, medida sobre la captura del usuario: ~9 pt de largo por ~5 pt de base con una línea de 1 pt).
 */
export const ARROW_HALF_ANGLE = 0.28;

/** Media apertura de la flecha de los callouts: 30° (punta de 60°), como en Revu y Foxit (ADR-0042). */
export const CALLOUT_ARROW_HALF_ANGLE = Math.PI / 6;

/**
 * Forma del extremo en `tip`. `angle` es la dirección con la que la línea llega a la punta
 * (atan2 del vector "punto anterior → punta"). `size` en las mismas unidades que los puntos.
 */
export function lineEndingShape(
  tip: Pt,
  angle: number,
  ending: LineEndingStyle | undefined,
  size: number,
  /** Sistema con y hacia arriba (PDF). Solo afecta a la barra, la única forma no simétrica. */
  yUp = false,
  /** Media apertura de las flechas (por defecto la de Acrobat; los callouts usan una más abierta). */
  halfAngle = ARROW_HALF_ANGLE
): LineEndingShape | null {
  if (!ending || ending === 'none' || !Number.isFinite(angle) || !(size > 0)) return null;

  if (ending === 'butt' || ending === 'slash') {
    // Trazo perpendicular a la línea, o barra a 30° de la perpendicular en sentido horario (ISO 32000 /Slash),
    // que en pantalla (y hacia abajo) se refleja para verse igual que en el PDF
    const a = ending === 'butt' ? angle + Math.PI / 2 : angle + (yUp ? 1 : -1) * (Math.PI / 3);
    const half = ending === 'butt' ? size / 2 : size * 0.6;
    const d = { x: Math.cos(a) * half, y: Math.sin(a) * half };
    return {
      kind: 'polyline',
      points: [
        { x: tip.x - d.x, y: tip.y - d.y },
        { x: tip.x + d.x, y: tip.y + d.y },
      ],
      filled: false,
    };
  }

  if (ending === 'rOpenArrow' || ending === 'rClosedArrow') {
    // Invertida: el vértice en el extremo y las alas hacia fuera de la línea
    const a1 = { x: tip.x + size * Math.cos(angle - halfAngle), y: tip.y + size * Math.sin(angle - halfAngle) };
    const a2 = { x: tip.x + size * Math.cos(angle + halfAngle), y: tip.y + size * Math.sin(angle + halfAngle) };
    return ending === 'rOpenArrow'
      ? { kind: 'polyline', points: [a1, tip, a2], filled: false }
      : { kind: 'polygon', points: [a1, tip, a2], filled: true };
  }

  if (ending === 'openArrow' || ending === 'closedArrow') {
    const back = angle + Math.PI;
    const a1 = { x: tip.x + size * Math.cos(back - halfAngle), y: tip.y + size * Math.sin(back - halfAngle) };
    const a2 = { x: tip.x + size * Math.cos(back + halfAngle), y: tip.y + size * Math.sin(back + halfAngle) };
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
