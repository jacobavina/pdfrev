/**
 * Reemplazar páginas (Replace Pages, ADR-0114): las páginas elegidas del documento se sustituyen por páginas de otro
 * PDF. Las nuevas ocupan el lugar de la primera página reemplazada; la cantidad puede ser distinta.
 */

export interface ReplaceResult {
  bytes: Uint8Array;
  /** Páginas que tenía el documento y que tiene ahora. */
  pagesBefore: number;
  pagesAfter: number;
}

/** Quita las páginas `targets` del documento y pone en su lugar `sourceIndices` del PDF `source`. */
export async function replacePdfPages(pdfBytes: Uint8Array, targets: number[], source: Uint8Array, sourceIndices: number[]): Promise<ReplaceResult> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const incoming = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const pagesBefore = doc.getPageCount();
  if (targets.length === 0 || sourceIndices.length === 0) throw new Error('Choose the pages to replace and the pages that replace them.');
  if (targets.some((t) => t < 0 || t >= pagesBefore)) throw new Error('A page to replace is outside this document.');
  if (sourceIndices.some((s) => s < 0 || s >= incoming.getPageCount())) throw new Error('A replacement page is outside the other PDF.');
  const sortedTargets = [...new Set(targets)].sort((a, b) => a - b);
  const at = sortedTargets[0];
  const copied = await doc.copyPages(incoming, sourceIndices);
  copied.forEach((page, k) => doc.insertPage(at + k, page));
  // Las páginas viejas se desplazaron tantas posiciones como páginas se insertaron antes de ellas
  for (const t of [...sortedTargets].reverse()) doc.removePage(t + copied.length);
  return { bytes: await doc.save(), pagesBefore, pagesAfter: doc.getPageCount() };
}

/** Número de páginas de un PDF. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
}

/** Los viewports de medición con los índices de página corridos al quitar una página. */
export function remapViewportsOnPageDeletion<T extends { pageIndex: number }>(viewports: Record<number, T[]>, deleted: number): Record<number, T[]> {
  const out: Record<number, T[]> = {};
  for (const [key, list] of Object.entries(viewports)) {
    const idx = Number(key);
    if (idx === deleted) continue;
    const next = idx > deleted ? idx - 1 : idx;
    out[next] = list.map((v) => ({ ...v, pageIndex: next }));
  }
  return out;
}

/** Los viewports de medición con los índices de página corridos al insertar una página. */
export function remapViewportsOnPageInsertion<T extends { pageIndex: number }>(viewports: Record<number, T[]>, inserted: number): Record<number, T[]> {
  const out: Record<number, T[]> = {};
  for (const [key, list] of Object.entries(viewports)) {
    const idx = Number(key);
    const next = idx >= inserted ? idx + 1 : idx;
    out[next] = list.map((v) => ({ ...v, pageIndex: next }));
  }
  return out;
}
