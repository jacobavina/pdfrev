import { saveIncrementalMarkups, IncrementalSaveOptions } from '../core/pdf/incrementalWriter';
import type { PageTransformInfo } from '../core/pdf/operators';
import { Markup } from '../types/markup';

export interface PdfSaveWorkerRequest {
  id: string;
  originalBytes: Uint8Array;
  markups: Markup[];
  transformInfoMap?: Record<number, PageTransformInfo>;
  options?: IncrementalSaveOptions;
}

export interface PdfSaveWorkerResponse {
  id: string;
  success: boolean;
  updatedBytes?: Uint8Array;
  error?: string;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<PdfSaveWorkerRequest>) => void) | null;
  postMessage: (message: PdfSaveWorkerResponse, transfer?: Transferable[]) => void;
};

ctx.onmessage = async (e: MessageEvent<PdfSaveWorkerRequest>) => {
  const { id, originalBytes, markups, transformInfoMap = {}, options = {} } = e.data;
  try {
    const updatedBytes = await saveIncrementalMarkups(originalBytes, markups, transformInfoMap, options);
    // Zero-copy transfer del ArrayBuffer subyacente
    const buffer = updatedBytes.buffer;
    ctx.postMessage(
      {
        id,
        success: true,
        updatedBytes,
      },
      [buffer]
    );
  } catch (err: unknown) {
    ctx.postMessage({
      id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
