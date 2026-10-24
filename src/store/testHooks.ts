import { useMarkupStore } from './useMarkupStore';
import { useToolStore } from './useToolStore';

export interface ReaTestHooks {
  getMarkupCount: () => number;
  getMarkupIds: () => string[];
  getSelectedMarkupIds: () => string[];
  getLastMarkup: () => { id: string; type: string; author: string; text?: string } | null;
  getActiveTool: () => string;
  getMarkupText: (id: string) => string | undefined;
  loadPdfData: (filePath: string | null, fileName: string, fileBytes: Uint8Array) => Promise<void>;
}

if (typeof window !== 'undefined') {
  const hooks: ReaTestHooks = {
    getMarkupCount: () => useMarkupStore.getState().markups.length,
    getMarkupIds: () => useMarkupStore.getState().markups.map((m) => m.id),
    getSelectedMarkupIds: () => [...useMarkupStore.getState().selectedMarkupIds],
    getLastMarkup: () => {
      const markups = useMarkupStore.getState().markups;
      if (markups.length === 0) return null;
      const m = markups[markups.length - 1];
      return { id: m.id, type: m.type, author: m.author, text: m.text };
    },
    getActiveTool: () => useToolStore.getState().activeTool,
    getMarkupText: (id: string) => {
      const m = useMarkupStore.getState().markups.find((m) => m.id === id);
      return m?.text;
    },
    loadPdfData: (filePath, fileName, fileBytes) =>
      import('../services/fileDialogService').then((m) => m.loadPdfData(filePath, fileName, fileBytes)),
  };

  (window as unknown as { __REA_TEST_HOOKS__: ReaTestHooks }).__REA_TEST_HOOKS__ = Object.freeze(hooks);
}
