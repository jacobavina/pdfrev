import { isTauriEnvironment } from './bbxPersistenceService';
import { saveIncrementalMarkups } from '../core/pdf/incrementalWriter';
import { useDocumentStore } from '../store/useDocumentStore';
import { Markup } from '../types/markup';
import { showToast } from './toastService';

export interface SavePdfResult {
  success: boolean;
  error?: string;
  bytes?: Uint8Array;
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
    const updatedBytes = await saveIncrementalMarkups(originalBytes, markups);

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

    return {
      success: true,
      bytes: updatedBytes,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PDF Persistence] Error al guardar PDF incremental: ${message}`);
    showToast(`Error al guardar PDF: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}
