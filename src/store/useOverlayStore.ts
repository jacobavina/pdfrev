import { create } from 'zustand';
import { DEFAULT_BASE_COLOR, DEFAULT_OTHER_COLOR } from '../core/compare/overlayTint';
import { IDENTITY, Linear, Pt, invertAffine, solveAlignment } from '../core/compare/overlayAlign';

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
  /** Parte lineal de la alineación por puntos (ADR-0050): T(p) = matrix·p + offset. */
  matrix: Linear;
  /** Alineación por puntos en curso: pares de puntos en pt (actual y comparada, en coordenadas de la comparada). */
  align: { picking: boolean; base: Pt[]; other: Pt[] };

  start: (source: { name: string; bytes: Uint8Array | null; pageCount: number; pageIndex?: number }) => void;
  close: () => void;
  setOtherPage: (index: number) => void;
  swapColors: () => void;
  nudge: (dx: number, dy: number) => void;
  resetOffset: () => void;
  setShowBase: (v: boolean) => void;
  setShowOther: (v: boolean) => void;
  startAlign: () => void;
  cancelAlign: () => void;
  /** Punto clicado (pt de la página actual): alterna entre la página actual y la comparada. */
  addAlignPoint: (p: Pt) => void;
  /** Aplica la alineación con los pares completos (2 o 3); devuelve false si los puntos no sirven. */
  applyAlign: () => boolean;
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
  matrix: IDENTITY,
  align: { picking: false, base: [] as Pt[], other: [] as Pt[] },
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
  resetOffset: () => set({ offset: { x: 0, y: 0 }, matrix: IDENTITY }),
  setShowBase: (showBase) => set({ showBase }),
  setShowOther: (showOther) => set({ showOther }),
  startAlign: () => set({ align: { picking: true, base: [], other: [] }, showBase: true, showOther: true }),
  cancelAlign: () => set({ align: { picking: false, base: [], other: [] } }),
  addAlignPoint: (p) => {
    const { align, matrix, offset } = get();
    if (!align.picking) return;
    if (align.base.length === align.other.length) {
      set({ align: { ...align, base: [...align.base, p] } });
      return;
    }
    // El clic sobre el dibujo comparado: su punto propio deshaciendo la alineación vigente
    const o = invertAffine(matrix, offset, p) ?? p;
    const next = { ...align, other: [...align.other, o] };
    set({ align: next });
    if (next.other.length >= 3) get().applyAlign();
  },
  applyAlign: () => {
    const { align } = get();
    const n = Math.min(align.base.length, align.other.length);
    const solved = solveAlignment(align.base.slice(0, n), align.other.slice(0, n));
    if (!solved) return false;
    const round = (v: number) => Math.round(v * 100) / 100;
    set({
      matrix: solved.matrix,
      offset: { x: round(solved.offset.x), y: round(solved.offset.y) },
      align: { picking: false, base: [], other: [] },
    });
    return true;
  },
}));
