import { create } from 'zustand';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useDocumentTabsStore } from '../store/useDocumentTabsStore';
import { saveDocument } from './documentSaveService';
import { isTauriEnvironment } from './bbxPersistenceService';

export type PendingCloseAction =
  | { type: 'app'; fileName?: string }
  | { type: 'tab'; tabId: string; fileName: string };

interface UnsavedChangesState {
  pendingClose: PendingCloseAction | null;
  requestAppClose: () => boolean;
  requestTabClose: (tabId: string) => boolean;
  cancelClose: () => void;
  confirmDiscard: () => Promise<void>;
  confirmSave: () => Promise<boolean>;
}

export function hasAnyUnsavedChanges(): boolean {
  const { pdfBytes } = useDocumentStore.getState();
  const activeDirty = Boolean(pdfBytes) && useMarkupStore.getState().isDirty;
  if (activeDirty) return true;

  const { tabs } = useDocumentTabsStore.getState();
  return tabs.some((t) => t.isDirty);
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set, get) => ({
  pendingClose: null,

  requestAppClose: () => {
    if (!hasAnyUnsavedChanges()) {
      return false;
    }
    const { tabs, switchTab } = useDocumentTabsStore.getState();
    const activeIsDirty = Boolean(useDocumentStore.getState().pdfBytes) && useMarkupStore.getState().isDirty;
    let targetName = useDocumentStore.getState().fileName || 'current document';

    if (!activeIsDirty) {
      const firstDirtyTab = tabs.find((t) => t.isDirty);
      if (firstDirtyTab) {
        switchTab(firstDirtyTab.id);
        targetName = firstDirtyTab.fileName;
      }
    }

    set({ pendingClose: { type: 'app', fileName: targetName } });
    return true;
  },

  requestTabClose: (tabId: string) => {
    const { tabs, activeTabId, closeTab } = useDocumentTabsStore.getState();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return false;

    const isActive = tab.id === activeTabId;
    const isDirty = isActive
      ? Boolean(useDocumentStore.getState().pdfBytes) && useMarkupStore.getState().isDirty
      : tab.isDirty;

    if (isDirty) {
      set({ pendingClose: { type: 'tab', tabId, fileName: tab.fileName } });
      return true;
    }

    closeTab(tabId);
    return false;
  },

  cancelClose: () => {
    set({ pendingClose: null });
  },

  confirmDiscard: async () => {
    const { pendingClose } = get();
    if (!pendingClose) return;

    if (pendingClose.type === 'tab') {
      useDocumentTabsStore.getState().closeTab(pendingClose.tabId);
      set({ pendingClose: null });
    } else if (pendingClose.type === 'app') {
      set({ pendingClose: null });
      if (isTauriEnvironment()) {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().destroy();
        } catch (err) {
          console.warn('[UnsavedChanges] Failed to destroy window:', err);
        }
      }
    }
  },

  confirmSave: async () => {
    const { pendingClose } = get();
    if (!pendingClose) return false;

    if (pendingClose.type === 'tab') {
      const currentActiveId = useDocumentTabsStore.getState().activeTabId;
      if (pendingClose.tabId !== currentActiveId) {
        useDocumentTabsStore.getState().switchTab(pendingClose.tabId);
      }
      const ok = await saveDocument();
      if (!ok) {
        // Si el usuario canceló el diálogo de guardar o falló, no cerramos
        return false;
      }
      useDocumentTabsStore.getState().closeTab(pendingClose.tabId);
      set({ pendingClose: null });
      return true;
    } else if (pendingClose.type === 'app') {
      const ok = await saveDocument();
      if (!ok) {
        return false;
      }
      // Si la pestaña actual se guardó, actualizar su estado en el almacén de pestañas
      const activeTabId = useDocumentTabsStore.getState().activeTabId;
      if (activeTabId) {
        useDocumentTabsStore.setState((s) => ({
          tabs: s.tabs.map((t) => (t.id === activeTabId ? { ...t, isDirty: false } : t)),
        }));
      }

      // Si quedan más pestañas con cambios sin guardar, conmutar a la siguiente y solicitar confirmación
      const remainingDirtyTab = useDocumentTabsStore.getState().tabs.find((t) => t.isDirty && t.id !== activeTabId);
      if (remainingDirtyTab) {
        useDocumentTabsStore.getState().switchTab(remainingDirtyTab.id);
        set({ pendingClose: { type: 'app', fileName: remainingDirtyTab.fileName } });
        return true;
      }

      // Todas las pestañas han sido guardadas; cerrar la aplicación
      set({ pendingClose: null });
      if (isTauriEnvironment()) {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().destroy();
        } catch (err) {
          console.warn('[UnsavedChanges] Failed to destroy window after save:', err);
        }
      }
      return true;
    }

    return false;
  },
}));
