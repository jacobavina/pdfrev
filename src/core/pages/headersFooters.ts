import { drawStampedText, embedStampFont, type NumberPagesOptions, type NumberPosition } from './pageNumbers';

/**
 * Cabeceras y pies de página (Headers & Footers, ADR-0114): hasta seis textos por página (izquierda, centro y derecha,
 * arriba y abajo) con campos que se rellenan por página. Se estampan como contenido del PDF, igual que Number Pages.
 */

export interface HeaderFooterSlots {
  headerLeft: string;
  headerCenter: string;
  headerRight: string;
  footerLeft: string;
  footerCenter: string;
  footerRight: string;
}

export const EMPTY_SLOTS: HeaderFooterSlots = {
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  footerLeft: '',
  footerCenter: '',
  footerRight: '',
};

const SLOT_POSITION: Record<keyof HeaderFooterSlots, NumberPosition> = {
  headerLeft: 'top-left',
  headerCenter: 'top-center',
  headerRight: 'top-right',
  footerLeft: 'bottom-left',
  footerCenter: 'bottom-center',
  footerRight: 'bottom-right',
};

export interface HeaderFooterOptions {
  slots: HeaderFooterSlots;
  fontSize: number;
  /** Distancia al borde, en puntos. */
  margin: number;
  color: string;
  font: NumberPagesOptions['font'];
  /** Número que lleva la primera página con texto. */
  startAt: number;
  /** Índices (0-based) de las páginas, en orden. */
  pages: number[];
  /** Datos del documento para los campos {file} y {title}. */
  fileName: string;
  title: string;
  /** Instante de {date} y {time}. */
  now: Date;
}

export const HEADER_FOOTER_FIELDS = ['{n}', '{total}', '{page}', '{pages}', '{date}', '{time}', '{file}', '{title}'] as const;

const pad = (n: number) => String(n).padStart(2, '0');
export const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export interface FieldValues {
  n: number;
  total: number;
  page: number;
  pages: number;
  date: string;
  time: string;
  file: string;
  title: string;
}

/** Sustituye los campos de la plantilla. Un campo desconocido se deja tal cual. */
export function fillFields(template: string, v: FieldValues): string {
  return template.replace(/\{(n|total|page|pages|date|time|file|title)\}/g, (_, k: keyof FieldValues) => String(v[k]));
}

/** Nombre del archivo sin carpeta ni extensión. */
export function baseFileName(name: string): string {
  return name.replace(/^.*[\\/]/, '').replace(/\.pdf$/i, '');
}

/** Valores de los campos para una página. */
export function fieldValuesFor(opts: HeaderFooterOptions, k: number, pageIndex: number, pageCount: number): FieldValues {
  return {
    n: opts.startAt + k,
    total: opts.startAt + opts.pages.length - 1,
    page: pageIndex + 1,
    pages: pageCount,
    date: formatDate(opts.now),
    time: formatTime(opts.now),
    file: baseFileName(opts.fileName),
    title: opts.title,
  };
}

/** Los textos de las ranuras con contenido, ya con los campos rellenos, para una página. */
export function resolveSlots(opts: HeaderFooterOptions, k: number, pageIndex: number, pageCount: number): { position: NumberPosition; text: string }[] {
  const values = fieldValuesFor(opts, k, pageIndex, pageCount);
  return (Object.keys(SLOT_POSITION) as (keyof HeaderFooterSlots)[])
    .filter((slot) => opts.slots[slot].trim() !== '')
    .map((slot) => ({ position: SLOT_POSITION[slot], text: fillFields(opts.slots[slot], values) }));
}

/** ¿Hay algún texto que estampar? */
export const hasAnySlot = (slots: HeaderFooterSlots): boolean => Object.values(slots).some((t) => t.trim() !== '');

/** Estampa las cabeceras y pies y devuelve el PDF nuevo. */
export async function stampHeadersFooters(pdfBytes: Uint8Array, opts: HeaderFooterOptions): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await embedStampFont(doc, opts.font);
  const pages = doc.getPages();
  opts.pages.forEach((pageIndex, k) => {
    const page = pages[pageIndex];
    if (!page) return;
    for (const { position, text } of resolveSlots(opts, k, pageIndex, pages.length)) {
      drawStampedText(lib, page, font, text, position, opts.fontSize, opts.margin, opts.color);
    }
  });
  return doc.save();
}
