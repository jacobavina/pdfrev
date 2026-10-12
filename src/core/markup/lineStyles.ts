import { LineEndingStyle } from '../../types/markup';

/**
 * Tipos de línea y extremos (ADR-0018). Puro: sin React ni DOM.
 * Los patrones se expresan en puntos de página y son proporcionales al grosor, como en los editores técnicos:
 * una línea discontinua de 4 pt tiene trazos más largos que una de 1 pt. La pantalla los escala con el zoom y
 * el PDF los usa tal cual, así la discontinua se ve igual en REA, en Revu y en Acrobat.
 */

export type LineStyleId = 'solid' | 'dashed' | 'dotted' | 'dashDot';

export const LINE_STYLE_LABELS: Record<LineStyleId, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
  dashDot: 'Dash-dot',
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
};

/** Patrón de trazo (pt) para un tipo de línea y grosor; `undefined` = continua. */
export function dashArrayFor(id: LineStyleId, strokeWidth: number): number[] | undefined {
  const w = Number.isFinite(strokeWidth) && strokeWidth > 0 ? Math.max(0.75, strokeWidth) : 1;
  switch (id) {
    case 'dashed':
      return [4 * w, 3 * w];
    case 'dotted':
      return [w, 2 * w];
    case 'dashDot':
      return [6 * w, 2.5 * w, w, 2.5 * w];
    default:
      return undefined;
  }
}

/** Clasifica un patrón existente (incluidos los antiguos, p. ej. [6, 4]) para mostrarlo en la interfaz. */
export function lineStyleOf(dashArray: number[] | undefined): LineStyleId {
  if (!dashArray || dashArray.length === 0) return 'solid';
  if (dashArray.length >= 4) return 'dashDot';
  return dashArray[0] <= dashArray[1] ? 'dotted' : 'dashed';
}
