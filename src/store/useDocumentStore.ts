import { create } from 'zustand';
import * as pdfjsLib from 'pdfjs-dist';
import { BbxCustomColumn, MAX_CUSTOM_COLUMNS } from '../types/markup';
import { useMarkupStore } from './useMarkupStore';

export interface PageDimension {
  width: number;
  height: number;
}

interface DocumentState {
  filePath: string | null;
  fileName: string | null;
  pdfBytes: Uint8Array | null;
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  numPages: number;
  currentPageIndex: number; // 0-based
  scale: number;
  rotation: number; // 0, 90, 180, 270
  pageDimensions: Record<number, PageDimension>;
  pageHasText: Record<number, boolean>;
  // Justificación AGENTS.md §4: customColumns es metadato de esquema a nivel de documento sin historial undo/redo, por lo que pertenece a useDocumentStore y no a useMarkupStore.
  customColumns?: BbxCustomColumn[];
  // Ids de las anotaciones importadas del PDF al abrirlo: el escritor retira las que el usuario borre
  importedAnnotationIds: string[];
  isLoading: boolean;
  error: string | null;
  /** Capas del PDF (ADR-0024): configuración de contenido opcional de PDF.js y versión para re-renderizar. */
  ocConfig: unknown | null;
  ocVersion: number;
  setOcConfig: (config: unknown | null) => void;
  setPdfLayerVisible: (id: string, visible: boolean) => void;
  setAllPdfLayersVisible: (visible: boolean) => void;

  // Actions
  setDocument: (
    filePath: string | null,
    fileName: string,
    bytes: Uint8Array,
    numPages: number,
    pdfDoc: pdfjsLib.PDFDocumentProxy
  ) => void;
  setCustomColumns: (customColumns?: BbxCustomColumn[]) => void;
  setImportedAnnotationIds: (ids: string[]) => void;
  addCustomColumn: (column: BbxCustomColumn) => void;
  updateCustomColumn: (columnId: string, updates: Partial<BbxCustomColumn>) => void;
  removeCustomColumn: (columnId: string) => void;
  setCurrentPage: (pageIndex: number) => void;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  rotateClockwise: () => void;
  setPageDimensions: (pageIndex: number, width: number, height: number) => void;
  setPageHasText: (pageIndex: number, hasText: boolean) => void;
  setPdfBytes: (bytes: Uint8Array) => void;
  /** Tras "Guardar como": el documento pasa a ser el archivo guardado (ADR-0028). */
  setFileLocation: (filePath: string, fileName: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  closeDocument: () => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.25;

export const useDocumentStore = create<DocumentState>((set) => ({
  filePath: null,
  fileName: null,
  pdfBytes: null,
  pdfDoc: null,
  numPages: 0,
  currentPageIndex: 0,
  scale: 1.0,
  rotation: 0,
  pageDimensions: {},
  pageHasText: {},
  customColumns: undefined,
  importedAnnotationIds: [],
  isLoading: false,
  error: null,
  ocConfig: null,
  ocVersion: 0,

  setOcConfig: (ocConfig) => set((s) => ({ ocConfig, ocVersion: s.ocVersion + 1 })),
  setPdfLayerVisible: (id, visible) => {
    const cfg = useDocumentStore.getState().ocConfig as { setVisibility?: (id: string, v: boolean) => void } | null;
    if (!cfg?.setVisibility) return;
    cfg.setVisibility(id, visible);
    set((s) => ({ ocVersion: s.ocVersion + 1 }));
  },
  setAllPdfLayersVisible: (visible) => {
    const cfg = useDocumentStore.getState().ocConfig as {
      setVisibility?: (id: string, v: boolean) => void;
      getGroups?: () => Record<string, unknown> | null;
    } | null;
    if (!cfg?.setVisibility || !cfg.getGroups) return;
    for (const id of Object.keys(cfg.getGroups() ?? {})) cfg.setVisibility(id, visible);
    set((s) => ({ ocVersion: s.ocVersion + 1 }));
  },

  setDocument: (filePath, fileName, bytes, numPages, pdfDoc) =>
    set({
      filePath,
      fileName,
      pdfBytes: bytes,
      pdfDoc,
      numPages,
      currentPageIndex: 0,
      scale: 1.0,
      rotation: 0,
      pageDimensions: {},
      pageHasText: {},
      customColumns: undefined,
      importedAnnotationIds: [],
      ocConfig: null,
      error: null,
      isLoading: false,
    }),

  setCustomColumns: (customColumns) => set({ customColumns }),

  setImportedAnnotationIds: (ids) => set({ importedAnnotationIds: ids }),

  addCustomColumn: (column) => {
    set((state) => {
      const current = state.customColumns ?? [];
      if (current.length >= MAX_CUSTOM_COLUMNS) return state;
      if (current.some((c) => c.id === column.id)) return state;
      return { customColumns: [...current, column] };
    });
    useMarkupStore.getState().markDirty();
  },

  updateCustomColumn: (columnId, updates) => {
    set((state) => {
      if (!state.customColumns) return state;
      return {
        customColumns: state.customColumns.map((c) =>
          c.id === columnId ? { ...c, ...updates } : c
        ),
      };
    });
    useMarkupStore.getState().markDirty();
  },

  removeCustomColumn: (columnId) => {
    set((state) => {
      if (!state.customColumns) return state;
      return {
        customColumns: state.customColumns.filter((c) => c.id !== columnId),
      };
    });
    useMarkupStore.getState().removeCustomColumnValues(columnId);
    useMarkupStore.getState().markDirty();
  },

  setCurrentPage: (pageIndex) =>
    set((state) => ({
      currentPageIndex: Math.max(0, Math.min(state.numPages - 1, pageIndex)),
    })),

  setScale: (scale) =>
    set({
      scale: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale)),
    }),

  zoomIn: () =>
    set((state) => ({
      scale: Math.min(MAX_ZOOM, Math.round((state.scale + ZOOM_STEP) * 100) / 100),
    })),

  zoomOut: () =>
    set((state) => ({
      scale: Math.max(MIN_ZOOM, Math.round((state.scale - ZOOM_STEP) * 100) / 100),
    })),

  resetZoom: () =>
    set({
      scale: 1.0,
    }),

  rotateClockwise: () =>
    set((state) => ({
      rotation: (state.rotation + 90) % 360,
    })),

  setPageDimensions: (pageIndex, width, height) =>
    set((state) => ({
      pageDimensions: {
        ...state.pageDimensions,
        [pageIndex]: { width, height },
      },
    })),

  setPageHasText: (pageIndex, hasText) =>
    set((state) => ({
      pageHasText: {
        ...state.pageHasText,
        [pageIndex]: hasText,
      },
    })),

  setPdfBytes: (pdfBytes) => set({ pdfBytes }),
  setFileLocation: (filePath, fileName) => set({ filePath, fileName }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),

  closeDocument: () =>
    set({
      filePath: null,
      fileName: null,
      pdfBytes: null,
      pdfDoc: null,
      numPages: 0,
      currentPageIndex: 0,
      scale: 1.0,
      rotation: 0,
      pageDimensions: {},
      customColumns: undefined,
      error: null,
      isLoading: false,
    }),
}));
