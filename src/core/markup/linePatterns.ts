import { cloudPathFromOutline, DEFAULT_CLOUD_STEP } from './revisionCloud';

/**
 * Tipos de línea con patrón como los de Revu (ADR-0041): nube, valla (círculo o cuadro), gas, agua caliente, zigzag,
 * aislamiento, doble, vías y camino. Puro: a partir de un contorno (abierto o cerrado) en unidades de salida (pt de
 * página o píxeles de pantalla, y hacia abajo) devuelve trazados SVG de solo M/L/C/Z que la pantalla, el /AP y el
 * aplanado dibujan igual. Los tamaños se definen en pt y crecen con el grosor de la línea, como los patrones
 * discontinuos (ADR-0018).
 */

export type PatternLineStyleId =
  | 'cloud'
  | 'fenceCircle'
  | 'fenceSquare'
  | 'gas'
  | 'hotWater'
  | 'zigzag'
  | 'insulation'
  | 'double'
  | 'tracks'
  | 'road';

export const PATTERN_LINE_STYLES: PatternLineStyleId[] = [
  'cloud',
  'fenceCircle',
  'fenceSquare',
  'gas',
  'hotWater',
  'zigzag',
  'insulation',
  'double',
  'tracks',
  'road',
];

export function isPatternLineStyle(id: unknown): id is PatternLineStyleId {
  return typeof id === 'string' && (PATTERN_LINE_STYLES as string[]).includes(id);
}

/** Tipos de marca que admiten un tipo de línea con patrón (los definidos por un contorno de líneas). */
export const PATTERN_MARKUP_TYPES = new Set(['line', 'polyLine', 'polygon', 'rectangle', 'circle']);

export interface Pt {
  x: number;
  y: number;
}

export interface PatternStroke {
  d: string;
  /** Grosor en unidades de salida; sin él, el grosor de la marca. */
  width?: number;
}

export interface LinePatternResult {
  /** Región que se rellena (contorno cerrado o la propia nube); null si no hay relleno posible. */
  fill: string | null;
  strokes: PatternStroke[];
}

export interface LinePatternOptions {
  strokeWidth: number;
  /** Unidades de salida por pt de página (zoom en pantalla; 1 en el PDF). */
  unitsPerPt: number;
  cloudStep?: number;
  cloudInvert?: boolean;
}

const f = (n: number) => n.toFixed(2);

