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
    showToast('No hay ningún documento PDF cargado para exportar.');
    return;
  }
  try {
    const { exportMarkupsToPdf } = await import('../../services/pdfExportService');
    const result = await exportMarkupsToPdf(pdfBytes, useMarkupStore.getState().markups);
    const blob = new Blob([result.pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'documento';
    a.download = `${baseName}_con_marcas.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (result.warnings.replacedCharactersCount > 0) {
      showToast(
        `${result.warnings.replacedCharactersCount} caracteres sin equivalente en la fuente estándar se sustituyeron por "?" en el PDF aplanado.`
      );
    }
  } catch (err) {
    showToast(`Error al exportar PDF con marcas: ${err instanceof Error ? err.message : String(err)}`);
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
    showToast(`Error en la operación de página: ${err instanceof Error ? err.message : String(err)}`);
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
