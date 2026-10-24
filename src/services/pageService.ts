/**
 * Servicio integrador de operaciones de página para REA (Paquete 5).
 * Coordina la transformación de PDF, remapeo de marcas y calibraciones, y actualización reactiva de stores.
 */

import {
  rotatePdfPage,
  deletePdfPage,
  insertBlankPdfPage,
  extractPdfPage,
  reorderPdfPages,
  remapMarkupsOnPageDeletion,
  remapMarkupsOnPageInsertion,
  remapMarkupsOnPageReorder,
  remapCalibrationsOnPageDeletion,
  remapCalibrationsOnPageInsertion,
  remapCalibrationsOnPageReorder,
  remapViewportsOnPageReorder,
  mergePdfDocuments,
} from '../core/pages/pageOperations';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { loadPdfDocument } from './pdfService';
import { showToast } from './toastService';
import { loadPdfData } from './fileDialogService';

/**
 * Rota una página específica y actualiza el documento activo en memoria.
 */
export async function executeRotatePage(
  pageIndex: number,
  deltaDegrees: 90 | -90 | 180 = 90
): Promise<boolean> {
  const { pdfBytes, filePath, fileName, setDocument } = useDocumentStore.getState();
  if (!pdfBytes) {
    showToast('No document open to rotate.');
    return false;
  }

  try {
    const updatedBytes = await rotatePdfPage(pdfBytes, pageIndex, deltaDegrees);
    const newPdfDoc = await loadPdfDocument(updatedBytes);

    setDocument(filePath, fileName || 'document.pdf', updatedBytes, newPdfDoc.numPages, newPdfDoc);
    showToast(`Page ${pageIndex + 1} rotated ${deltaDegrees}°.`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error rotando página:', msg);
    showToast(`Error rotating page: ${msg}`);
    return false;
  }
}

/**
 * Elimina una página del documento, remapeando marcas y calibraciones asociadas.
 */
export async function executeDeletePage(pageIndex: number): Promise<boolean> {
  const { pdfBytes, filePath, fileName, numPages, currentPageIndex, setDocument, setCurrentPage } =
    useDocumentStore.getState();
  const { markups, setMarkups } = useMarkupStore.getState();
  const { calibrations } = useCalibrationStore.getState();

  if (!pdfBytes) {
    showToast('No document open to modify.');
    return false;
  }

  if (numPages <= 1) {
    showToast('The only page of the document cannot be deleted.');
    return false;
  }

  try {
    const updatedBytes = await deletePdfPage(pdfBytes, pageIndex);
    const newPdfDoc = await loadPdfDocument(updatedBytes);

    // Remapear marcas y calibraciones
    const remappedMarkups = remapMarkupsOnPageDeletion(markups, pageIndex);
    const remappedCalibrations = remapCalibrationsOnPageDeletion(calibrations, pageIndex);

    setMarkups(remappedMarkups);
    useCalibrationStore.setState({ calibrations: remappedCalibrations });

    setDocument(filePath, fileName || 'document.pdf', updatedBytes, newPdfDoc.numPages, newPdfDoc);

    // Ajustar página activa si correspondía a la eliminada o estaba fuera de rango
    const newPageIndex = Math.min(currentPageIndex, newPdfDoc.numPages - 1);
    setCurrentPage(newPageIndex);

    showToast(`Page ${pageIndex + 1} deleted.`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error eliminando página:', msg);
    showToast(`Error deleting page: ${msg}`);
    return false;
  }
}

/**
 * Inserta una página en blanco en la posición indicada.
 */
export async function executeInsertBlankPage(
  atIndex: number,
  dimensions?: { width: number; height: number }
): Promise<boolean> {
  const { pdfBytes, filePath, fileName, setDocument, setCurrentPage } = useDocumentStore.getState();
  const { markups, setMarkups } = useMarkupStore.getState();
  const { calibrations } = useCalibrationStore.getState();

  if (!pdfBytes) {
    showToast('No document open.');
    return false;
  }

  try {
    const updatedBytes = await insertBlankPdfPage(pdfBytes, atIndex, dimensions);
    const newPdfDoc = await loadPdfDocument(updatedBytes);

    // Remapear marcas y calibraciones posteriores
    const remappedMarkups = remapMarkupsOnPageInsertion(markups, atIndex);
    const remappedCalibrations = remapCalibrationsOnPageInsertion(calibrations, atIndex);

    setMarkups(remappedMarkups);
    useCalibrationStore.setState({ calibrations: remappedCalibrations });

    setDocument(filePath, fileName || 'document.pdf', updatedBytes, newPdfDoc.numPages, newPdfDoc);
    setCurrentPage(atIndex);

    showToast(`Blank page inserted at position ${atIndex + 1}.`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error insertando página:', msg);
    showToast(`Error inserting page: ${msg}`);
    return false;
  }
}

/**
 * Extrae una página individual a un nuevo documento PDF.
 */
export async function executeExtractPage(pageIndex: number): Promise<boolean> {
  const { pdfBytes, fileName } = useDocumentStore.getState();

  if (!pdfBytes) {
    showToast('No document open.');
    return false;
  }

  try {
    const extractedBytes = await extractPdfPage(pdfBytes, pageIndex);
    const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'plano';
    const exportName = `${baseName}_pag_${pageIndex + 1}.pdf`;
    const { saveExportFileWithDialog } = await import('./exportService');
    await saveExportFileWithDialog(exportName, 'pdf', extractedBytes);
    showToast(`Page ${pageIndex + 1} extracted as "${exportName}".`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error extrayendo página:', msg);
    showToast(`Error extracting page: ${msg}`);
    return false;
  }
}

/**
 * Reordena una página del documento de fromIndex a toIndex (ADR-0082).
 * Sincroniza PDF, marcas, calibraciones, viewports, página activa y estado de guardado.
 */
export async function executeReorderPage(
  fromIndex: number,
  toIndex: number
): Promise<boolean> {
  const { pdfBytes, filePath, fileName, numPages, currentPageIndex, setDocument, setCurrentPage } =
    useDocumentStore.getState();
  const { markups, setMarkups } = useMarkupStore.getState();
  const { calibrations, viewports } = useCalibrationStore.getState();

  if (!pdfBytes) {
    showToast('No document open to reorder.');
    return false;
  }

  if (fromIndex < 0 || fromIndex >= numPages || toIndex < 0 || toIndex >= numPages) {
    showToast('Page index out of range.');
    return false;
  }

  if (fromIndex === toIndex) {
    return true;
  }

  try {
    const updatedBytes = await reorderPdfPages(pdfBytes, fromIndex, toIndex);
    const newPdfDoc = await loadPdfDocument(updatedBytes);

    // Remapear marcas
    const remappedMarkups = remapMarkupsOnPageReorder(markups, fromIndex, toIndex);
    setMarkups(remappedMarkups);

    // Remapear calibraciones y viewports
    const remappedCalibrations = remapCalibrationsOnPageReorder(calibrations, fromIndex, toIndex);
    const remappedViewports = remapViewportsOnPageReorder(viewports, fromIndex, toIndex);
    useCalibrationStore.setState({
      calibrations: remappedCalibrations,
      viewports: remappedViewports,
    });

    // Actualizar documento con nuevos bytes y pdfDoc
    setDocument(filePath, fileName || 'document.pdf', updatedBytes, newPdfDoc.numPages, newPdfDoc);

    // Actualizar página activa: seguir a la página movida si era la actual, o ajustar si fue desplazada
    let newCurrentPage = currentPageIndex;
    if (currentPageIndex === fromIndex) {
      newCurrentPage = toIndex;
    } else if (fromIndex < toIndex) {
      if (currentPageIndex > fromIndex && currentPageIndex <= toIndex) {
        newCurrentPage = currentPageIndex - 1;
      }
    } else {
      if (currentPageIndex >= toIndex && currentPageIndex < fromIndex) {
        newCurrentPage = currentPageIndex + 1;
      }
    }
    setCurrentPage(newCurrentPage);

    // Marcar documento como modificado
    useMarkupStore.getState().markDirty();

    showToast(`Page ${fromIndex + 1} moved to position ${toIndex + 1}.`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error reordenando página:', msg);
    showToast(`Error reordering page: ${msg}`);
    return false;
  }
}

/**
 * Combina múltiples documentos PDF y abre el resultado en una pestaña nueva (ADR-0084).
 */
export async function executeCombineDocuments(
  sources: { name: string; bytes: Uint8Array; pageIndices?: number[] }[],
  outputName = 'Combined Document.pdf'
): Promise<Uint8Array | null> {
  if (!sources || sources.length === 0) {
    showToast('Select at least one PDF file to combine.');
    return null;
  }

  try {
    const mergedBytes = await mergePdfDocuments(sources);

    await loadPdfData(null, outputName, mergedBytes);
    showToast(`Successfully combined ${sources.length} documents into ${outputName}.`);
    return mergedBytes;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error combinando documentos:', msg);
    showToast(`Error combining documents: ${msg}`);
    return null;
  }
}

