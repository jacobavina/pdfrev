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
  isLoading: boolean;
  error: string | null;

  // Actions
  setDocument: (
    filePath: string | null,
    fileName: string,
    bytes: Uint8Array,
    numPages: number,
    pdfDoc: pdfjsLib.PDFDocumentProxy
  ) => void;
  setCustomColumns: (customColumns?: BbxCustomColumn[]) => void;
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
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  closeDocument: () => void;
}

const MIN_ZOOM = 0.25;
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
  isLoading: false,
  error: null,

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
      error: null,
      isLoading: false,
    }),

  setCustomColumns: (customColumns) => set({ customColumns }),

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
