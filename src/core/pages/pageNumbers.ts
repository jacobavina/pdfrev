import { normalizedToPdfCoordinates, type PageTransformInfo } from '../pdf/operators';
import { viewSize } from './pageBoxes';

/**
 * Número de páginas (Number Pages, ADR-0113): estampa un texto con el número en cada página elegida, como contenido
 * del PDF. El texto se coloca en la página tal y como se ve, así que sale derecho aunque la página esté rotada.
 */

export type NumberPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface NumberPagesOptions {
  /** Plantilla: {n} número, {total} último número, {page} página física, {pages} total de páginas físicas. */
  format: string;
  position: NumberPosition;
  fontSize: number;
  /** Distancia al borde, en puntos. */
  margin: number;
  /** Color en #rrggbb. */
  color: string;
  /** Número que lleva la primera página numerada. */
  startAt: number;
  /** Índices (0-based) de las páginas a numerar, en orden. */
  pages: number[];
  font: 'Helvetica' | 'Times' | 'Courier';
}

export const DEFAULT_NUMBER_FORMAT = 'Page {n} of {total}';
/** Color por defecto del número estampado (negro): es un dato del PDF, no un color de la interfaz. */
export const DEFAULT_NUMBER_COLOR = '#000000';

export function formatPageNumber(format: string, v: { n: number; total: number; page: number; pages: number }): string {
  return format.replace(/\{(n|total|page|pages)\}/g, (_, k: 'n' | 'total' | 'page' | 'pages') => String(v[k]));
}

/** Páginas elegidas con una lista como "1-3, 5, 8-10" (1-based); null si la lista no es válida. */
export function parsePageList(text: string, pageCount: number): number[] | null {
  const out = new Set<number>();
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b > pageCount) return null;
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return out.size > 0 ? [...out].sort((x, y) => x - y) : null;
}

/** Posición del texto sobre la página vista, en puntos con origen arriba a la izquierda: esquina izquierda de la línea base. */
export function numberAnchor(
  size: { width: number; height: number },
  position: NumberPosition,
  textWidth: number,
  fontSize: number,
  margin: number
): { x: number; y: number } {
  const [vert, horiz] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  const x = horiz === 'left' ? margin : horiz === 'right' ? size.width - margin - textWidth : (size.width - textWidth) / 2;
  // Línea base: arriba deja el margen sobre las mayúsculas (~0.72 del cuerpo); abajo la base queda a `margin` del borde
  const y = vert === 'top' ? margin + fontSize * 0.72 : size.height - margin;
  return { x, y };
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Estampa los números y devuelve el PDF nuevo. */
export async function numberPdfPages(pdfBytes: Uint8Array, opts: NumberPagesOptions): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await doc.embedFont(opts.font === 'Times' ? StandardFonts.TimesRoman : opts.font === 'Courier' ? StandardFonts.Courier : StandardFonts.Helvetica);
  const charset = new Set(font.getCharacterSet());
  const pages = doc.getPages();
  const total = opts.startAt + opts.pages.length - 1;
  const [r, g, b] = hexToRgb(opts.color);

  opts.pages.forEach((pageIndex, k) => {
    const page = pages[pageIndex];
    if (!page) return;
    const box = page.getCropBox();
    const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const t: PageTransformInfo = { rotation: rot, widthPt: box.width, heightPt: box.height, originX: box.x, originY: box.y };
    const size = viewSize(t);
    const raw = formatPageNumber(opts.format, { n: opts.startAt + k, total, page: pageIndex + 1, pages: pages.length });
    // Solo los caracteres que la fuente estándar puede dibujar
    const text = [...raw].map((ch) => (charset.has(ch.codePointAt(0)!) ? ch : '?')).join('');
    const w = font.widthOfTextAtSize(text, opts.fontSize);
    const at = numberAnchor(size, opts.position, w, opts.fontSize, opts.margin);
    const origin = normalizedToPdfCoordinates({ x: at.x / size.width, y: at.y / size.height }, t);
    // Dirección de la línea de texto en el espacio del PDF, para que se lea derecha en la página vista
    const along = normalizedToPdfCoordinates({ x: (at.x + 1) / size.width, y: at.y / size.height }, t);
    const angle = (Math.atan2(along.y - origin.y, along.x - origin.x) * 180) / Math.PI;
    page.drawText(text, { x: origin.x, y: origin.y, size: opts.fontSize, font, color: rgb(r, g, b), rotate: degrees(angle) });
  });
  return doc.save();
}
