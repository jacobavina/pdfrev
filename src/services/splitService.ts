import { useSplitStore } from '../store/useSplitStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { showToast } from './toastService';
import { loadPdfDocument } from './pdfService';

/** Inicio de la vista lado a lado (ADR-0049): con otro PDF (otra revisión) o con otra página del documento. */

export async function startSplitFromFile(): Promise<void> {
  try {
    const { pickPdf } = await import('./overlayService');
    const picked = await pickPdf('Compare side by side with another PDF');
    if (!picked) return;

    const doc = await loadPdfDocument(picked.bytes);
    const pageCount = doc.numPages;
    await doc.destroy();
    const current = useDocumentStore.getState().currentPageIndex;
    useSplitStore.getState().start({ name: picked.name, bytes: picked.bytes, pageCount, pageIndex: Math.min(current, pageCount - 1) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Split] No se pudo abrir el PDF para comparar:', err);
    showToast(`Could not open the PDF to compare: ${message}`);
  }
}

export function startSplitWithThisDocument(): void {
  const { numPages, currentPageIndex } = useDocumentStore.getState();
  if (numPages < 1) return;
  const other = currentPageIndex + 1 < numPages ? currentPageIndex + 1 : Math.max(0, currentPageIndex - 1);
  useSplitStore.getState().start({ name: 'This document', bytes: null, pageCount: numPages, pageIndex: other });
}
