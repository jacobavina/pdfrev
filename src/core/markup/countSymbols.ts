/**
 * Count de Revu (ADR-0059): una sola marca reúne todos los clics del conteo y dibuja en cada uno el mismo símbolo
 * (palomita, triángulo, cuadrado, círculo o rombo), del color de la línea y a la escala elegida. Puro: la misma
 * geometría sirve para la pantalla, el /AP y el aplanado. Los conteos anteriores (sin símbolo) siguen siendo un
 * círculo numerado por marca.
 */

export const COUNT_SYMBOLS = [
  { id: 'check', label: 'Check' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'square', label: 'Square' },
  { id: 'circle', label: 'Circle' },
  { id: 'diamond', label: 'Diamond' },
] as const;

export type CountSymbolId = (typeof COUNT_SYMBOLS)[number]['id'];

const SYMBOL_IDS = new Set<string>(COUNT_SYMBOLS.map((s) => s.id));

/** Tamaño del símbolo al 100 %, en pt de página. */
export const COUNT_BASE_PT = 18;
export const COUNT_SCALE_MIN = 10;
export const COUNT_SCALE_MAX = 1000;

interface CountLike {
  type: string;
  points: { x: number; y: number }[];
  customFields?: Record<string, string | number>;
}

export function isCountSymbol(v: unknown): v is CountSymbolId {
  return typeof v === 'string' && SYMBOL_IDS.has(v);
}

/** Símbolo de un conteo de Revu; null en los conteos numerados anteriores a ADR-0059. */
export function countSymbolOf(markup: CountLike): CountSymbolId | null {
  const s = markup.customFields?.countSymbol;
  return markup.type === 'count' && isCountSymbol(s) ? s : null;
}

/** Escala del símbolo en %, entre 10 y 1000 (100 por defecto). */
export function clampCountScale(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(COUNT_SCALE_MIN, Math.min(COUNT_SCALE_MAX, Math.round(n))) : 100;
}

export function countScaleOf(markup: CountLike): number {
  return clampCountScale(markup.customFields?.countScale ?? 100);
}

/** Tamaño del símbolo en pt de página. */
export function countSymbolSizePt(markup: CountLike): number {
  return (COUNT_BASE_PT * countScaleOf(markup)) / 100;
}

/** Elementos que cuenta la marca: cada clic en un conteo de Revu; uno en los numerados. */
export function countItems(markup: CountLike): number {
  if (markup.type !== 'count') return 0;
  return countSymbolOf(markup) ? markup.points.length : 1;
}

/** Medición de un conteo de Revu con `n` elementos. */
export function countMeasurement(n: number): { value: number; unit: 'm'; formatted: string } {
  const v = Math.max(0, Math.floor(n));
  return { value: v, unit: 'm', formatted: `Count = ${v}` };
}

const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(Number(n.toFixed(2))));

/** Trazado de un símbolo de lado `s` centrado en (cx, cy) (y hacia abajo). */
function symbolD(symbol: CountSymbolId, cx: number, cy: number, s: number): string {
  const P = (x: number, y: number) => `${f(cx + x * s)} ${f(cy + y * s)}`;
  switch (symbol) {
    case 'check':
      return `M ${P(-0.42, 0.02)} L ${P(-0.12, 0.32)} L ${P(0.45, -0.36)}`;
    case 'triangle':
      return `M ${P(0, -0.42)} L ${P(0.45, 0.36)} L ${P(-0.45, 0.36)} Z`;
    case 'square':
      return `M ${P(-0.4, -0.4)} L ${P(0.4, -0.4)} L ${P(0.4, 0.4)} L ${P(-0.4, 0.4)} Z`;
    case 'diamond':
      return `M ${P(0, -0.48)} L ${P(0.48, 0)} L ${P(0, 0.48)} L ${P(-0.48, 0)} Z`;
    case 'circle': {
      const r = 0.42;
      const k = 0.5522847498 * r;
      return (
        `M ${P(r, 0)} C ${P(r, k)} ${P(k, r)} ${P(0, r)} C ${P(-k, r)} ${P(-r, k)} ${P(-r, 0)} ` +
        `C ${P(-r, -k)} ${P(-k, -r)} ${P(0, -r)} C ${P(k, -r)} ${P(r, -k)} ${P(r, 0)} Z`
      );
    }
  }
}

/**
 * Símbolos de todos los puntos de un conteo, como un solo trazado (sin relleno) y su grosor, en unidades de salida:
 * `pts` ya están en la salida y `size` es el lado del símbolo en esas unidades.
 */
export function countSymbolsPath(symbol: CountSymbolId, pts: { x: number; y: number }[], size: number): { d: string; width: number } {
  return {
    d: pts.map((p) => symbolD(symbol, p.x, p.y, size)).join(' '),
    width: size * (symbol === 'check' ? 0.16 : 0.09),
  };
}
