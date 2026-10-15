import { getHelveticaTextWidth } from './helveticaMetrics';
import type { Markup } from '../../types/markup';
import { dimensionGeometry } from './dimension';

/**
 * Texto de las mediciones al estilo de Acrobat (ADR-0032): Helvetica negra sin recuadro, dentro de la línea
 * ("Inside", la línea se interrumpe) o encima ("On Top"). Geometría pura en el espacio visual de la página
 * (y hacia abajo), en las unidades que se pasen (pt para el /AP, px para la pantalla): pantalla, /AP y aplanado
 * dibujan exactamente lo mismo.
 */

export type CaptionStyle = 'inline' | 'top';

/** Tamaño del texto en pt de página: 8 pt guarda la proporción texto/flecha de Acrobat (ADR-0034). */
export const MEASURE_CAPTION_PT = 8;
/** Color del texto (Acrobat lo escribe en negro). */
export const MEASURE_CAPTION_COLOR = '#000000';

export interface Pt {
  x: number;
  y: number;
}

export interface CaptionText {
  text: string;
  /** Centro de la línea base del texto. */
  origin: Pt;
  /** Ángulo del texto en radianes, siempre legible (nunca boca abajo). */
  angle: number;
  fontSize: number;
}

export interface LineCaptionLayout {
  /** Tramos visibles de la línea (dos si el texto va dentro, uno si va encima). */
  pieces: [Pt, Pt][];
  caption: CaptionText;
  /** Estilo aplicado: "inline" pasa a "top" si la línea es demasiado corta para el texto. */
  style: CaptionStyle;
}

export const captionStyleOf = (v: unknown): CaptionStyle => (v === 'top' ? 'top' : 'inline');

/**
 * Texto a lo largo de un segmento a→b. `endInset` es lo que ocupan los extremos (flechas) en cada punta: si el
 * texto no cabe entre ellos, va encima de la línea.
 */
export function lineCaptionLayout(
  a: Pt,
  b: Pt,
  text: string,
  fontSize: number,
  style: CaptionStyle,
  endInset = 0
): LineCaptionLayout {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  // Texto legible: de izquierda a derecha (y de abajo arriba en vertical)
  let angle = Math.atan2(dy, dx);
  if (Math.cos(angle) < -1e-9 || (Math.abs(Math.cos(angle)) <= 1e-9 && Math.sin(angle) > 0)) angle += Math.PI;
  // "Arriba" del texto en un sistema con y hacia abajo
  const up = { x: Math.sin(angle), y: -Math.cos(angle) };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const width = getHelveticaTextWidth(text, fontSize);
  const gap = width + fontSize * 0.8;
  const fitsInline = len >= gap + 2 * endInset;
  const used: CaptionStyle = style === 'inline' && fitsInline && text.trim() ? 'inline' : 'top';

  if (used === 'inline') {
    const half = gap / 2;
    return {
      pieces: [
        [a, { x: mid.x - ux * half, y: mid.y - uy * half }],
        [{ x: mid.x + ux * half, y: mid.y + uy * half }, b],
      ],
      // Centrado verticalmente sobre la línea: la base queda ~0.35 em por debajo
      caption: { text, origin: { x: mid.x - up.x * fontSize * 0.35, y: mid.y - up.y * fontSize * 0.35 }, angle, fontSize },
      style: used,
    };
  }
  const lift = fontSize * 0.3;
  return {
    pieces: [[a, b]],
    caption: { text, origin: { x: mid.x + up.x * lift, y: mid.y + up.y * lift }, angle, fontSize },
    style: used,
  };
}

/** Texto horizontal centrado en un punto (área, perímetro, volumen…). */
export function pointCaption(center: Pt, text: string, fontSize: number): CaptionText {
  return { text, origin: { x: center.x, y: center.y + fontSize * 0.35 }, angle: 0, fontSize };
}

/** Centroide de los vértices (lugar del texto de los contornos cerrados). */
export function verticesCenter(points: Pt[]): Pt {
  const n = Math.max(1, points.length);
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

/** Texto de la etiqueta de una medición: valor, precedido de su etiqueta si tiene (Distance Properties › Label). */
export function measureLabelText(markup: Markup, formatted: string): string {
  const label = typeof markup.customFields?.measureLabel === 'string' ? markup.customFields.measureLabel.trim() : '';
  return label ? `${label}: ${formatted}` : formatted;
}

/** Extremos de una distancia: flecha cerrada en ambos lados salvo que el usuario elija otros (Acrobat, ADR-0033). */
export function measureLineEndings(style: Markup['style']): Markup['style'] {
  return {
    ...style,
    lineEndingStart: style.lineEndingStart ?? 'closedArrow',
    lineEndingEnd: style.lineEndingEnd ?? 'closedArrow',
  };
}

/** Lo que las líneas de referencia sobresalen más allá de la línea de medida, en pt (/LLE de Acrobat). */
export const MEASURE_LEADER_EXTENSION_PT = 5;

/** Media longitud de las guías de los extremos de una distancia sin desplazamiento, en pt (ADR-0034). */
export const MEASURE_END_TICK_PT = 6;

/**
 * Distancia de Acrobat (ADR-0033): con un tercer punto, la línea de medida se desplaza en paralelo y unas líneas de
 * referencia la unen a los puntos medidos (sobresalen `extension`). Sin él, la línea va de punto a punto.
 * Unidades libres (pt o px), espacio visual con y hacia abajo.
 */
export function distanceGeometry(
  points: Pt[],
  extension: number,
  /** Sin tercer punto: media longitud de las guías perpendiculares de cada extremo (0 = sin guías). */
  endTick = 0
): { a: Pt; b: Pt; leaders: [Pt, Pt][] } | null {
  if (points.length < 2) return null;
  const [p1, p2, p3] = points;
  if (!p3) {
    // Guías de los extremos (ADR-0034): marcas perpendiculares centradas en cada punta, como Acrobat
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!(endTick > 0) || !(len > 0)) return { a: p1, b: p2, leaders: [] };
    const n = { x: -(p2.y - p1.y) / len, y: (p2.x - p1.x) / len };
    const tick = (p: Pt): [Pt, Pt] => [
      { x: p.x - n.x * endTick, y: p.y - n.y * endTick },
      { x: p.x + n.x * endTick, y: p.y + n.y * endTick },
    ];
    return { a: p1, b: p2, leaders: [tick(p1), tick(p2)] };
  }
  const g = dimensionGeometry(p1, p2, p3, { gap: 0, overshoot: extension });
  if (!g) return { a: p1, b: p2, leaders: [] };
  return { a: g.dimStart, b: g.dimEnd, leaders: g.extensions };
}
