import { MarkupType } from '../../types/markup';

/** Nombre visible (español) de cada tipo de marca: lista de marcas, menú contextual y paneles (ADR-0017). */
export const MARKUP_TYPE_LABELS: Record<MarkupType, string> = {
  line: 'Line',
  rectangle: 'Rectangle',
  circle: 'Ellipse',
  polygon: 'Polygon',
  polyLine: 'Polyline',
  arc: 'Arc',
  cloud: 'Cloud',
  cloudPlus: 'Cloud+',
  callout: 'Callout',
  text: 'Text Box',
  typewriter: 'Typewriter',
  stickyNote: 'Note',
  freehand: 'Pen',
  highlight: 'Highlight',
  highlightVector: 'Highlight',
  highlightText: 'Text Highlight',
  underline: 'Underline',
  strikeOut: 'Strikethrough',
  squiggly: 'Squiggly',
  stamp: 'Stamp',
  dimension: 'Dimension',
  link: 'Hyperlink',
  fileAttachment: 'File Attachment',
  formField: 'Form Field',
  length: 'Length',
  polylineMeasure: 'Polylength',
  area: 'Area',
  count: 'Count',
  perimeter: 'Perimeter',
  angle: 'Angle',
  radius: 'Radius',
  diameter: 'Diameter',
  volume: 'Volume',
};

export function markupTypeLabel(type: string): string {
  return (MARKUP_TYPE_LABELS as Record<string, string>)[type] ?? type;
}

/** Relleno translúcido derivado del color de trazo o relleno (#rgb, #rrggbb, rgb, rgba), para áreas medidas y marcas con opacidad. */
export function translucentFill(baseColor: string | undefined, alpha = 0.2): string {
  const c = (baseColor ?? '').trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  const mRgba = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  let rgb: [number, number, number] | null = null;
  if (m6) rgb = [parseInt(m6[1], 16), parseInt(m6[2], 16), parseInt(m6[3], 16)];
  else if (m3) rgb = [parseInt(m3[1] + m3[1], 16), parseInt(m3[2] + m3[2], 16), parseInt(m3[3] + m3[3], 16)];
  else if (mRgba) rgb = [parseInt(mRgba[1], 10), parseInt(mRgba[2], 10), parseInt(mRgba[3], 10)];
  if (!rgb) return `rgba(59, 130, 246, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
