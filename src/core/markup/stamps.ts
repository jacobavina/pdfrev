import { getHelveticaTextWidth } from './helveticaMetrics';

/**
 * Sellos predeterminados (ADR-0026, catálogo de Revu y Foxit en ADR-0045). Texto dinámico (autor, fecha y hora)
 * capturado al colocarlos. Geometría única para pantalla, /AP y aplanado (`stampArt.ts`): todo se expresa en
 * proporción a la caja, así el sello escala al redimensionarlo.
 */

/**
 * Familias de dibujo (ADR-0045): `outline` es el sello de obra con marco redondeado (ADR-0040); `filled` los de Foxit
 * (caja de color con marco blanco interior, texto blanco e icono); `text` los de Revu (título en negrita de color y
 * línea de fecha); `date`, `tag`, `seal`, `watermark`, `released` y `proprietary` los demás de Revu.
 */
export type StampKind = 'outline' | 'filled' | 'text' | 'date' | 'tag' | 'seal' | 'watermark' | 'released' | 'proprietary';
export type StampIconId =
  | 'check'
  | 'x'
  | 'triangle'
  | 'pencil'
  | 'search'
  | 'envelope'
  | 'stamp'
  | 'clock'
  | 'warning'
  | 'document'
  | 'lock'
  | 'clipboard';
export type StampGroup = 'Review' | 'Dynamic' | 'Standard' | 'Sign Here' | 'Construction';

export interface StampDef {
  id: string;
  label: string;
  color: string;
  /** Nombre estándar de /Stamp (ISO 32000-1 §12.5.6.12) cuando existe uno equivalente. */
  pdfName?: string;
  group: StampGroup;
  /** Familia de dibujo; sin ella, el sello de obra con marco (`outline`). */
  kind?: StampKind;
  icon?: StampIconId;
  /** Línea dinámica: `by` (By X at…, obra), `foxit` (autor, fecha y hora), `revu` (fecha y hora); `none` sin ella. */
  dynamic?: 'by' | 'foxit' | 'revu' | 'none';
  /** Marco fino alrededor del texto (Approved de Revu). */
  bordered?: boolean;
  /** Formato de los sellos de fecha: día/mes/año o día.mes.año (europeo). */
  date?: 'dmy' | 'dot';
  time?: boolean;
}

const FX_GREEN = '#3f9a73';
const FX_BLUE = '#2a69ad';
const FX_RED = '#d14b32';

