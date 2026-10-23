/**
 * Propiedades del documento (Document Properties, ADR-0113): metadatos del PDF que se pueden leer y, los de
 * descripción, editar. Se escriben en el diccionario /Info.
 */

export interface DocumentProperties {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  created: Date | null;
  modified: Date | null;
  /** Versión de la cabecera, p. ej. "1.7". */
  version: string;
  pageCount: number;
  encrypted: boolean;
  /** Tamaño de la primera página en puntos (caja visible, con su rotación). */
  firstPageSize: { width: number; height: number } | null;
  /** Hay páginas de tamaños distintos. */
  mixedPageSizes: boolean;
  fileSize: number;
}

export type EditableProperties = Pick<DocumentProperties, 'title' | 'author' | 'subject' | 'keywords'>;

/**
 * Versión de PDF de la cabecera (p. ej. "1.7"), o cadena vacía. La marca de cabecera se busca por sus bytes y no como
 * texto: un literal con ella dentro de los primeros 1024 bytes de un fragmento de la aplicación hace que Tauri lo sirva
 * como `application/pdf` y el navegador se niegue a cargarlo como módulo (ver `noPdfMagicInBundle.test.ts`).
 */
export function pdfHeaderVersion(bytes: Uint8Array): string {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const limit = Math.min(bytes.length, 1024) - magic.length - 3;
  for (let i = 0; i <= limit; i++) {
    if (!magic.every((b, k) => bytes[i + k] === b)) continue;
    const major = bytes[i + 5];
    const dot = bytes[i + 6];
    const minor = bytes[i + 7];
    if (major >= 0x30 && major <= 0x39 && dot === 0x2e && minor >= 0x30 && minor <= 0x39) {
      return String.fromCharCode(major, dot, minor);
    }
  }
  return '';
}

/** Palabras clave como lista: separadas por comas o punto y coma, sin vacías ni repetidas. */
export function splitKeywords(text: string): string[] {
  return [...new Set(text.split(/[;,]/).map((k) => k.trim()).filter(Boolean))];
}

export async function readDocumentProperties(pdfBytes: Uint8Array): Promise<DocumentProperties> {
  const { PDFDocument } = await import('pdf-lib');
  let encrypted = false;
  let doc: import('pdf-lib').PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  } catch {
    encrypted = true;
    doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  }
  encrypted = encrypted || doc.isEncrypted;
  const pages = doc.getPages();
  const sizeOf = (p: import('pdf-lib').PDFPage) => {
    const b = p.getCropBox();
    const rot = (((p.getRotation().angle % 360) + 360) % 360);
    return rot === 90 || rot === 270 ? { width: b.height, height: b.width } : { width: b.width, height: b.height };
  };
  const first = pages[0] ? sizeOf(pages[0]) : null;
  const mixed = first ? pages.some((p) => Math.abs(sizeOf(p).width - first.width) > 1 || Math.abs(sizeOf(p).height - first.height) > 1) : false;
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    created: doc.getCreationDate() ?? null,
    modified: doc.getModificationDate() ?? null,
    version: pdfHeaderVersion(pdfBytes),
    pageCount: pages.length,
    encrypted,
    firstPageSize: first,
    mixedPageSizes: mixed,
    fileSize: pdfBytes.length,
  };
}

/** Escribe título, autor, asunto y palabras clave en /Info (vacío los quita) y actualiza la fecha de modificación. */
export async function writeDocumentProperties(pdfBytes: Uint8Array, p: EditableProperties, now: Date = new Date()): Promise<Uint8Array> {
  const { PDFDocument, PDFDict, PDFName } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  const clear = (key: string) => {
    if (info instanceof PDFDict) info.delete(PDFName.of(key));
  };
  if (p.title.trim()) doc.setTitle(p.title.trim());
  else clear('Title');
  if (p.author.trim()) doc.setAuthor(p.author.trim());
  else clear('Author');
  if (p.subject.trim()) doc.setSubject(p.subject.trim());
  else clear('Subject');
  const kw = splitKeywords(p.keywords);
  if (kw.length > 0) doc.setKeywords(kw);
  else clear('Keywords');
  doc.setModificationDate(now);
  return doc.save();
}
