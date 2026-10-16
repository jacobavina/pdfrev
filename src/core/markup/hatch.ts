/**
 * Hatch de formas cerradas (ADR-0057), como el menú Hatch de Revu: patrones de líneas o puntos recortados al
 * contorno de la forma, del color de la línea. Puro: la misma geometría sirve para la pantalla (clipPath SVG), el
 * /AP (`W n`) y el aplanado. Las medidas van en pt de página (`unitsPerPt` las pasa a las unidades de salida) y el
 * patrón queda anclado al origen de la página, así que no "resbala" al mover la forma.
 */

export const HATCH_PATTERNS = [
  { id: 'brick', label: 'Brick' },
  { id: 'diagonalBrick', label: 'Diagonal Brick' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'diagonalDown', label: 'Diagonal Down' },
  { id: 'diagonalUp', label: 'Diagonal Up' },
  { id: 'grid', label: 'Grid' },
  { id: 'weave', label: 'Weave' },
  { id: 'dots10', label: '10% Dots' },
  { id: 'dots20', label: '20% Dots' },
  { id: 'dots30', label: '30% Dots' },
] as const;

export type HatchId = (typeof HATCH_PATTERNS)[number]['id'];

const HATCH_IDS = new Set<string>(HATCH_PATTERNS.map((p) => p.id));

/** Formas que admiten hatch: las cerradas con interior (Revu lo ofrece en rectángulo, elipse, polígono y nube). */
export const HATCH_MARKUP_TYPES = new Set<string>(['rectangle', 'circle', 'polygon', 'cloud', 'cloudPlus', 'area', 'volume']);

/** Separación entre líneas del patrón, en pt de página. */
export const HATCH_SPACING_PT = 8;
/** Grosor de las líneas del patrón, en pt de página. */
export const HATCH_LINE_PT = 0.75;
/** Paso de la retícula de puntos, en pt de página. */
export const HATCH_DOT_PITCH_PT = 4;

export function isHatchId(v: unknown): v is HatchId {
  return typeof v === 'string' && HATCH_IDS.has(v);
}

/** Hatch de una marca si su tipo lo admite y el patrón es válido; si no, null. */
export function markupHatch(markup: { type: string; style: { hatch?: string } }): HatchId | null {
  const h = markup.style.hatch;
  return HATCH_MARKUP_TYPES.has(markup.type) && isHatchId(h) ? h : null;
}

interface Pt {
  x: number;
  y: number;
}

export interface HatchBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Un trazo del patrón: segmentos `M … L …` (y = hacia abajo), su grosor y, para los puntos, su discontinuidad. */
export interface HatchStroke {
  d: string;
  width: number;
  dash?: [number, number];
}

type Seg = [Pt, Pt];

const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(Number(n.toFixed(2))));
const segsToD = (segs: Seg[]) => segs.map(([a, b]) => `M ${f(a.x)} ${f(a.y)} L ${f(b.x)} ${f(b.y)}`).join(' ');

/** Caja que cubre `box` vista en un marco girado `-angle` (para generar el patrón girado sin huecos). */
function frameBox(box: HatchBox, angle: number): HatchBox {
  if (angle === 0) return box;
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ].map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function rotateSegs(segs: Seg[], angle: number): Seg[] {
  if (angle === 0) return segs;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = (p: Pt) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  return segs.map(([a, b]) => [r(a), r(b)]);
}

/** Índices k con k·step dentro de [lo, hi] (anclados al origen). */
function steps(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor(lo / step); k * step <= hi + 1e-9; k++) out.push(k);
  return out;
}

const horizontals = (b: HatchBox, s: number): Seg[] =>
  steps(b.y - s, b.y + b.height + s, s).map((k) => [
    { x: b.x, y: k * s },
    { x: b.x + b.width, y: k * s },
  ]);

const verticals = (b: HatchBox, s: number): Seg[] =>
  steps(b.x - s, b.x + b.width + s, s).map((k) => [
    { x: k * s, y: b.y },
    { x: k * s, y: b.y + b.height },
  ]);

/** Ladrillo: hiladas de alto `s` y piezas de largo `2s`, a matajunta. */
function brick(b: HatchBox, s: number): Seg[] {
  const segs = horizontals(b, s);
  for (const row of steps(b.y - s, b.y + b.height + s, s)) {
    const shift = Math.abs(row) % 2 === 1 ? s : 0;
    for (const k of steps(b.x - 2 * s, b.x + b.width + 2 * s, 2 * s)) {
      const x = k * 2 * s + shift;
      segs.push([
        { x, y: row * s },
        { x, y: (row + 1) * s },
      ]);
    }
  }
  return segs;
}

