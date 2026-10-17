import { LineEndingStyle } from '../../types/markup';
import { isPatternLineStyle, PatternLineStyleId } from './linePatterns';

/**
 * Tipos de línea y extremos (ADR-0018). Puro: sin React ni DOM.
 * Los patrones se expresan en puntos de página y son proporcionales al grosor, como en los editores técnicos:
 * una línea discontinua de 4 pt tiene trazos más largos que una de 1 pt. La pantalla los escala con el zoom y
 * el PDF los usa tal cual, así la discontinua se ve igual en REA, en Revu y en Acrobat.
 */

/** Patrones discontinuos (ADR-0018): Dashed 1 a 6 de Revu, más el punteado (ADR-0041). */
export type DashStyleId = 'solid' | 'dashed' | 'dashed2' | 'dashed3' | 'dashDot' | 'dashed5' | 'dashed6' | 'dotted';
/** Tipo de línea: discontinuo o con patrón (nube, valla, gas, etc., ADR-0041). */
export type LineStyleId = DashStyleId | PatternLineStyleId;

export const LINE_STYLE_LABELS: Record<LineStyleId, string> = {
  solid: 'Solid',
  dashed: 'Dashed 1',
  dashed2: 'Dashed 2',
  dashed3: 'Dashed 3',
  dashDot: 'Dashed 4',
  dashed5: 'Dashed 5',
  dashed6: 'Dashed 6',
  dotted: 'Dotted',
  cloud: 'Cloud',
  fenceCircle: 'Fenceline Circle',
  fenceSquare: 'Fenceline Square',
  gas: 'Gas',
  hotWater: 'Hot Water',
  zigzag: 'Zig Zag',
  insulation: 'Insulation',
  double: 'Double',
  tracks: 'Tracks',
  road: 'Road',
};

const DASH_PATTERNS: Record<Exclude<DashStyleId, 'solid'>, number[]> = {
  dashed: [4, 3],
  dashed2: [2.5, 2.5],
  dashed3: [7, 4],
  dashDot: [6, 2.5, 1, 2.5],
  dashed5: [8, 3, 3, 3],
  dashed6: [10, 5],
  dotted: [1, 2],
};

export const LINE_ENDING_LABELS: Record<LineEndingStyle, string> = {
  none: 'None',
  openArrow: 'Open arrow',
  closedArrow: 'Closed arrow',
  circle: 'Circle',
  square: 'Square',
  diamond: 'Diamond',
  butt: 'Butt',
  slash: 'Slash (architectural)',
  rOpenArrow: 'Reverse open arrow',
  rClosedArrow: 'Reverse closed arrow',
};

/** Patrón de trazo (pt) para un tipo de línea y grosor; `undefined` = continua. */
export function dashArrayFor(id: LineStyleId, strokeWidth: number): number[] | undefined {
  const w = Number.isFinite(strokeWidth) && strokeWidth > 0 ? Math.max(0.75, strokeWidth) : 1;
  if (id === 'solid' || isPatternLineStyle(id)) return undefined;
  const base = DASH_PATTERNS[id as Exclude<DashStyleId, 'solid'>];
  return base ? base.map((v) => v * w) : undefined;
}

/** Clasifica un patrón existente (incluidos los antiguos, p. ej. [6, 4]) para mostrarlo en la interfaz. */
export function lineStyleOf(dashArray: number[] | undefined): DashStyleId {
  if (!dashArray || dashArray.length === 0) return 'solid';
  // Patrones propios: mismas proporciones que alguno de la lista
  for (const [id, base] of Object.entries(DASH_PATTERNS)) {
    if (base.length !== dashArray.length) continue;
    const ratio = dashArray[0] / base[0];
    if (ratio > 0 && base.every((v, i) => Math.abs(dashArray[i] / v - ratio) <= ratio * 0.03)) return id as DashStyleId;
  }
  if (dashArray.length >= 4) return 'dashDot';
  return dashArray[0] <= dashArray[1] ? 'dotted' : 'dashed';
}

/**
 * Tipo de línea que muestra la interfaz para una marca: la nube propia (o su discontinuo, ADR-0067), el patrón
 * guardado o el discontinuo.
 */
export function lineStyleOfMarkup(m: { type: string; style: { dashArray?: number[]; lineStyle?: string } }): LineStyleId {
  if (m.type === 'cloud' || m.type === 'cloudPlus') return m.style.dashArray?.length ? lineStyleOf(m.style.dashArray) : 'cloud';
  if (isPatternLineStyle(m.style.lineStyle)) return m.style.lineStyle;
  return lineStyleOf(m.style.dashArray);
}
