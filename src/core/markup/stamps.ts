import { getHelveticaTextWidth } from './helveticaMetrics';

/**
 * Sellos predeterminados (ADR-0026), como los de Revu y Foxit para revisión de obra: texto en mayúsculas con doble
 * marco del color del sello y, debajo, autor y fecha capturados al colocarlo (sello dinámico). Geometría única para
 * pantalla, /AP y aplanado: todo se expresa en proporción a la caja, así el sello escala al redimensionarlo.
 */

export interface StampDef {
  id: string;
  label: string;
  color: string;
  /** Nombre estándar de /Stamp (ISO 32000-1 §12.5.6.12) cuando existe uno equivalente. */
  pdfName?: string;
  group: 'Review' | 'Status' | 'Document';
}

export const STAMPS: StampDef[] = [
  { id: 'approved', label: 'APPROVED', color: '#15803d', pdfName: 'Approved', group: 'Review' },
  { id: 'approved-as-noted', label: 'APPROVED AS NOTED', color: '#15803d', group: 'Review' },
  { id: 'no-exceptions', label: 'NO EXCEPTIONS TAKEN', color: '#15803d', group: 'Review' },
  { id: 'make-corrections', label: 'MAKE CORRECTIONS NOTED', color: '#c2410c', group: 'Review' },
  { id: 'revise-resubmit', label: 'REVISE AND RESUBMIT', color: '#c2410c', group: 'Review' },
  { id: 'rejected', label: 'REJECTED', color: '#b91c1c', pdfName: 'NotApproved', group: 'Review' },
  { id: 'reviewed', label: 'REVIEWED', color: '#1d4ed8', group: 'Review' },
  { id: 'for-construction', label: 'FOR CONSTRUCTION', color: '#15803d', group: 'Status' },
  { id: 'not-for-construction', label: 'NOT FOR CONSTRUCTION', color: '#b91c1c', group: 'Status' },
  { id: 'preliminary', label: 'PRELIMINARY', color: '#c2410c', group: 'Status' },
  { id: 'for-information', label: 'FOR INFORMATION ONLY', color: '#1d4ed8', group: 'Status' },
  { id: 'as-built', label: 'AS-BUILT', color: '#1d4ed8', group: 'Status' },
  { id: 'completed', label: 'COMPLETED', color: '#15803d', group: 'Status' },
  { id: 'void', label: 'VOID', color: '#b91c1c', group: 'Status' },
  { id: 'draft', label: 'DRAFT', color: '#4b5563', pdfName: 'Draft', group: 'Document' },
  { id: 'final', label: 'FINAL', color: '#1d4ed8', pdfName: 'Final', group: 'Document' },
  { id: 'revised', label: 'REVISED', color: '#c2410c', group: 'Document' },
  { id: 'confidential', label: 'CONFIDENTIAL', color: '#b91c1c', pdfName: 'Confidential', group: 'Document' },
  { id: 'for-comment', label: 'FOR COMMENT', color: '#1d4ed8', pdfName: 'ForComment', group: 'Document' },
];

export function stampById(id: string | undefined): StampDef {
  return STAMPS.find((s) => s.id === id) ?? STAMPS[0];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Línea dinámica del sello, como la de los sellos dinámicos de Revu y Acrobat (ADR-0040):
 * "By Ana at 4:51 pm, Oct 15, 2026".
 */
export function stampSubtitle(author: string, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return author ? `By ${author}` : '';
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return author ? `By ${author} at ${time}, ${date}` : `${time}, ${date}`;
}

/** Ancho aproximado de Helvetica-Bold (≈ 7 % más ancha que la regular). */
export function boldTextWidth(text: string, size: number): number {
  return getHelveticaTextWidth(text, size) * 1.07;
}

/** Tamaño por defecto del sello en pt (para colocarlo con un clic). */
export function defaultStampSizePt(label: string, subtitle: string): { width: number; height: number } {
  const titleW = boldTextWidth(label, 16);
  const subW = getHelveticaTextWidth(subtitle, 7);
  return { width: Math.max(titleW, subW) + 24, height: subtitle ? 42 : 30 };
}

export interface StampLayout {
  outer: { x: number; y: number; w: number; h: number };
  /** Radio de las esquinas del marco (marco único redondeado, ADR-0040). */
  radius: number;
  titleSize: number;
  /** Centro de la línea base del título y del subtítulo (y hacia abajo). */
  titleBaseline: { x: number; y: number };
  subSize: number;
  subBaseline: { x: number; y: number } | null;
  outerStroke: number;
}

/**
 * Distribución del sello dentro de su caja (cualquier unidad, y hacia abajo). El título se reduce si no cabe a lo
 * ancho para no salirse del marco.
 */
export function stampLayout(box: { x: number; y: number; w: number; h: number }, label: string, subtitle: string): StampLayout {
  const { x, y, w, h } = box;
  const inset = Math.max(1.5, h * 0.07);
  // Marco único con esquinas redondeadas, como los sellos de Revu y Acrobat (ADR-0040)
  const outerStroke = Math.max(1, h * 0.055);
  let titleSize = h * (subtitle ? 0.38 : 0.5);
  const maxTitleW = w - inset * 4;
  const tw = boldTextWidth(label, titleSize);
  if (tw > maxTitleW && tw > 0) titleSize *= maxTitleW / tw;
  let subSize = h * 0.16;
  const sw = getHelveticaTextWidth(subtitle, subSize);
  if (subtitle && sw > maxTitleW && sw > 0) subSize *= maxTitleW / sw;
  const titleY = subtitle ? y + h * 0.5 : y + h / 2 + titleSize * 0.36;
  return {
    outer: { x, y, w, h },
    radius: Math.min(h * 0.2, w / 2),
    titleSize,
    titleBaseline: { x: x + w / 2, y: titleY },
    subSize,
    subBaseline: subtitle ? { x: x + w / 2, y: y + h * 0.8 } : null,
    outerStroke,
  };
}
