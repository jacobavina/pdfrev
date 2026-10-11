import { useEffect, useRef, useCallback } from 'react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { saveBbxForPdf } from '../services/bbxPersistenceService';

export interface SaveOptions {
  /**
   * true (por defecto: botón Guardar y Ctrl+S): escribe el sidecar y el PDF.
   * false (autoguardado periódico): solo el sidecar .bbx.json de recuperación; nunca toca el PDF del usuario.
   */
  includePdf?: boolean;
}

export function useAutoSave(intervalMs = 30000) {
  const isDirty = useMarkupStore((state) => state.isDirty);
  const markups = useMarkupStore((state) => state.markups);
  const markAsClean = useMarkupStore((state) => state.markAsClean);

  const filePath = useDocumentStore((state) => state.filePath);
  const customColumns = useDocumentStore((state) => state.customColumns);
  const author = useToolStore((state) => state.author);

  const isSavingRef = useRef(false);

  const saveNow = useCallback(
    async (options: SaveOptions = {}) => {
      const includePdf = options.includePdf ?? true;
      if (!filePath || isSavingRef.current) return false;

      isSavingRef.current = true;
      try {
        const sidecarOk = await saveBbxForPdf(filePath, markups, author, customColumns);
        if (!includePdf) {
          // El autoguardado no marca el documento como limpio: el PDF sigue sin guardar
          return sidecarOk;
        }

        let pdfOk = true;
        const pdfBytes = useDocumentStore.getState().pdfBytes;
        if (pdfBytes && pdfBytes.length > 0) {
          const { savePdfIncremental } = await import('../services/pdfPersistenceService');
          const result = await savePdfIncremental(filePath, pdfBytes, markups);
          pdfOk = result.success;
        }

        // Solo se da por guardado si el PDF y el sidecar se escribieron (nunca fallar en silencio)
        if (sidecarOk && pdfOk) {
          markAsClean();
        }
        return sidecarOk && pdfOk;
      } finally {
        isSavingRef.current = false;
      }
    },
    [filePath, markups, author, customColumns, markAsClean]
  );

  useEffect(() => {
    // intervalMs <= 0: solo se quiere `saveNow` (botones y menús), sin crear otro temporizador
    if (!filePath || intervalMs <= 0) return;

    const timer = setInterval(() => {
      if (useMarkupStore.getState().isDirty) {
        saveNow({ includePdf: false });
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [filePath, intervalMs, saveNow]);

  return { saveNow, isDirty };
}
