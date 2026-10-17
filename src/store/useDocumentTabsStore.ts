import { create } from 'zustand';
import * as pdfjsLib from 'pdfjs-dist';
import { BbxCustomColumn, Markup, PageCalibration, MeasurementViewport } from '../types/markup';
import { PageDimension, useDocumentStore } from './useDocumentStore';
import { useMarkupStore, markupHistory } from './useMarkupStore';
import { useCalibrationStore } from './useCalibrationStore';
import { AttachmentEntry, useAttachmentStore } from './useAttachmentStore';
import { useUiStore } from './useUiStore';
import { Command } from './history/command';

/**
 * Sesión completa e independiente de un documento abierto en una pestaña (ADR-0083).
 */
export interface DocumentTabSession {
  id: string;
  filePath: string | null;
  fileName: string;
  pdfBytes: Uint8Array;
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  numPages: number;
  currentPageIndex: number;
  scale: number;
  rotation: number;
  pageDimensions: Record<number, PageDimension>;
  pageHasText: Record<number, boolean>;
  pageLabels?: Record<number, string> | null;
  customColumns?: BbxCustomColumn[];
  importedAnnotationIds: string[];
  markups: Markup[];
  selectedMarkupIds: string[];
  isDirty: boolean;
  calibrations: Record<number, PageCalibration>;
  viewports: Record<number, MeasurementViewport[]>;
  attachments: Record<string, AttachmentEntry>;
  hiddenLayers: string[];
  historyStacks?: {
    undoStack: Command[];
    redoStack: Command[];
  };
}

interface DocumentTabsState {
  tabs: DocumentTabSession[];
  activeTabId: string | null;

  openDocumentInTab: (sessionData: Omit<DocumentTabSession, 'id'>, alreadyCaptured?: boolean) => string;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  markActiveTabDirty: () => void;
  captureActiveTab: () => void;
  updateActiveTabLocation: (filePath: string, fileName: string) => void;
  getActiveTab: () => DocumentTabSession | undefined;
}

/**
 * Captura el estado actual de los stores para persistirlo en la pestaña activa.
 */
function captureActiveSession(tabId: string): DocumentTabSession | null {
  const docState = useDocumentStore.getState();
  if (!docState.pdfBytes || !docState.pdfDoc) return null;

  const markupState = useMarkupStore.getState();
  const calState = useCalibrationStore.getState();
  const attachState = useAttachmentStore.getState();
  const uiState = useUiStore.getState();

  return {
    id: tabId,
    filePath: docState.filePath,
    fileName: docState.fileName || 'document.pdf',
    pdfBytes: docState.pdfBytes,
    pdfDoc: docState.pdfDoc,
    numPages: docState.numPages,
    currentPageIndex: docState.currentPageIndex,
    scale: docState.scale,
    rotation: docState.rotation,
    pageDimensions: { ...docState.pageDimensions },
    pageHasText: { ...docState.pageHasText },
    pageLabels: docState.pageLabels ? { ...docState.pageLabels } : null,
    customColumns: docState.customColumns ? [...docState.customColumns] : undefined,
    importedAnnotationIds: [...docState.importedAnnotationIds],
    markups: [...markupState.markups],
    selectedMarkupIds: [...markupState.selectedMarkupIds],
    isDirty: markupState.isDirty,
    calibrations: { ...calState.calibrations },
    viewports: { ...calState.viewports },
    attachments: { ...attachState.files },
    hiddenLayers: [...uiState.hiddenLayers],
    historyStacks: markupHistory.getStacks(),
  };
}

/**
 * Restaura la sesión de una pestaña específica en todos los stores reactivos de la aplicación.
 */
function restoreSession(session: DocumentTabSession): void {
  // 1. useDocumentStore
  useDocumentStore.setState({
    filePath: session.filePath,
    fileName: session.fileName,
    pdfBytes: session.pdfBytes,
    pdfDoc: session.pdfDoc,
    numPages: session.numPages,
    currentPageIndex: session.currentPageIndex,
    scale: session.scale,
    rotation: session.rotation,
    pageDimensions: { ...session.pageDimensions },
    pageHasText: { ...session.pageHasText },
    pageLabels: session.pageLabels ? { ...session.pageLabels } : null,
    customColumns: session.customColumns ? [...session.customColumns] : undefined,
    importedAnnotationIds: [...session.importedAnnotationIds],
    isLoading: false,
    error: null,
  });

  // 2. useMarkupStore
  useMarkupStore.setState({
    markups: [...session.markups],
    selectedMarkupIds: [...session.selectedMarkupIds],
    isDirty: session.isDirty,
  });

  // 3. markupHistory
  if (session.historyStacks) {
    markupHistory.setStacks(session.historyStacks);
  } else {
    markupHistory.clear();
  }
  useMarkupStore.setState({
    canUndo: markupHistory.canUndo(),
    canRedo: markupHistory.canRedo(),
  });

  // 4. useCalibrationStore
  useCalibrationStore.setState({
    calibrations: { ...session.calibrations },
    viewports: { ...session.viewports },
  });

  // 5. useAttachmentStore
  useAttachmentStore.setState({
    files: { ...session.attachments },
  });

  // 6. useUiStore
  useUiStore.setState({
    hiddenLayers: [...session.hiddenLayers],
  });
}

