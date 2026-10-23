/**
 * Insertar páginas de otro PDF (Insert Pages, ADR-0123): las páginas elegidas del otro archivo se colocan en el documento
 * antes de la página indicada (o al final). Puro salvo `insertPdfPages`.
 */

export interface InsertResult {
  bytes: Uint8Array;
  pagesBefore: number;
  pagesAfter: number;
}

/** Posición de inserción: índice 0-based de la página ANTES de la que se inserta; igual al total de páginas es al final. */
export function insertionIndex(where: 'before' | 'after' | 'end', pageIndex: number, pageCount: number): number {
  if (where === 'end') return pageCount;
  return Math.max(0, Math.min(pageCount, where === 'before' ? pageIndex : pageIndex + 1));
}

/** Copia `sourceIndices` del otro PDF y las pone en `at` del documento. */
export async function insertPdfPages(pdfBytes: Uint8Array, at: number, source: Uint8Array, sourceIndices: number[]): Promise<InsertResult> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const incoming = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const pagesBefore = doc.getPageCount();
  if (sourceIndices.length === 0) throw new Error('Choose the pages to insert.');
  if (at < 0 || at > pagesBefore) throw new Error('The position is outside this document.');
  if (sourceIndices.some((i) => i < 0 || i >= incoming.getPageCount())) throw new Error('A page to insert is outside the other PDF.');
  const copied = await doc.copyPages(incoming, sourceIndices);
  copied.forEach((page, k) => doc.insertPage(at + k, page));
  return { bytes: await doc.save(), pagesBefore, pagesAfter: doc.getPageCount() };
}
