import { PDFDocument, PDFName, PDFDict, PDFArray } from 'pdf-lib';
import { getHelveticaTextWidth } from '../markup/helveticaMetrics';

/**
 * Capa de texto invisible del OCR (ADR-0102). Puro respecto de la interfaz: recibe las palabras que reconoció el OCR
 * sobre la imagen de la página (píxeles, origen arriba a la izquierda) y escribe cada una como texto con modo de
 * dibujo 3 (`3 Tr`: ni trazo ni relleno) en el sitio de la palabra, para que el plano escaneado se pueda buscar,
 * seleccionar y resaltar sin cambiar su aspecto.
 */

export interface OcrWordBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrImageSize {
  width: number;
  height: number;
}

const FONT_KEY = 'REAOcr';

/** Texto en WinAnsi (un byte por carácter) como cadena hexadecimal; lo que no cabe pasa a "?". */
export function winAnsiHex(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out += (code < 256 ? code : 0x3f).toString(16).padStart(2, '0').toUpperCase();
  }
  return out;
}

/**
 * Pasa una posición de la imagen mostrada (fracciones de 0 a 1, origen arriba a la izquierda) al espacio de usuario de
 * la página, que está sin girar. `rotation` es el /Rotate de la página.
 */
export function displayedToUser(
  fx: number,
  fy: number,
  rotation: number,
  pageW: number,
  pageH: number
): { u: number; v: number; dir: { x: number; y: number } } {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { u: fy * pageW, v: fx * pageH, dir: { x: 0, y: 1 } };
    case 180:
      return { u: pageW - fx * pageW, v: fy * pageH, dir: { x: -1, y: 0 } };
    case 270:
      return { u: (1 - fy) * pageW, v: (1 - fx) * pageH, dir: { x: 0, y: -1 } };
    default:
      return { u: fx * pageW, v: (1 - fy) * pageH, dir: { x: 1, y: 0 } };
  }
}

/** Operadores del texto invisible de una página. Cada palabra es su propio bloque BT/ET. */
export function ocrTextOperators(
  words: OcrWordBox[],
  image: OcrImageSize,
  rotation: number,
  pageW: number,
  pageH: number,
  origin: { x: number; y: number } = { x: 0, y: 0 }
): string {
  const displayedW = rotation % 180 === 0 ? pageW : pageH;
  const unitsPerPx = displayedW / image.width;
  const lines: string[] = ['q'];
  for (const w of words) {
    const text = w.text.trim();
    if (!text || !(w.width > 0) || !(w.height > 0)) continue;
    // Tamaño de la letra: la caja de la palabra; el ancho se ajusta con Tz para que el texto ocupe justo su caja
    const size = Math.max(1, w.height * unitsPerPx * 0.85);
    const natural = getHelveticaTextWidth(text, size) || size;
    const tz = Math.max(10, Math.min(1000, ((w.width * unitsPerPx) / natural) * 100));
    // Línea base: abajo de la caja, subida lo que baja el descendente
    const base = displayedToUser((w.x) / image.width, (w.y + w.height * 0.82) / image.height, rotation, pageW, pageH);
    const { x: dx, y: dy } = base.dir;
    lines.push(
      'BT',
      '3 Tr',
      `/${FONT_KEY} ${size.toFixed(2)} Tf`,
      `${tz.toFixed(1)} Tz`,
      `${dx} ${dy} ${-dy} ${dx} ${(base.u + origin.x).toFixed(2)} ${(base.v + origin.y).toFixed(2)} Tm`,
      `<${winAnsiHex(text)}> Tj`,
      'ET'
    );
  }
  lines.push('Q');
  return lines.join('\n');
}

/** Añade la capa de texto invisible a una página. Devuelve el PDF nuevo y cuántas palabras escribió. */
export async function addInvisibleTextLayer(
  pdfBytes: Uint8Array,
  pageIndex: number,
  words: OcrWordBox[],
  image: OcrImageSize
): Promise<{ pdfBytes: Uint8Array; written: number }> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(pageIndex);
  // Tamaño y origen de la caja de la página en el espacio de usuario (sin girar) y giro de la vista
  const box = page.getMediaBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const usable = words.filter((w) => w.text.trim() && w.width > 0 && w.height > 0);
  if (usable.length === 0) return { pdfBytes, written: 0 };

  // Fuente estándar en los recursos de la página (los heredados se completan, no se sustituyen)
  const fontRef = doc.context.register(
    doc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' })
  );
  let resources = page.node.Resources();
  if (!resources) {
    resources = doc.context.obj({});
    page.node.set(PDFName.of('Resources'), resources);
  }
  let fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) {
    fonts = doc.context.obj({});
    resources.set(PDFName.of('Font'), fonts);
  }
  fonts.set(PDFName.of(FONT_KEY), fontRef);

  // El contenido original queda entre q y Q para que su estado gráfico no afecte a la capa
  page.node.normalize();
  const stream = doc.context.stream(ocrTextOperators(usable, image, rotation, box.width, box.height, { x: box.x, y: box.y }));
  const contents = page.node.Contents();
  const ref = doc.context.register(stream);
  if (contents instanceof PDFArray) contents.push(ref);
  else page.node.addContentStream(ref);
  return { pdfBytes: await doc.save(), written: usable.length };
}
