/**
 * Servicio integrador de operaciones de página para REA (Paquete 5).
 * Coordina la transformación de PDF, remapeo de marcas y calibraciones, y actualización reactiva de stores.
 */

import {
  rotatePdfPage,
  deletePdfPage,
  insertBlankPdfPage,
  extractPdfPage,
  remapMarkupsOnPageDeletion,
  remapMarkupsOnPageInsertion,
  remapCalibrationsOnPageDeletion,
  remapCalibrationsOnPageInsertion,
} from '../core/pages/pageOperations';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { loadPdfDocument } from './pdfService';
import { showToast } from './toastService';

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
