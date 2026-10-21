import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { showToast } from '../../services/toastService';

/**
 * Acciones de aplicación compartidas por la barra de menús, la cinta y los atajos (ADR-0017).
 * Ningún error se traga en silencio: todo fallo llega al usuario como aviso.
 */

/** Exporta una copia del PDF con las marcas aplanadas (dibujadas en el contenido de la página). */
export async function exportFlattenedPdf(): Promise<void> {
  const { pdfBytes, fileName } = useDocumentStore.getState();
  if (!pdfBytes) {
    showToast('No PDF document is loaded to export.');
    return;
  }
  try {
    const { exportMarkupsToPdf } = await import('../../services/pdfExportService');
    const result = await exportMarkupsToPdf(pdfBytes, useMarkupStore.getState().markups);
    const blob = new Blob([result.pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'document';
    a.download = `${baseName}_markups.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result.warnings.replacedCharactersCount > 0) {
      showToast(
        `${result.warnings.replacedCharactersCount} characters without an equivalent in the standard font were replaced with "?" in the flattened PDF.`
      );
    }
  } catch (err) {
    showToast(`Error exporting PDF with markups: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Unflatten Markups (ADR-0093): si el documento abierto fue aplanado por REA, quita lo dibujado en las páginas y
 * devuelve las marcas editables (un solo paso: se sustituye el documento y sus marcas).
 */
export async function unflattenOpenDocument(): Promise<void> {
  const { pdfBytes, filePath, fileName, setDocument } = useDocumentStore.getState();
  if (!pdfBytes) {
    showToast('No PDF document is open.');
    return;
  }
  try {
    const { unflattenPdf } = await import('../../core/pdf/flattenRecord');
    const { pdfBytes: restored, markups } = await unflattenPdf(pdfBytes);
    const { loadPdfDocument } = await import('../../services/pdfService');
    const doc = await loadPdfDocument(restored);
    const current = useMarkupStore.getState().markups;
    useMarkupStore.getState().setMarkups([...current, ...markups]);
    setDocument(filePath, fileName || 'document.pdf', restored, doc.numPages, doc);
    showToast(`${markups.length} markup${markups.length === 1 ? '' : 's'} restored from the flattened PDF.`);
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err));
  }
}

export async function runPageOperation(
  kind: 'insertBlank' | 'rotate' | 'delete' | 'extract'
): Promise<void> {
  const { numPages, currentPageIndex } = useDocumentStore.getState();
  if (numPages === 0) return;
  try {
    const svc = await import('../../services/pageService');
    if (kind === 'insertBlank') await svc.executeInsertBlankPage(currentPageIndex + 1);
    else if (kind === 'rotate') await svc.executeRotatePage(currentPageIndex, 90);
    else if (kind === 'delete') await svc.executeDeletePage(currentPageIndex);
    else await svc.executeExtractPage(currentPageIndex);
  } catch (err) {
    showToast(`Page operation error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function goToPage(delta: number): void {
  const { numPages, currentPageIndex, setCurrentPage } = useDocumentStore.getState();
  const next = currentPageIndex + delta;
  if (next >= 0 && next < numPages) setCurrentPage(next);
}

export function selectAllOnCurrentPage(): void {
  const { currentPageIndex } = useDocumentStore.getState();
  const { markups, setSelectedMarkupIds } = useMarkupStore.getState();
  setSelectedMarkupIds(markups.filter((m) => m.pageIndex === currentPageIndex).map((m) => m.id));
}
