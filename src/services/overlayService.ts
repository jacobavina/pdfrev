import { useOverlayStore } from '../store/useOverlayStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { showToast } from './toastService';

/**
 * Inicio de Overlay Pages (ADR-0038): con otro PDF (otra revisión del plano) o con otra página del documento abierto.
 */

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Pide un PDF al usuario y devuelve su nombre y bytes, o null si cancela. */
export async function pickPdf(title = 'Overlay with another PDF'): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      title,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return { name: selected.split(/[/\\]/).pop() || 'document.pdf', bytes: await readFile(selected) };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = () => input.remove();
    input.addEventListener('cancel', () => {
      done();
      resolve(null);
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      done();
      if (!file) return resolve(null);
      resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    };
    input.click();
  });
}

/** Compara la página activa con la misma página (o la última) de otro PDF elegido por el usuario. */
export async function startOverlayFromFile(): Promise<void> {
  try {
    const picked = await pickPdf();
    if (!picked) return;
    const { loadPdfDocument } = await import('./pdfService');
    const doc = await loadPdfDocument(picked.bytes);
    const pageCount = doc.numPages;
    await doc.destroy();
    const current = useDocumentStore.getState().currentPageIndex;
    useOverlayStore.getState().start({
      name: picked.name,
      bytes: picked.bytes,
      pageCount,
      pageIndex: Math.min(current, pageCount - 1),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Overlay] No se pudo abrir el PDF para comparar:', err);
    showToast(`Could not open the PDF to overlay: ${message}`);
  }
}

/** Compara la página activa con otra página del mismo documento (la siguiente, o la anterior si es la última). */
export function startOverlayWithThisDocument(): void {
  const { numPages, currentPageIndex } = useDocumentStore.getState();
  if (numPages < 2) {
    showToast('This document has a single page. Use "Overlay with Another PDF…" to compare revisions.');
    return;
  }
  const other = currentPageIndex + 1 < numPages ? currentPageIndex + 1 : currentPageIndex - 1;
  useOverlayStore.getState().start({ name: 'This document', bytes: null, pageCount: numPages, pageIndex: other });
}
