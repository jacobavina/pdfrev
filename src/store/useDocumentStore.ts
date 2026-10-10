import { create } from 'zustand';
import * as pdfjsLib from 'pdfjs-dist';

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
  isLoading: boolean;
  error: string | null;

  // Actions
  setDocument: (
    filePath: string,
    fileName: string,
    bytes: Uint8Array,
    numPages: number,
    pdfDoc: pdfjsLib.PDFDocumentProxy
  ) => void;
  setCurrentPage: (pageIndex: number) => void;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  rotateClockwise: () => void;
  setPageDimensions: (pageIndex: number, width: number, height: number) => void;
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
      error: null,
      isLoading: false,
    }),

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
      error: null,
      isLoading: false,
    }),
}));