export const STAMPS: StampDef[] = [
  // Revu
  { id: 'rv-for-review', label: 'For Review', color: '#7cb342', group: 'Review', kind: 'text', dynamic: 'revu' },
  { id: 'rv-approved', label: 'APPROVED', color: '#1f2937', group: 'Review', kind: 'text', dynamic: 'none', bordered: true },
  { id: 'rv-date', label: 'Date', color: '#e02424', group: 'Review', kind: 'date', date: 'dmy', dynamic: 'none' },
  { id: 'rv-datetime', label: 'Date Time', color: '#e02424', group: 'Review', kind: 'date', date: 'dmy', time: true, dynamic: 'none' },
  { id: 'rv-draft-print', label: 'Draft Print', color: '#4a86c5', group: 'Review', kind: 'text', dynamic: 'revu' },
  { id: 'rv-eu-date', label: 'European Date', color: '#e02424', group: 'Review', kind: 'date', date: 'dot', dynamic: 'none' },
  { id: 'rv-eu-datetime', label: 'European Date Time', color: '#e02424', group: 'Review', kind: 'date', date: 'dot', time: true, dynamic: 'none' },
  { id: 'rv-preliminary', label: 'Preliminary', color: '#8b1a1a', group: 'Review', kind: 'text', dynamic: 'revu' },
  { id: 'rv-proprietary', label: 'Proprietary and Confidential', color: '#e02424', group: 'Review', kind: 'proprietary', dynamic: 'none' },
  { id: 'rv-released', label: 'RELEASED', color: '#e02424', group: 'Review', kind: 'released', dynamic: 'none' },
  { id: 'rv-revised', label: 'Revised', color: '#f08c00', group: 'Review', kind: 'text', dynamic: 'revu' },
  { id: 'rv-tag', label: 'Sample Text', color: '#e02424', group: 'Review', kind: 'tag', dynamic: 'none' },
  { id: 'rv-seal', label: 'SEAL', color: '#1f2937', group: 'Review', kind: 'seal', dynamic: 'none' },
  { id: 'rv-watermark', label: 'Watermark', color: '#9ca3af', group: 'Review', kind: 'watermark', dynamic: 'none' },
  // Foxit: dinámicos (autor, fecha y hora)
  { id: 'dyn-approved', label: 'APPROVED', color: FX_GREEN, group: 'Dynamic', kind: 'filled', dynamic: 'foxit' },
  { id: 'dyn-revised', label: 'REVISED', color: FX_GREEN, group: 'Dynamic', kind: 'filled', dynamic: 'foxit' },
  { id: 'dyn-reviewed', label: 'REVIEWED', color: FX_GREEN, group: 'Dynamic', kind: 'filled', dynamic: 'foxit' },
  { id: 'dyn-received', label: 'RECEIVED', color: FX_GREEN, group: 'Dynamic', kind: 'filled', dynamic: 'foxit' },
  { id: 'dyn-confidential', label: 'CONFIDENTIAL', color: FX_GREEN, group: 'Dynamic', kind: 'filled', dynamic: 'foxit' },
  // Foxit: estándar con icono
  { id: 'std-approved', label: 'APPROVED', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'check', pdfName: 'Approved', dynamic: 'none' },
  { id: 'std-void', label: 'VOID', color: FX_RED, group: 'Standard', kind: 'filled', icon: 'x', dynamic: 'none' },
  { id: 'std-verified', label: 'VERIFIED', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'triangle', dynamic: 'none' },
  { id: 'std-revised', label: 'REVISED', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'pencil', dynamic: 'none' },
  { id: 'std-reviewed', label: 'REVIEWED', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'search', dynamic: 'none' },
  { id: 'std-received', label: 'RECEIVED', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'envelope', dynamic: 'none' },
  { id: 'std-final', label: 'FINAL', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'stamp', pdfName: 'Final', dynamic: 'none' },
  { id: 'std-expired', label: 'EXPIRED', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'clock', pdfName: 'Expired', dynamic: 'none' },
  { id: 'std-emergency', label: 'EMERGENCY', color: FX_RED, group: 'Standard', kind: 'filled', icon: 'warning', dynamic: 'none' },
  { id: 'std-draft', label: 'DRAFT', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'document', pdfName: 'Draft', dynamic: 'none' },
  { id: 'std-confidential', label: 'CONFIDENTIAL', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'lock', pdfName: 'Confidential', dynamic: 'none' },
  { id: 'std-completed', label: 'COMPLETED', color: FX_BLUE, group: 'Standard', kind: 'filled', icon: 'clipboard', dynamic: 'none' },
  // Foxit: firma
  { id: 'sign-accepted', label: 'ACCEPTED', color: FX_GREEN, group: 'Sign Here', kind: 'filled', dynamic: 'none' },
  { id: 'sign-witness', label: 'WITNESS', color: FX_GREEN, group: 'Sign Here', kind: 'filled', dynamic: 'none' },
  { id: 'sign-here', label: 'SIGN HERE', color: FX_GREEN, group: 'Sign Here', kind: 'filled', dynamic: 'none' },
  { id: 'sign-rejected', label: 'REJECTED', color: FX_RED, group: 'Sign Here', kind: 'filled', pdfName: 'NotApproved', dynamic: 'none' },
  { id: 'sign-initial', label: 'INITIAL', color: FX_GREEN, group: 'Sign Here', kind: 'filled', dynamic: 'none' },
  // Obra (ADR-0026/0040): marco redondeado y "By … at …"
  { id: 'approved', label: 'APPROVED', color: '#15803d', pdfName: 'Approved', group: 'Construction' },
  { id: 'approved-as-noted', label: 'APPROVED AS NOTED', color: '#15803d', group: 'Construction' },
  { id: 'no-exceptions', label: 'NO EXCEPTIONS TAKEN', color: '#15803d', group: 'Construction' },
  { id: 'make-corrections', label: 'MAKE CORRECTIONS NOTED', color: '#c2410c', group: 'Construction' },
  { id: 'revise-resubmit', label: 'REVISE AND RESUBMIT', color: '#c2410c', group: 'Construction' },
  { id: 'rejected', label: 'REJECTED', color: '#b91c1c', pdfName: 'NotApproved', group: 'Construction' },
  { id: 'reviewed', label: 'REVIEWED', color: '#1d4ed8', group: 'Construction' },
  { id: 'for-construction', label: 'FOR CONSTRUCTION', color: '#15803d', group: 'Construction' },
  { id: 'not-for-construction', label: 'NOT FOR CONSTRUCTION', color: '#b91c1c', group: 'Construction' },
  { id: 'preliminary', label: 'PRELIMINARY', color: '#c2410c', group: 'Construction' },
  { id: 'for-information', label: 'FOR INFORMATION ONLY', color: '#1d4ed8', group: 'Construction' },
  { id: 'as-built', label: 'AS-BUILT', color: '#1d4ed8', group: 'Construction' },
  { id: 'completed', label: 'COMPLETED', color: '#15803d', group: 'Construction' },
  { id: 'void', label: 'VOID', color: '#b91c1c', group: 'Construction' },
  { id: 'draft', label: 'DRAFT', color: '#4b5563', pdfName: 'Draft', group: 'Construction' },
  { id: 'final', label: 'FINAL', color: '#1d4ed8', pdfName: 'Final', group: 'Construction' },
  { id: 'revised', label: 'REVISED', color: '#c2410c', group: 'Construction' },
  { id: 'confidential', label: 'CONFIDENTIAL', color: '#b91c1c', pdfName: 'Confidential', group: 'Construction' },
  { id: 'for-comment', label: 'FOR COMMENT', color: '#1d4ed8', pdfName: 'ForComment', group: 'Construction' },
];

export const STAMP_GROUPS: StampGroup[] = ['Review', 'Dynamic', 'Standard', 'Sign Here', 'Construction'];

export function stampById(id: string | undefined): StampDef {
  return STAMPS.find((s) => s.id === id) ?? STAMPS.find((s) => s.id === 'approved')!;
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

/**
 * Título y línea dinámica guardados en un sello colocado. Los de obra se muestran en mayúsculas (ADR-0026); los de
 * Revu y Foxit, tal cual (For Review, fechas…).
 */
export function stampTextOf(
  markup: { text?: string; customFields?: Record<string, string | number> },
  def: StampDef
): { title: string; subtitle: string } {
  const raw = markup.text || def.label;
  const subtitle = typeof markup.customFields?.stampSubtitle === 'string' ? markup.customFields.stampSubtitle : '';
  return { title: (def.kind ?? 'outline') === 'outline' ? raw.toUpperCase() : raw, subtitle };
}
