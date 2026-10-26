import { useMarkupStore } from '../store/useMarkupStore';
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
 * abre con pdf-lib, conserva el número de páginas y verifica que las marcas existan.
 * En producción (isProductionSave), jamás aborta el guardado del usuario por conteo de marcas (ADR-0028).
 */
export async function validateSavedPdf(
  originalBytes: Uint8Array,
  updatedBytes: Uint8Array,
  markups: Markup[],
  options?: { isProductionSave?: boolean }
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
  // Verificación de integridad de contenido (ADR-0046, ISO 32000-1):
  // Asegurar que ningún flujo de contenido (/Contents) de las páginas originales fue sobrescrito
  // por Form XObjects o diccionarios de anotaciones.
  for (let p = 0; p < orig.getPageCount(); p++) {
    const origContents = orig.getPage(p).node.Contents();
    if (!origContents) continue;
    const contentRefs: PDFRef[] = [];
    if (origContents instanceof PDFRef) {
      contentRefs.push(origContents);
    } else if (origContents instanceof PDFArray) {
      for (let c = 0; c < origContents.size(); c++) {
        const item = origContents.get(c);
        if (item instanceof PDFRef) contentRefs.push(item);
      }
    }
    for (const ref of contentRefs) {
      const savedObj = saved.context.lookup(ref);
      const dict =
        savedObj instanceof PDFDict
          ? savedObj
          : (savedObj as any)?.dict instanceof PDFDict
            ? (savedObj as any).dict
            : undefined;
      if (dict) {
        const type = dict.get(PDFName.of('Type'))?.toString();
        const subtype = dict.get(PDFName.of('Subtype'))?.toString();
        if (type === '/Annot' || subtype === '/Form') {
          throw new Error(
            `Validation: page ${p + 1} content stream object ${ref.objectNumber} was overwritten by an annotation or Form XObject`
          );
        }
      }
    }
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
      const reaDict = d.lookup(PDFName.of('REA'));
      if (!(reaDict instanceof PDFDict) && !isSignedSignatureField(d)) continue;
      const id = annotationKeyFor(d, item instanceof PDFRef ? item : undefined) ?? '';
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  for (const m of markups) {
    const n = seen.get(m.id) ?? 0;
    if (n > 1) {
      if (options?.isProductionSave) {
        console.warn(`[PDF Validation] Markup ${m.id} appears ${n} times in the saved PDF, continuing save...`);
      } else {
        throw new Error(`Validation: markup ${m.id} appears ${n} times in the saved PDF`);
      }
    }
    if (n === 0) {
      const foreignNum = m.customFields?.foreignWidgetObjNum;
      if (typeof foreignNum === 'number') continue;
      console.warn(`[PDF Validation] Markup ${m.id} was not serialized to /Annots, continuing save...`);
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
    const pageCount = useDocumentStore.getState().numPages || 1;

    // Deduplicar marcas por ID en memoria si existieran duplicados previos
    const uniqueMarkupsMap = new Map<string, Markup>();
    for (const m of markups) {
      uniqueMarkupsMap.set(m.id, m);
    }
    const deduplicatedMarkups = Array.from(uniqueMarkupsMap.values());
    if (deduplicatedMarkups.length !== markups.length) {
      console.warn(
        `[PDF Persistence] Found ${markups.length - deduplicatedMarkups.length} duplicate markups in memory, deduplicating before save.`
      );
      try {
        useMarkupStore.getState().setMarkups?.(deduplicatedMarkups);
      } catch (e) {
        console.warn('[PDF Persistence] Could not sync deduplicated markups to store:', e);
      }
    }

    const normalizedMarkups = deduplicatedMarkups.map((m) => {
      const rawIdx = typeof m.pageIndex === 'number' && Number.isFinite(m.pageIndex) ? Math.floor(m.pageIndex) : 0;
      const clampedIdx = Math.max(0, Math.min(pageCount - 1, rawIdx));
      return m.pageIndex === clampedIdx ? m : { ...m, pageIndex: clampedIdx };
    });
    const updatedBytes = await executeIncrementalSave(originalBytes, normalizedMarkups, {}, {
      importedIds,
      calibrations,
      viewports,
      attachments,
      hiddenLayers: useUiStore.getState().hiddenLayers,
    });

    // Validación ANTES de escribir en disco: si falla, el archivo del usuario no se toca
    await validateSavedPdf(originalBytes, updatedBytes, normalizedMarkups, { isProductionSave: true });

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