/**
 * Resetea todos los stores al estado inicial sin documentos abiertos.
 */
function resetAllStores(): void {
  useDocumentStore.getState().closeDocument();
  useDocumentStore.setState({
    importedAnnotationIds: [],
    pageHasText: {},
    ocConfig: null,
  });
  useMarkupStore.setState({
    markups: [],
    selectedMarkupIds: [],
    isDirty: false,
    canUndo: false,
    canRedo: false,
  });
  markupHistory.clear();
  useCalibrationStore.setState({
    calibrations: {},
    viewports: {},
  });
  useAttachmentStore.setState({
    files: {},
  });
  useUiStore.setState({
    hiddenLayers: [],
  });
}

export const useDocumentTabsStore = create<DocumentTabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openDocumentInTab: (sessionData, alreadyCaptured = false) => {
    const { tabs, activeTabId } = get();

    // Si el archivo ya está abierto en una pestaña, conmutar a ella
    if (sessionData.filePath) {
      const existing = tabs.find((t) => t.filePath && t.filePath === sessionData.filePath);
      if (existing) {
        get().switchTab(existing.id);
        return existing.id;
      }
    }

    const id = `tab-${Math.random().toString(36).slice(2, 9)}`;

    let updatedTabs = [...tabs];
    if (activeTabId && !alreadyCaptured) {
      const activeIndex = updatedTabs.findIndex((t) => t.id === activeTabId);
      if (activeIndex !== -1) {
        const captured = captureActiveSession(activeTabId);
        if (captured) {
          updatedTabs[activeIndex] = captured;
        }
      }
    }

    const newSession: DocumentTabSession = {
      ...sessionData,
      id,
      historyStacks: sessionData.historyStacks ?? { undoStack: [], redoStack: [] },
    };

    updatedTabs.push(newSession);
    restoreSession(newSession);

    set({ tabs: updatedTabs, activeTabId: id });
    return id;
  },

  switchTab: (tabId) => {
    const { tabs, activeTabId } = get();
    if (tabId === activeTabId) return;

    const targetTab = tabs.find((t) => t.id === tabId);
    if (!targetTab) return;

    let updatedTabs = [...tabs];
    if (activeTabId) {
      const activeIndex = updatedTabs.findIndex((t) => t.id === activeTabId);
      if (activeIndex !== -1) {
        const captured = captureActiveSession(activeTabId);
        if (captured) {
          updatedTabs[activeIndex] = captured;
        }
      }
    }

    restoreSession(targetTab);
    set({ tabs: updatedTabs, activeTabId: tabId });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    const tabToClose = tabs[index];
    try {
      void tabToClose.pdfDoc?.destroy?.();
    } catch {
      // ignore
    }

    const newTabs = tabs.filter((t) => t.id !== tabId);

    if (newTabs.length === 0) {
      resetAllStores();
      set({ tabs: [], activeTabId: null });
      return;
    }

    if (activeTabId === tabId) {
      const nextIndex = Math.min(index, newTabs.length - 1);
      const nextTab = newTabs[nextIndex];
      restoreSession(nextTab);
      set({ tabs: newTabs, activeTabId: nextTab.id });
    } else {
      set({ tabs: newTabs });
    }
  },

  closeAllTabs: () => {
    const { tabs } = get();
    for (const tab of tabs) {
      try {
        void tab.pdfDoc?.destroy?.();
      } catch {
        // ignore
      }
    }
    resetAllStores();
    set({ tabs: [], activeTabId: null });
  },

  captureActiveTab: () => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return;
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (activeIndex === -1) return;
    const captured = captureActiveSession(activeTabId);
    if (captured) {
      const updated = [...tabs];
      updated[activeIndex] = captured;
      set({ tabs: updated });
    }
  },

  updateActiveTabLocation: (filePath, fileName) => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return;
    const index = tabs.findIndex((t) => t.id === activeTabId);
    if (index === -1) return;
    const updated = [...tabs];
    updated[index] = { ...updated[index], filePath, fileName };
    set({ tabs: updated });
  },

  reorderTabs: (fromIndex, toIndex) => {
    const { tabs } = get();
    if (fromIndex < 0 || fromIndex >= tabs.length || toIndex < 0 || toIndex >= tabs.length) {
      return;
    }
    if (fromIndex === toIndex) return;

    const newTabs = [...tabs];
    const [moved] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, moved);

    set({ tabs: newTabs });
  },

  markActiveTabDirty: () => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return;

    set({
      tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, isDirty: true } : t)),
    });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },
}));
