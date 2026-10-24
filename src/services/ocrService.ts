import { addInvisibleTextLayer, OcrWordBox } from '../core/pdf/ocrLayer';
import { useDocumentStore } from '../store/useDocumentStore';
import { isTauriEnvironment } from './bbxPersistenceService';
import { rasterizePage, rasterToPng } from './pageRaster';
import { showToast } from './toastService';
import { loadPdfDocument } from './pdfService';

/**
 * OCR local con el motor nativo de Windows (ADR-0102): rasteriza la página, el comando de Rust reconoce las palabras y
 * se escriben en el PDF como una capa de texto invisible, para poder buscar y seleccionar texto en planos escaneados.
 */

/** Ancho de la imagen que se entrega al OCR: nítida para letra pequeña sin pasar del máximo de Windows (10 000 px). */
export const OCR_IMAGE_WIDTH_PX = 3000;
const OCR_MAX_SIDE_PX = 9000;

interface OcrReply {
  width: number;
  height: number;
  language: string;
  words: OcrWordBox[];
}

/** ¿La página ya tiene texto seleccionable? (no hace falta OCR). */
async function pageHasText(pageIndex: number): Promise<boolean> {
  const { pdfDoc } = useDocumentStore.getState();
  if (!pdfDoc) return false;
  const page = await pdfDoc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  return content.items.some((i) => 'str' in i && (i as { str: string }).str.trim().length > 0);
}

/**
 * Reconoce el texto de la página activa o de todas las que no lo tengan, y lo añade al documento. El cambio se aplica
 * al PDF abierto; se guarda con Save como el resto de cambios del documento.
 */
export async function runOcr(scope: 'page' | 'all'): Promise<void> {
  const state = useDocumentStore.getState();
  if (!state.pdfBytes) {
    showToast('Open a document to run OCR.');
    return;
  }
  if (!isTauriEnvironment()) {
    showToast('OCR uses the Windows text recognition engine and is only available in the desktop app.');
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const targets: number[] = [];
    if (scope === 'page') {
      targets.push(state.currentPageIndex);
    } else {
      for (let i = 0; i < state.numPages; i++) if (!(await pageHasText(i))) targets.push(i);
      if (targets.length === 0) {
        showToast('Every page already has selectable text.');
        return;
      }
    }

    let bytes = state.pdfBytes;
    let words = 0;
    let language = '';
    for (const [n, pageIndex] of targets.entries()) {
      showToast(`OCR: page ${pageIndex + 1} (${n + 1} of ${targets.length})…`);
      const { raster } = await rasterizePage(bytes, pageIndex, undefined, OCR_IMAGE_WIDTH_PX, OCR_MAX_SIDE_PX);
      const png = await rasterToPng(raster);
      const reply = await invoke<OcrReply>('ocr_recognize', { image: Array.from(png) });
      language = reply.language || language;
      const layer = await addInvisibleTextLayer(bytes, pageIndex, reply.words, { width: reply.width, height: reply.height });
      bytes = layer.pdfBytes;
      words += layer.written;
    }

    if (words === 0) {
      showToast('OCR found no text on the page.');
      return;
    }

    const doc = await loadPdfDocument(bytes);
    const keep = { page: state.currentPageIndex, scale: state.scale };
    useDocumentStore.getState().setDocument(state.filePath, state.fileName || 'document.pdf', bytes, doc.numPages, doc);
    useDocumentStore.getState().setCurrentPage(keep.page);
    useDocumentStore.getState().setScale(keep.scale);
    showToast(
      `OCR done: ${words} word${words === 1 ? '' : 's'} on ${targets.length} page${targets.length === 1 ? '' : 's'}` +
        `${language ? ` (${language})` : ''}. The text can now be searched and selected.`
    );
  } catch (err) {
    showToast(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface OcrBytesResult {
  bytes: Uint8Array;
  /** Palabras escritas y páginas reconocidas (las que no tenían texto). */
  words: number;
  pages: number;
  /** Páginas del archivo que ya tenían texto y se dejaron como estaban. */
  skipped: number;
  language: string;
}

/**
 * OCR de un PDF dado por sus bytes, sin el documento abierto (ADR-0133, Batch): reconoce las páginas que no tienen texto
 * seleccionable y devuelve el PDF con la capa de texto invisible. Solo en la aplicación de escritorio.
 */
export async function ocrPdfBytes(pdfBytes: Uint8Array, onPage?: (done: number, total: number) => void): Promise<OcrBytesResult> {
  if (!isTauriEnvironment()) throw new Error('OCR uses the Windows text recognition engine and is only available in the desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  const doc = await loadPdfDocument(pdfBytes);
  const total = doc.numPages;
  const targets: number[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      if (!content.items.some((it) => 'str' in it && (it as { str: string }).str.trim().length > 0)) targets.push(i - 1);
    }
  } finally {
    void doc.destroy();
  }
  let bytes = pdfBytes;
  let words = 0;
  let language = '';
  for (const [n, pageIndex] of targets.entries()) {
    onPage?.(n, targets.length);
    const { raster } = await rasterizePage(bytes, pageIndex, undefined, OCR_IMAGE_WIDTH_PX, OCR_MAX_SIDE_PX);
    const reply = await invoke<OcrReply>('ocr_recognize', { image: Array.from(await rasterToPng(raster)) });
    language = reply.language || language;
    const layer = await addInvisibleTextLayer(bytes, pageIndex, reply.words, { width: reply.width, height: reply.height });
    bytes = layer.pdfBytes;
    words += layer.written;
  }
  onPage?.(targets.length, targets.length);
  return { bytes, words, pages: targets.length, skipped: total - targets.length, language };
}
