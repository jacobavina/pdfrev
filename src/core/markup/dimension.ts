/**
 * Geometría de la cota (Dimension, ADR-0020). Pura y válida en cualquier sistema de coordenadas uniforme
 * (píxeles de pantalla con y hacia abajo, o puntos PDF con y hacia arriba): la usan la pantalla, el /AP y el
 * aplanado, así la cota que se ve en REA es la que se ve en Revu y Acrobat.
 *
 * Modelo: p1 y p2 son los puntos acotados; p3 es cualquier punto de la línea de cota. La distancia con signo
 * de p3 a la recta p1-p2 es el desfase de la línea de cota (en PDF, /LL).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface DimensionGeometry {
  /** Extremos de la línea de cota (llevan los extremos de línea: flechas, trazos…). */
  dimStart: Pt;
  dimEnd: Pt;
  /** Líneas de referencia desde cada punto acotado hasta pasada la línea de cota (vacías si no hay desfase). */
  extensions: [Pt, Pt][];
  /** Posición del texto (centro de su línea base), ya desplazada fuera de la línea de cota. */
  textAnchor: Pt;
  /** Ángulo de la línea de cota en radianes, normalizado para que el texto nunca quede cabeza abajo. */
  textAngle: number;
  /** Desfase con signo de la línea de cota respecto a p1-p2 (unidades del sistema). */
  offset: number;
  /** Vector unitario perpendicular hacia el lado de la línea de cota. */
  side: Pt;
}

/** Separación entre el punto acotado y el arranque de la línea de referencia. */
export const DIMENSION_EXTENSION_GAP = 2;
/** Cuánto sobresale la línea de referencia más allá de la línea de cota. */
export const DIMENSION_EXTENSION_OVERSHOOT = 4;

export function dimensionGeometry(
  p1: Pt,
  p2: Pt,
  p3: Pt,
  opts: { gap?: number; overshoot?: number; textGap?: number } = {}
): DimensionGeometry | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return null;
  const u = { x: dx / len, y: dy / len };
  // Normal izquierda (en coordenadas con y hacia abajo apunta "arriba" para una cota trazada a la derecha)
  const n = { x: u.y, y: -u.x };
  const offset = (p3.x - p1.x) * n.x + (p3.y - p1.y) * n.y;
  const sign = offset >= 0 ? 1 : -1;
  const side = { x: n.x * sign, y: n.y * sign };

  const dimStart = { x: p1.x + n.x * offset, y: p1.y + n.y * offset };
  const dimEnd = { x: p2.x + n.x * offset, y: p2.y + n.y * offset };

  const gap = opts.gap ?? DIMENSION_EXTENSION_GAP;
  const overshoot = opts.overshoot ?? DIMENSION_EXTENSION_OVERSHOOT;
  const extensions: [Pt, Pt][] = [];
  if (Math.abs(offset) > gap) {
    for (const [base, foot] of [
      [p1, dimStart],
      [p2, dimEnd],
    ] as [Pt, Pt][]) {
      extensions.push([
        { x: base.x + side.x * gap, y: base.y + side.y * gap },
        { x: foot.x + side.x * overshoot, y: foot.y + side.y * overshoot },
      ]);
    }
  }

  const textGap = opts.textGap ?? 3;
  const mid = { x: (dimStart.x + dimEnd.x) / 2, y: (dimStart.y + dimEnd.y) / 2 };
  // El texto va del lado exterior de la línea de cota (el opuesto a los puntos acotados)
  const textAnchor = { x: mid.x + side.x * textGap, y: mid.y + side.y * textGap };

  let textAngle = Math.atan2(dy, dx);
  // Legible: entre -90° y 90° (en pantalla, y hacia abajo; en PDF el signo del ángulo se invierte igual)
  if (textAngle > Math.PI / 2) textAngle -= Math.PI;
  else if (textAngle <= -Math.PI / 2) textAngle += Math.PI;

  return { dimStart, dimEnd, extensions, textAnchor, textAngle, offset, side };
}

/**
 * Línea base del texto de la cota (centro). Las letras crecen hacia "arriba" del texto: si la línea de cota
 * queda por debajo de los puntos en ese sentido, la base se baja una altura de mayúscula para no tapar la línea.
 * `yUp` = sistema con y hacia arriba (PDF); en pantalla, y crece hacia abajo.
 */
export function dimensionTextBaseline(geom: DimensionGeometry, fontSize: number, yUp: boolean): Pt {
  const up = yUp
    ? { x: -Math.sin(geom.textAngle), y: Math.cos(geom.textAngle) }
    : { x: Math.sin(geom.textAngle), y: -Math.cos(geom.textAngle) };
  const towardsText = geom.side.x * up.x + geom.side.y * up.y;
  if (towardsText >= 0) return geom.textAnchor;
  const capHeight = fontSize * 0.72;
  return { x: geom.textAnchor.x + geom.side.x * capHeight, y: geom.textAnchor.y + geom.side.y * capHeight };
}

/**
 * Punto de la línea de cota para una cota nueva trazada de p1 a p2, con el desfase dado en las unidades del
 * sistema. Como en Revu: trazada de izquierda a derecha la línea queda por encima de los puntos; de derecha a
 * izquierda, por debajo (coordenadas de pantalla, y hacia abajo).
 */
export function defaultDimensionLinePoint(p1: Pt, p2: Pt, offset: number): Pt {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const n = { x: dy / len, y: -dx / len };
  return { x: (p1.x + p2.x) / 2 + n.x * offset, y: (p1.y + p2.y) / 2 + n.y * offset };
}

/**
 * Segmentos visibles de la cota (línea de cota y líneas de referencia) en coordenadas normalizadas, para la
 * selección y la caja envolvente. Con las dimensiones de la página (pt) la perpendicular es exacta.
 */
export function dimensionSegmentsNormalized(points: Pt[], pageDims?: { width: number; height: number }): [Pt, Pt][] {
  if (points.length < 2) return [];
  const W = pageDims?.width || 1;
  const H = pageDims?.height || 1;
  const toPt = (p: Pt) => ({ x: p.x * W, y: p.y * H });
  const toN = (p: Pt) => ({ x: p.x / W, y: p.y / H });
  const a = toPt(points[0]);
  const b = toPt(points[1]);
  const c = points[2] ? toPt(points[2]) : defaultDimensionLinePoint(a, b, pageDims ? 15 : 0.02);
  const g = dimensionGeometry(a, b, c, pageDims ? {} : { gap: 0, overshoot: 0 });
  if (!g) return [[points[0], points[1]]];
  return [[toN(g.dimStart), toN(g.dimEnd)], ...g.extensions.map(([p, q]) => [toN(p), toN(q)] as [Pt, Pt])];
}