function toD(pts: Pt[], closed = false): string {
  if (pts.length < 2) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${f(p.x)} ${f(p.y)}`).join(' ') + (closed ? ' Z' : '');
}

function dedupe(pts: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) out.push(p);
  }
  if (closed && out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 1e-6) {
    out.pop();
  }
  return out;
}

/** Recorrido por longitud de arco de una polilínea (la cerrada repite el primer punto al final). */
class Walker {
  readonly pts: Pt[];
  readonly cum: number[] = [0];
  readonly length: number;

  constructor(pts: Pt[], closed: boolean) {
    this.pts = closed ? [...pts, pts[0]] : pts;
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  private segAt(s: number): number {
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    return i;
  }

  /** Punto y dirección (radianes) a la longitud `s`. */
  at(s: number): { p: Pt; angle: number } {
    const t = Math.max(0, Math.min(this.length, s));
    const i = this.segAt(t);
    const a = this.pts[i - 1];
    const b = this.pts[i];
    const segLen = this.cum[i] - this.cum[i - 1] || 1;
    const u = (t - this.cum[i - 1]) / segLen;
    return { p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  /** Tramo entre dos longitudes, con los vértices intermedios. */
  slice(s0: number, s1: number): Pt[] {
    const a = Math.max(0, s0);
    const b = Math.min(this.length, s1);
    if (b - a < 1e-6) return [];
    const out = [this.at(a).p];
    for (let i = 1; i < this.pts.length - 1; i++) if (this.cum[i] > a && this.cum[i] < b) out.push(this.pts[i]);
    out.push(this.at(b).p);
    return out;
  }
}

/** Paralela a una polilínea a distancia `dist` (positiva a la izquierda del avance en y hacia abajo), con ingletes. */
export function offsetPolyline(pts: Pt[], dist: number, closed: boolean): Pt[] {
  const n = pts.length;
  const segCount = closed ? n : n - 1;
  const normals: Pt[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    normals.push({ x: (b.y - a.y) / len, y: -(b.x - a.x) / len });
  }
  return pts.map((p, i) => {
    const nIn = closed ? normals[(i - 1 + segCount) % segCount] : normals[Math.max(0, i - 1)];
    const nOut = closed ? normals[i % segCount] : normals[Math.min(segCount - 1, i)];
    const mx = nIn.x + nOut.x;
    const my = nIn.y + nOut.y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) return { x: p.x + nIn.x * dist, y: p.y + nIn.y * dist };
    const m = { x: mx / ml, y: my / ml };
    const k = 1 / Math.max(0.35, m.x * nIn.x + m.y * nIn.y);
    return { x: p.x + m.x * dist * k, y: p.y + m.y * dist * k };
  });
}

/** Posiciones repartidas uniformemente (centradas) cada `period` aprox.; al menos una si cabe `minLen`. */
function spread(length: number, period: number, minLen: number): number[] {
  const count = Math.floor(length / period);
  if (count < 1) return length >= minLen ? [length / 2] : [];
  return Array.from({ length: count }, (_, k) => ((k + 0.5) * length) / count);
}

/** Tramos de la línea base que quedan entre símbolos (con un hueco de ±gap alrededor de cada uno). */
function gapped(w: Walker, centers: number[], gap: number): string[] {
  const out: string[] = [];
  let s = 0;
  for (const c of centers) {
    const piece = w.slice(s, c - gap);
    if (piece.length >= 2) out.push(toD(piece));
    s = c + gap;
  }
  const last = w.slice(s, w.length);
  if (last.length >= 2) out.push(toD(last));
  return out;
}

function circleD(c: Pt, r: number): string {
  const k = 0.5522847498 * r;
  return (
    `M ${f(c.x + r)} ${f(c.y)} C ${f(c.x + r)} ${f(c.y + k)} ${f(c.x + k)} ${f(c.y + r)} ${f(c.x)} ${f(c.y + r)}` +
    ` C ${f(c.x - k)} ${f(c.y + r)} ${f(c.x - r)} ${f(c.y + k)} ${f(c.x - r)} ${f(c.y)}` +
    ` C ${f(c.x - r)} ${f(c.y - k)} ${f(c.x - k)} ${f(c.y - r)} ${f(c.x)} ${f(c.y - r)}` +
    ` C ${f(c.x + k)} ${f(c.y - r)} ${f(c.x + r)} ${f(c.y - k)} ${f(c.x + r)} ${f(c.y)} Z`
  );
}

/**
 * Letras de trazo (sin fuentes): así "GAS" y "HW" son idénticos en pantalla, en el /AP y en el aplanado, y siguen
 * la dirección de la línea. Coordenadas en una caja de altura 1 (y hacia abajo).
 */
const GLYPHS: Record<string, { w: number; strokes: [number, number][][] }> = {
  G: {
    w: 0.72,
    strokes: [[[0.68, 0.18], [0.55, 0.04], [0.38, 0], [0.2, 0.05], [0.07, 0.2], [0.02, 0.5], [0.07, 0.8], [0.2, 0.95], [0.38, 1], [0.56, 0.96], [0.7, 0.85], [0.7, 0.56], [0.42, 0.56]]],
  },
  A: { w: 0.72, strokes: [[[0, 1], [0.36, 0], [0.72, 1]], [[0.13, 0.64], [0.59, 0.64]]] },
  S: {
    w: 0.64,
    strokes: [[[0.6, 0.14], [0.48, 0.03], [0.3, 0], [0.12, 0.07], [0.06, 0.24], [0.15, 0.4], [0.34, 0.49], [0.52, 0.57], [0.62, 0.74], [0.56, 0.92], [0.36, 1], [0.15, 0.96], [0.02, 0.84]]],
  },
  H: { w: 0.64, strokes: [[[0, 0], [0, 1]], [[0.64, 0], [0.64, 1]], [[0, 0.5], [0.64, 0.5]]] },
  W: { w: 0.9, strokes: [[[0, 0], [0.22, 1], [0.45, 0.28], [0.68, 1], [0.9, 0]]] },
};
const GLYPH_SPACING = 0.24;

function textWidth(text: string, h: number): number {
  const chars = [...text].filter((c) => GLYPHS[c]);
  return (chars.reduce((a, c) => a + GLYPHS[c].w, 0) + GLYPH_SPACING * Math.max(0, chars.length - 1)) * h;
}

/** Texto de trazo centrado en `c`, girado `angle` y siempre legible (nunca boca abajo). */
function strokeText(text: string, c: Pt, angle: number, h: number): string {
  const a = Math.cos(angle) < -1e-9 ? angle + Math.PI : angle;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const total = textWidth(text, h);
  let x = -total / 2;
  const parts: string[] = [];
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) continue;
    for (const stroke of g.strokes) {
      const pts = stroke.map(([gx, gy]) => {
        const lx = x + gx * h;
        const ly = (gy - 0.5) * h;
        return { x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos };
      });
      parts.push(toD(pts));
    }
    x += (g.w + GLYPH_SPACING) * h;
  }
  return parts.join(' ');
}

/** Contorno a lo largo del cual se dibuja el patrón. */
export function linePatternPrimitives(
  input: Pt[],
  closed: boolean,
  id: PatternLineStyleId,
  opts: LinePatternOptions
): LinePatternResult {
  const pts = dedupe(input, closed);
  if (pts.length < 2) return { fill: null, strokes: [] };
  const k = opts.unitsPerPt > 0 ? opts.unitsPerPt : 1;
  const sw = Number.isFinite(opts.strokeWidth) && opts.strokeWidth > 0 ? opts.strokeWidth : 1;
  const u = 1.5 * Math.sqrt(Math.max(1, sw)) * k;
  const outline = closed ? toD(pts, true) : null;
  const w = new Walker(pts, closed);

  switch (id) {
    case 'cloud': {
      const d = cloudPathFromOutline(pts, closed, (opts.cloudStep ?? DEFAULT_CLOUD_STEP) * k, Boolean(opts.cloudInvert));
      return { fill: closed ? d : null, strokes: [{ d }] };
    }
    case 'double': {
      const off = 1.3 * u;
      return {
        fill: outline,
        strokes: [toD(offsetPolyline(pts, off, closed), closed), toD(offsetPolyline(pts, -off, closed), closed)].map((d) => ({ d })),
      };
    }
    case 'zigzag': {
      // Dientes enteros por lado: el zigzag empieza y acaba sobre cada vértice
      const amp = 2 * u;
      const wave = 5 * u;
      const out: Pt[] = [pts[0]];
      const segs = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const teeth = Math.max(1, Math.round(len / wave));
        for (let t = 0; t < teeth; t++) {
          for (const [q, s] of [[0.25, 1], [0.75, -1]] as const) {
            const along = (t + q) / teeth;
            out.push({ x: a.x + (b.x - a.x) * along + nx * amp * s, y: a.y + (b.y - a.y) * along + ny * amp * s });
          }
        }
        out.push(b);
      }
      return { fill: outline, strokes: [{ d: toD(out) }] };
    }
    case 'insulation': {
      // Bucles de aislamiento (trocoide) a lo largo de la línea
      const h = 2.4 * u;
      const b = 1.1 * u;
      const usable = w.length - 2 * b;
      if (usable <= 0) return { fill: outline, strokes: [{ d: toD(w.slice(0, w.length)) }] };
      const periods = Math.max(1, Math.round(usable / (2.2 * u)));
      const P = usable / periods;
      const out: Pt[] = [];
      const samples = periods * 16;
      for (let i = 0; i <= samples; i++) {
        const t = (i / 16) * Math.PI * 2;
        const s = b + (P * t) / (Math.PI * 2) - b * Math.sin(t);
        const { p, angle } = w.at(s);
        const off = h * Math.cos(t + Math.PI);
        out.push({ x: p.x - Math.sin(angle) * off, y: p.y + Math.cos(angle) * off });
      }
      return { fill: outline, strokes: [{ d: toD(out) }] };
    }
    case 'tracks': {
      const rail = 1.4 * u;
      const tie = 2.6 * u;
      const strokes: PatternStroke[] = [
        { d: toD(offsetPolyline(pts, rail, closed), closed) },
        { d: toD(offsetPolyline(pts, -rail, closed), closed) },
      ];
      const ties = spread(w.length, 4.5 * u, 0).map((s) => {
        const { p, angle } = w.at(s);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        return toD([{ x: p.x + nx * tie, y: p.y + ny * tie }, { x: p.x - nx * tie, y: p.y - ny * tie }]);
      });
      if (ties.length) strokes.push({ d: ties.join(' ') });
      return { fill: outline, strokes };
    }
    case 'road': {
      const off = 2.6 * u;
      const dash = 3 * u;
      const gap = 2.5 * u;
      const strokes: PatternStroke[] = [
        { d: toD(offsetPolyline(pts, off, closed), closed) },
        { d: toD(offsetPolyline(pts, -off, closed), closed) },
      ];
      const center: string[] = [];
      for (let s = gap / 2; s < w.length; s += dash + gap) {
        const piece = w.slice(s, Math.min(w.length, s + dash));
        if (piece.length >= 2) center.push(toD(piece));
      }
      if (center.length) strokes.push({ d: center.join(' ') });
      return { fill: outline, strokes };
    }
    case 'fenceCircle':
    case 'fenceSquare': {
      const r = (id === 'fenceCircle' ? 1.7 : 1.5) * u;
      const centers = spread(w.length, 16 * u, 4 * r);
      const strokes: PatternStroke[] = gapped(w, centers, r).map((d) => ({ d }));
      const symbols = centers.map((s) => {
        const { p, angle } = w.at(s);
        if (id === 'fenceCircle') return circleD(p, r);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const corner = (x: number, y: number) => ({ x: p.x + x * cos - y * sin, y: p.y + x * sin + y * cos });
        return toD([corner(-r, -r), corner(r, -r), corner(r, r), corner(-r, r)], true);
      });
      if (symbols.length) strokes.push({ d: symbols.join(' ') });
      return { fill: outline, strokes };
    }
    case 'gas':
    case 'hotWater': {
      const text = id === 'gas' ? 'GAS' : 'HW';
      const h = 3.2 * u;
      const half = textWidth(text, h) / 2 + 1.2 * u;
      const centers = spread(w.length, 34 * u, half * 3);
      const strokes: PatternStroke[] = gapped(w, centers, half).map((d) => ({ d }));
      const labels = centers.map((s) => {
        const { p, angle } = w.at(s);
        return strokeText(text, p, angle, h);
      });
      if (labels.length) strokes.push({ d: labels.join(' '), width: Math.max(0.5 * k, 0.13 * h) });
      return { fill: outline, strokes };
    }
  }
}

/** Contorno de una marca en unidades de salida: rectángulo → 4 esquinas, elipse → 64 puntos. */
export function patternOutlineOf(
  type: string,
  points: Pt[],
  size: { width: number; height: number }
): { pts: Pt[]; closed: boolean } | null {
  const sc = points.map((p) => ({ x: p.x * size.width, y: p.y * size.height }));
  if (sc.length < 2) return null;
  switch (type) {
    case 'line':
      return { pts: sc.slice(0, 2), closed: false };
    case 'polyLine':
      return { pts: sc, closed: false };
    case 'polygon':
      return { pts: sc, closed: true };
    case 'rectangle': {
      const [a, b] = sc;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      return { pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true };
    }
    case 'circle': {
      const [a, b] = sc;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      return {
        pts: Array.from({ length: 64 }, (_, i) => ({ x: cx + rx * Math.cos((i / 64) * Math.PI * 2), y: cy + ry * Math.sin((i / 64) * Math.PI * 2) })),
        closed: true,
      };
    }
    default:
      return null;
  }
}

/** Patrón que se aplica a una marca, o null (las nubes propias y los demás tipos usan su dibujo). */
export function markupLinePattern(markup: { type: string; style: { lineStyle?: string } }): PatternLineStyleId | null {
  const id = markup.style.lineStyle;
  return isPatternLineStyle(id) && PATTERN_MARKUP_TYPES.has(markup.type) ? id : null;
}

/** Cuánto sobresale el patrón de su línea (pt), para la caja de selección. */
export function patternOverhang(id: PatternLineStyleId, strokeWidth: number, cloudStep = DEFAULT_CLOUD_STEP): number {
  const u = 1.5 * Math.sqrt(Math.max(1, strokeWidth || 1));
  switch (id) {
    case 'cloud':
      return cloudStep * 0.62;
    case 'double':
      return 1.3 * u;
    case 'zigzag':
      return 2 * u;
    case 'insulation':
      return 2.4 * u;
    case 'tracks':
      return 2.6 * u;
    case 'road':
      return 2.6 * u;
    case 'gas':
    case 'hotWater':
      return 1.6 * u;
    default:
      return 1.7 * u;
  }
}
