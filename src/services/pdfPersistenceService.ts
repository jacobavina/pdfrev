import { useCalibrationStore } from '../store/useCalibrationStore';
import { useAttachmentStore } from '../store/useAttachmentStore';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRef } from 'pdf-lib';
import { isTauriEnvironment } from './bbxPersistenceService';
import { annotationKeyFor, isSignedSignatureField } from '../core/pdf/incrementalWriter';
import { executeIncrementalSave } from './pdfSaveWorkerClient';
import { useUiStore } from '../store/useUiStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { Markup } from '../types/markup';
import { showToast } from './toastService';

export interface SavePdfResult {
  success: boolean;
  error?: string;
  bytes?: Uint8Array;
}

/**
 * Comprueba el PDF generado antes de escribirlo: los bytes originales siguen intactos como prefijo,
 * abre con pdf-lib, conserva el número de páginas y cada marca del modelo aparece exactamente una vez
 * como anotación de REA (sin duplicados). Lanza error si algo no cuadra.
 */
export async function validateSavedPdf(
  originalBytes: Uint8Array,
  updatedBytes: Uint8Array,
  markups: Markup[]
): Promise<void> {
  if (updatedBytes.length < originalBytes.length) {
    throw new Error('Validation: the saved PDF is shorter than the original');
  }
  for (let i = 0; i < originalBytes.length; i++) {
    if (updatedBytes[i] !== originalBytes[i]) {
      throw new Error('Validation: the original PDF bytes were not preserved');
    }
  }
  const [orig, saved] = await Promise.all([
    PDFDocument.load(originalBytes, { updateMetadata: false }),
    PDFDocument.load(updatedBytes, { updateMetadata: false }),
  ]);
  if (orig.getPageCount() !== saved.getPageCount()) {
    throw new Error('Validation: the page count changed while saving');
  }
  const seen = new Map<string, number>();
  for (const page of saved.getPages()) {
    const annots = page.node.Annots();
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const item = annots.get(i);
      const d = saved.context.lookup(item);
      if (!(d instanceof PDFDict)) continue;
      // Anotaciones de REA y campos de firma ya firmados, que se conservan tal cual (ADR-0058)
      if (!(d.get(PDFName.of('REA')) instanceof PDFDict) && !isSignedSignatureField(d)) continue;
      const id = annotationKeyFor(d, item instanceof PDFRef ? item : undefined) ?? '';
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  for (const m of markups) {
    const n = seen.get(m.id) ?? 0;
    if (n !== 1) {
      throw new Error(`Validation: markup ${m.id} appears ${n} times in the saved PDF`);
    }
  }
}

/**
 * Guarda marcas incrementalmente en el archivo PDF actual.
 * En Tauri: invoca el comando nativo `save_pdf` con escritura atómica y backup.
 * En Browser: actualiza el estado en memoria y retorna los bytes generados.
 */
export async function savePdfIncremental(
  filePath: string,
  originalBytes: Uint8Array,
  markups: Markup[]
): Promise<SavePdfResult> {
  try {
    const importedIds = useDocumentStore.getState().importedAnnotationIds ?? [];
    const calibrations = useCalibrationStore.getState().changedCalibrations();
    const viewports = useCalibrationStore.getState().changedViewports();
    const attachments = useAttachmentStore.getState().files;
    const updatedBytes = await executeIncrementalSave(originalBytes, markups, {}, {
      importedIds,
      calibrations,
      viewports,
      attachments,
      hiddenLayers: useUiStore.getState().hiddenLayers,
    });

    // Validación ANTES de escribir en disco: si falla, el archivo del usuario no se toca
    await validateSavedPdf(originalBytes, updatedBytes, markups);

    if (isTauriEnvironment()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_pdf', {
        filePath,
        bytes: Array.from(updatedBytes),
      });
    }

    // Actualizar bytes del documento activo en el store
    const { setPdfBytes } = useDocumentStore.getState();
    if (setPdfBytes) {
      setPdfBytes(updatedBytes);
    }
    // Las escalas y viewports guardados ya forman parte del PDF: el próximo guardado solo reescribe los que cambien
    useCalibrationStore.setState((st) => ({
      importedCalibrations: { ...st.calibrations },
      importedViewports: { ...st.viewports },
    }));

    return {
      success: true,
      bytes: updatedBytes,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PDF Persistence] Error al guardar PDF incremental: ${message}`);
    showToast(`Error saving PDF: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}
