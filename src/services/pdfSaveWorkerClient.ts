import { saveIncrementalMarkups, IncrementalSaveOptions } from '../core/pdf/incrementalWriter';
import type { PageTransformInfo } from '../core/pdf/operators';
import { Markup } from '../types/markup';
import type { PdfSaveWorkerRequest, PdfSaveWorkerResponse } from '../workers/pdfSave.worker';

let workerInstance: Worker | null = null;
let pendingWorkerId = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (bytes: Uint8Array) => void;
    reject: (err: Error) => void;
  }
>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('../workers/pdfSave.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerInstance.onmessage = (e: MessageEvent<PdfSaveWorkerResponse>) => {
        const { id, success, updatedBytes, error } = e.data;
        const pending = pendingRequests.get(id);
        if (pending) {
          pendingRequests.delete(id);
          if (success && updatedBytes) {
            pending.resolve(updatedBytes);
          } else {
            pending.reject(new Error(error || 'Worker save failed'));
          }
        }
      };
      workerInstance.onerror = (err) => {
        console.warn('[PdfSaveWorker] Worker error, falling back:', err);
        for (const [id, req] of pendingRequests.entries()) {
          req.reject(new Error('Worker error'));
          pendingRequests.delete(id);
        }
        workerInstance?.terminate();
        workerInstance = null;
      };
    } catch {
      workerInstance = null;
    }
  }
  return workerInstance;
}

/**
 * Guarda marcas incrementalmente. Si markups.length >= 250 y Web Workers están disponibles,
 * ejecuta la serialización en segundo plano para no congelar el hilo principal.
 * En caso contrario o ante cualquier error, ejecuta directamente en el hilo principal.
 */
export async function executeIncrementalSave(
  originalBytes: Uint8Array,
  markups: Markup[],
  transformInfoMap: Record<number, PageTransformInfo> = {},
  options: IncrementalSaveOptions = {}
): Promise<Uint8Array> {
  const worker = markups.length >= 250 ? getWorker() : null;

  if (worker) {
    try {
      const id = String(++pendingWorkerId);
      return await new Promise<Uint8Array>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        const req: PdfSaveWorkerRequest = {
          id,
          originalBytes,
          markups,
          transformInfoMap,
          options,
        };
        worker.postMessage(req);
      });
    } catch (workerErr) {
      console.warn('[PdfSaveWorker] Failed in worker, falling back to main thread:', workerErr);
    }
  }

  // Fallback transparente en el hilo principal
  return await saveIncrementalMarkups(originalBytes, markups, transformInfoMap, options);
}
