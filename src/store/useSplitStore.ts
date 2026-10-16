import { create } from 'zustand';

/**
 * Vista lado a lado (ADR-0049), como Split View de Revu: un segundo panel a la derecha del visor con otra página del
 * documento o de otro PDF (otra revisión), al mismo zoom y, con Sync, en la misma zona del plano. No se guarda.
 */
export interface SplitState {
  active: boolean;
  /** Nombre visible del documento del panel ("This document" si es el propio). */
  sourceName: string;
  /** Bytes del otro PDF (null = el documento abierto). */
  sourceBytes: Uint8Array | null;
  pageIndex: number;
  pageCount: number;
  /** Sincronizar con el visor principal: misma zona del plano (y misma página si es otro PDF). */
  sync: boolean;
  /** Centro de la vista del visor principal, normalizado sobre su página activa (lo publica el visor). */
  mainView: { pageIndex: number; nx: number; ny: number } | null;
  /** Centro de la vista del panel lado a lado, normalizado sobre la página activa (ADR-0054). */
  splitView: { pageIndex: number; nx: number; ny: number } | null;
  /** Último panel que originó el movimiento sincronizado ('main' | 'split'). */
  driver: 'main' | 'split' | null;

  start: (source: { name: string; bytes: Uint8Array | null; pageCount: number; pageIndex?: number }) => void;
  close: () => void;
  setPage: (index: number) => void;
  setSync: (sync: boolean) => void;
  setMainView: (view: { pageIndex: number; nx: number; ny: number }) => void;
  setSplitView: (view: { pageIndex: number; nx: number; ny: number }) => void;
}

const INITIAL = {
  active: false,
  sourceName: '',
  sourceBytes: null as Uint8Array | null,
  pageIndex: 0,
  pageCount: 0,
  sync: true,
  mainView: null as SplitState['mainView'],
  splitView: null as SplitState['splitView'],
  driver: null as SplitState['driver'],
};

export const useSplitStore = create<SplitState>((set, get) => ({
  ...INITIAL,
  start: ({ name, bytes, pageCount, pageIndex = 0 }) =>
    set({
      ...INITIAL,
      active: true,
      sourceName: name,
      sourceBytes: bytes,
      pageCount: Math.max(1, pageCount),
      pageIndex: Math.max(0, Math.min(pageCount - 1, pageIndex)),
    }),
  close: () => set({ ...INITIAL }),
  setPage: (index) => set({ pageIndex: Math.max(0, Math.min(get().pageCount - 1, index)) }),
  setSync: (sync) => set({ sync }),
  setMainView: (mainView) => set({ mainView, driver: 'main' }),
  setSplitView: (splitView) => set({ splitView, driver: 'split' }),
}));