/** Tejido (cesta): celdas de `2s` que alternan dos líneas horizontales y dos verticales. */
function weave(b: HatchBox, s: number): Seg[] {
  const c = 2 * s;
  const segs: Seg[] = [];
  for (const i of steps(b.x - c, b.x + b.width + c, c)) {
    for (const j of steps(b.y - c, b.y + b.height + c, c)) {
      const x0 = i * c;
      const y0 = j * c;
      if ((i + j) % 2 === 0) {
        for (const t of [1 / 3, 2 / 3]) segs.push([{ x: x0, y: y0 + t * c }, { x: x0 + c, y: y0 + t * c }]);
      } else {
        for (const t of [1 / 3, 2 / 3]) segs.push([{ x: x0 + t * c, y: y0 }, { x: x0 + t * c, y: y0 + c }]);
      }
    }
  }
  return segs;
}

/** Fracción de superficie cubierta por los puntos de cada patrón. */
const DOT_COVERAGE: Partial<Record<HatchId, number>> = { dots10: 0.1, dots20: 0.2, dots30: 0.3 };

/**
 * Trazos del patrón que cubren `box` (en unidades de salida, y hacia abajo). El recorte al contorno lo hace quien
 * dibuja. Los puntos son filas discontinuas (un segmento por fila, al tresbolillo), así el /AP queda pequeño.
 */
export function hatchStrokes(box: HatchBox, id: HatchId, unitsPerPt = 1): HatchStroke[] {
  if (!(box.width > 0) || !(box.height > 0) || !(unitsPerPt > 0)) return [];
  const s = HATCH_SPACING_PT * unitsPerPt;
  const width = HATCH_LINE_PT * unitsPerPt;

  const coverage = DOT_COVERAGE[id];
  if (coverage !== undefined) {
    const p = HATCH_DOT_PITCH_PT * unitsPerPt;
    const dot = p * Math.sqrt(coverage);
    const segs: Seg[] = steps(box.y - p, box.y + box.height + p, p).map((k) => {
      // Fila desplazada medio paso en las impares; empieza en un múltiplo del paso para quedar anclada
      const shift = Math.abs(k) % 2 === 1 ? p / 2 : 0;
      const x0 = Math.floor((box.x - shift) / p) * p + shift - p;
      return [
        { x: x0, y: k * p + p / 2 },
        { x: box.x + box.width + p, y: k * p + p / 2 },
      ];
    });
    return [{ d: segsToD(segs), width: dot, dash: [dot, p - dot] }];
  }

  const angle = id === 'diagonalDown' || id === 'diagonalBrick' || id === 'weave' ? Math.PI / 4 : id === 'diagonalUp' ? -Math.PI / 4 : 0;
  const fb = frameBox(box, angle);
  let segs: Seg[];
  switch (id) {
    case 'horizontal':
    case 'diagonalDown':
    case 'diagonalUp':
      segs = horizontals(fb, s);
      break;
    case 'vertical':
      segs = verticals(fb, s);
      break;
    case 'grid':
      segs = [...horizontals(fb, s), ...verticals(fb, s)];
      break;
    case 'brick':
    case 'diagonalBrick':
      segs = brick(fb, s);
      break;
    case 'weave':
      segs = weave(fb, s);
      break;
    default:
      return [];
  }
  return [{ d: segsToD(rotateSegs(segs, angle)), width }];
}

/** Contorno cerrado (trazado SVG con M/L/C/Z) de una forma con hatch, a partir de sus puntos ya en la salida. */
export function hatchOutlineD(type: string, pts: Pt[], cloudD?: string): string | null {
  if (type === 'cloud' || type === 'cloudPlus') return cloudD || (pts.length >= 3 ? polygonD(pts) : null);
  if (type === 'rectangle' || (type === 'area' && pts.length === 2)) {
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return polygonD([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]);
  }
  if (type === 'circle') {
    if (pts.length < 2) return null;
    const [a, b] = pts;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    const k = 0.5522847498;
    return (
      `M ${f(cx + rx)} ${f(cy)} ` +
      `C ${f(cx + rx)} ${f(cy + ry * k)} ${f(cx + rx * k)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} ` +
      `C ${f(cx - rx * k)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ry * k)} ${f(cx - rx)} ${f(cy)} ` +
      `C ${f(cx - rx)} ${f(cy - ry * k)} ${f(cx - rx * k)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} ` +
      `C ${f(cx + rx * k)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ry * k)} ${f(cx + rx)} ${f(cy)} Z`
    );
  }
  return pts.length >= 3 ? polygonD(pts) : null;
}

function polygonD(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${f(p.x)} ${f(p.y)}`).join(' ') + ' Z';
}

/** Caja envolvente de un trazado SVG M/L/Q/C (sus coordenadas, incluidos los puntos de control). */
export function pathBox(d: string): HatchBox | null {
  const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 4) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]);
    x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]);
    y1 = Math.max(y1, nums[i + 1]);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
