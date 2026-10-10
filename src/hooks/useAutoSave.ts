import { useEffect, useRef, useCallback } from 'react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { saveBbxForPdf } from '../services/bbxPersistenceService';

export function useAutoSave(intervalMs = 30000) {
  const isDirty = useMarkupStore((state) => state.isDirty);
  const markups = useMarkupStore((state) => state.markups);
  const markAsClean = useMarkupStore((state) => state.markAsClean);

  const filePath = useDocumentStore((state) => state.filePath);
  const author = useToolStore((state) => state.author);

  const isSavingRef = useRef(false);

  const saveNow = useCallback(async () => {
    if (!filePath || isSavingRef.current) return false;

    isSavingRef.current = true;
    try {
      const ok = await saveBbxForPdf(filePath, markups, author);
      if (ok) {
        markAsClean();
      }
      return ok;
    } finally {
      isSavingRef.current = false;
    }
  }, [filePath, markups, author, markAsClean]);

  useEffect(() => {
    if (!filePath) return;

    const timer = setInterval(() => {
      if (useMarkupStore.getState().isDirty) {
        saveNow();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [filePath, intervalMs, saveNow]);

  return { saveNow, isDirty };
}
