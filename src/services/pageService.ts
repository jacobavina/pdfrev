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
    showToast('No hay documento abierto para rotar.');
    return false;
  }

  try {
    const updatedBytes = await rotatePdfPage(pdfBytes, pageIndex, deltaDegrees);
    const newPdfDoc = await loadPdfDocument(updatedBytes);

    setDocument(filePath, fileName || 'documento.pdf', updatedBytes, newPdfDoc.numPages, newPdfDoc);
    showToast(`Página ${pageIndex + 1} rotada ${deltaDegrees}° exitosamente.`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error rotando página:', msg);
    showToast(`Error al rotar página: ${msg}`);
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
    showToast('No hay documento abierto para modificar.');
    return false;
  }

  if (numPages <= 1) {
    showToast('No es posible eliminar la única página del documento.');
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

    setDocument(filePath, fileName || 'documento.pdf', updatedBytes, newPdfDoc.numPages, newPdfDoc);

    // Ajustar página activa si correspondía a la eliminada o estaba fuera de rango
    const newPageIndex = Math.min(currentPageIndex, newPdfDoc.numPages - 1);
    setCurrentPage(newPageIndex);

    showToast(`Página ${pageIndex + 1} eliminada.`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error eliminando página:', msg);
    showToast(`Error al eliminar página: ${msg}`);
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
    showToast('No hay documento abierto.');
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

    setDocument(filePath, fileName || 'documento.pdf', updatedBytes, newPdfDoc.numPages, newPdfDoc);
    setCurrentPage(atIndex);

    showToast(`Página en blanco insertada en la posición ${atIndex + 1}.`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error insertando página:', msg);
    showToast(`Error al insertar página: ${msg}`);
    return false;
  }
}

/**
 * Extrae una página individual a un nuevo documento PDF.
 */
export async function executeExtractPage(pageIndex: number): Promise<boolean> {
  const { pdfBytes, fileName } = useDocumentStore.getState();

  if (!pdfBytes) {
    showToast('No hay documento abierto.');
    return false;
  }

  try {
    const extractedBytes = await extractPdfPage(pdfBytes, pageIndex);
    const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'plano';
    const exportName = `${baseName}_pag_${pageIndex + 1}.pdf`;
    const { saveExportFileWithDialog } = await import('./exportService');
    await saveExportFileWithDialog(exportName, 'pdf', extractedBytes);
    showToast(`Página ${pageIndex + 1} extraída exitosamente como "${exportName}".`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PageService] Error extrayendo página:', msg);
    showToast(`Error al extraer página: ${msg}`);
    return false;
  }
}
