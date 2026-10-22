import type { Markup } from '../../types/markup';
import { BtxItem } from './btx';

/**
 * Lo que el lector de PDF no distingue (ADR-0101): Revu usa el mismo subtipo PDF (Polygon, PolyLine, Ink) para cosas
 * distintas y lo aclara en /IT, en el tipo de la herramienta y en /BM. Aquí se afina la marca que dio el lector.
 */

/** Hoja temporal en la que se vuelcan las herramientas (Carta, en pt). */
export const BTX_PAGE_W = 612;
export const BTX_PAGE_H = 792;

export const shortBtxType = (t: string) => t.replace(/^Bluebeam\.PDF\.Annotations\./, '');

const intentOf = (dict: string) => /\/IT\s*\/(\w+)/.exec(dict)?.[1];

/** Símbolos de conteo de Revu que tienen equivalente en REA. */
const COUNT_STYLE_TO_SYMBOL: Record<string, string> = {
  Triangle: 'triangle',
  Square: 'square',
  Circle: 'circle',
  Diamond: 'diamond',
  Checkmark: 'check',
  Check: 'check',
};

/** Puntos del primer trazo de /InkList, normalizados a la hoja temporal. */
function inkPoints(dict: string): { x: number; y: number }[] {
  const m = /\/InkList\s*\[\s*\[([^\]]+)\]/.exec(dict);
  if (!m) return [];
  const nums = m[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i] / BTX_PAGE_W, y: 1 - nums[i + 1] / BTX_PAGE_H });
  return pts;
}

const boxOf = (pts: { x: number; y: number }[]) => [
  { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) },
  { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) },
];

export function refineImportedMarkup(item: BtxItem, markup: Markup, countSymbols: readonly string[]): Markup {
  const it = intentOf(item.dict);
  const t = shortBtxType(item.type);
  const out: Markup = { ...markup, customFields: { ...(markup.customFields ?? {}) } };
  if (it === 'PolygonCloud' || (t === 'AnnotationPolygon' && /\/BE\s*<</.test(item.dict) && /\/S\s*\/C\b/.test(item.dict))) {
    out.type = 'cloud';
  } else if (it === 'LineDimension' && /\/MeasurementTypes/.test(item.dict) && (markup.type === 'dimension' || markup.type === 'line')) {
    // La distancia de Revu y su cota usan el mismo subtipo; /MeasurementTypes distingue la medición
    out.type = 'length';
  } else if (it === 'Polylength') {
    out.type = 'polylineMeasure';
  } else if (it === 'PolygonRadius' && markup.points.length >= 3) {
    // Revu guarda el radio como un triángulo: centro, punto del borde y su proyección
    out.type = 'radius';
    out.points = markup.points.slice(1, 3);
  } else if (
    t === 'AnnotationMeasurePerimeter' &&
    (markup.type === 'polygon' || markup.type === 'polyLine' || markup.type === 'polylineMeasure')
  ) {
    out.type = 'perimeter';
  } else if (t === 'AnnotationInk') {
    const ink = inkPoints(item.dict);
    if (/\/BM\s*\/Multiply/.test(item.dict)) {
      // El resaltador de Revu es un trazo con mezcla "Multiply": en REA, el resaltador vectorial
      out.type = 'highlightVector';
      if (ink.length >= 2) out.points = boxOf(ink);
    } else {
      out.type = 'freehand';
      if (ink.length >= 2) out.points = ink;
    }
  }
  if (out.type === 'count') {
    const symbol = COUNT_STYLE_TO_SYMBOL[/\/CountStyle\s*\/(\w+)/.exec(item.dict)?.[1] ?? ''];
    if (symbol && countSymbols.includes(symbol)) out.customFields!.countSymbol = symbol;
    const scale = Number(/\/CountScale\s+([\d.]+)/.exec(item.dict)?.[1]);
    if (Number.isFinite(scale) && scale > 0) out.customFields!.countScale = Math.round(scale * 100);
  }
  return out;
}
