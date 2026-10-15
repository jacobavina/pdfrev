import { create } from 'zustand';
import { DEFAULT_BASE_COLOR, DEFAULT_OTHER_COLOR } from '../core/compare/overlayTint';

/**
 * Estado de Overlay Pages (ADR-0038): qué documento se compara con la página activa, qué página suya, colores,
 * desplazamiento (pt) y visibilidad de cada capa. No se guarda en el PDF ni en el historial.
 */
export interface OverlayState {
  active: boolean;
  /** Nombre visible del documento comparado ("This document" si es el propio). */
  sourceName: string;
  /** Bytes del documento comparado (null = el documento abierto). */
  sourceBytes: Uint8Array | null;
  /** Página comparada, base 0. */
  otherPageIndex: number;
  otherPageCount: number;
  baseColor: string;
  otherColor: string;
  /** Desplazamiento de la página comparada en pt (para alinear revisiones que no coinciden). */
  offset: { x: number; y: number };
  showBase: boolean;
  showOther: boolean;

  start: (source: { name: string; bytes: Uint8Array | null; pageCount: number; pageIndex?: number }) => void;
  close: () => void;
  setOtherPage: (index: number) => void;
  swapColors: () => void;
  nudge: (dx: number, dy: number) => void;
  resetOffset: () => void;
  setShowBase: (v: boolean) => void;
  setShowOther: (v: boolean) => void;
}

const INITIAL = {
  active: false,
  sourceName: '',
  sourceBytes: null as Uint8Array | null,
  otherPageIndex: 0,
  otherPageCount: 0,
  baseColor: DEFAULT_BASE_COLOR,
  otherColor: DEFAULT_OTHER_COLOR,
  offset: { x: 0, y: 0 },
  showBase: true,
  showOther: true,
};

export const useOverlayStore = create<OverlayState>((set, get) => ({
  ...INITIAL,
  start: ({ name, bytes, pageCount, pageIndex = 0 }) =>
    set({
      ...INITIAL,
      active: true,
      sourceName: name,
      sourceBytes: bytes,
      otherPageCount: Math.max(1, pageCount),
      otherPageIndex: Math.max(0, Math.min(pageCount - 1, pageIndex)),
    }),
  close: () => set({ ...INITIAL }),
  setOtherPage: (index) => set({ otherPageIndex: Math.max(0, Math.min(get().otherPageCount - 1, index)) }),
  swapColors: () => set((s) => ({ baseColor: s.otherColor, otherColor: s.baseColor })),
  nudge: (dx, dy) => set((s) => ({ offset: { x: s.offset.x + dx, y: s.offset.y + dy } })),
  resetOffset: () => set({ offset: { x: 0, y: 0 } }),
  setShowBase: (showBase) => set({ showBase }),
  setShowOther: (showOther) => set({ showOther }),
}));
