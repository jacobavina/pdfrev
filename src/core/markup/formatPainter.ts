import type { Markup, MarkupStyle, MarkupTextFormat } from '../../types/markup';
import { PATTERN_MARKUP_TYPES } from './linePatterns';

/**
 * Format Painter (ADR-0109): toma el aspecto de una marca y lo aplica a otras. Puro.
 * Se copia el formato, no la forma ni el contenido: color, relleno, grosor, opacidad, tipo de línea, tipografía.
 */

export interface MarkupFormat {
  style: MarkupStyle;
  textFormat?: MarkupTextFormat;
  /** Tipo de la marca de origen, para el mensaje. */
  from: Markup['type'];
}

const LINE_ENDING_TYPES = new Set<Markup['type']>(['line', 'polyLine', 'length', 'polylineMeasure', 'callout', 'dimension']);
const CLOSED_TYPES = new Set<Markup['type']>(['rectangle', 'circle', 'polygon', 'cloud', 'area', 'perimeter', 'volume']);
/** Marcas cuyo color de línea no es el aspecto de un trazo (texto, sellos, imágenes, campos). */
const NO_FORMAT_TYPES = new Set<Markup['type']>(['stamp', 'image', 'link', 'fileAttachment', 'formField', 'count']);

export function canCopyFormat(m: Pick<Markup, 'type'>): boolean {
  return !NO_FORMAT_TYPES.has(m.type);
}

export function canPasteFormat(m: Pick<Markup, 'type' | 'locked'>): boolean {
  return !m.locked && !NO_FORMAT_TYPES.has(m.type);
}

export function captureFormat(m: Markup): MarkupFormat {
  return {
    style: { ...m.style, dashArray: m.style.dashArray ? [...m.style.dashArray] : undefined },
    textFormat: m.textFormat ? { ...m.textFormat } : undefined,
    from: m.type,
  };
}

/**
 * La marca con el formato aplicado. Los extremos de línea solo pasan a las líneas, el hatch a las formas cerradas y
 * el tipo de línea con patrón a las marcas que lo admiten; la nube no se convierte (eso es una forma, no un formato).
 */
export function applyFormat(target: Markup, format: MarkupFormat, now: string): Markup {
  const src = format.style;
  const style: MarkupStyle = {
    ...target.style,
    strokeColor: src.strokeColor,
    strokeWidth: src.strokeWidth,
    opacity: src.opacity,
    fillColor: src.fillColor,
    dashArray: src.dashArray ? [...src.dashArray] : undefined,
    ...(src.textColor !== undefined ? { textColor: src.textColor } : {}),
    ...(src.fontFamily !== undefined ? { fontFamily: src.fontFamily } : {}),
    ...(src.fontSize !== undefined ? { fontSize: src.fontSize } : {}),
  };
  if (PATTERN_MARKUP_TYPES.has(target.type) && target.type !== 'cloud') style.lineStyle = src.lineStyle;
  if (CLOSED_TYPES.has(target.type)) style.hatch = src.hatch;
  if (LINE_ENDING_TYPES.has(target.type)) {
    style.lineEndingStart = src.lineEndingStart;
    style.lineEndingEnd = src.lineEndingEnd;
  }
  return {
    ...target,
    style,
    textFormat: format.textFormat ? { ...format.textFormat } : target.textFormat,
    updatedAt: now,
  };
}
