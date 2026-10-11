import { create } from 'zustand';

/**
 * Estado de la interfaz del espacio de trabajo (ADR-0017): tema, panel izquierdo activo, visibilidad de
 * capas, posición del cursor sobre la página y peticiones de apertura de paneles.
 * No contiene datos del documento: nada de aquí se persiste en el PDF ni pasa por el historial.
 */

export type Theme = 'light' | 'dark';
export type LeftPanelTab = 'pages' | 'bookmarks' | 'layers';

const THEME_STORAGE_KEY = 'rea-theme';

/** Nombre con el que se agrupan las marcas sin capa asignada. */
export const NO_LAYER = '';

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

interface UiState {
  theme: Theme;
  leftTab: LeftPanelTab;
  leftOpen: boolean;
  hiddenLayers: string[];
  /** Posición del cursor en puntos PDF desde la esquina superior izquierda de la página, o null fuera de ella. */
  cursorPt: { x: number; y: number } | null;
  /** Se incrementa cada vez que algo pide abrir el panel de propiedades (menú contextual, menú Ver). */
  propertiesOpenRequest: number;
  measurementsOpenRequest: number;
  /** Petición de exportación de la lista de marcas (la ejecuta la lista, respetando sus filtros y columnas). */
  exportRequest: { kind: 'csv' | 'report'; seq: number } | null;
  shortcutsOpen: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLeftTab: (tab: LeftPanelTab) => void;
  toggleLayerVisibility: (layer: string) => void;
  setCursorPt: (pt: { x: number; y: number } | null) => void;
  requestPropertiesPanel: () => void;
  requestMeasurementsPanel: () => void;
  requestExport: (kind: 'csv' | 'report') => void;
  setShortcutsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: readStoredTheme(),
  leftTab: 'pages',
  leftOpen: true,
  hiddenLayers: [],
  cursorPt: null,
  propertiesOpenRequest: 0,
  measurementsOpenRequest: 0,
  exportRequest: null,
  shortcutsOpen: false,

  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Preferencia no persistible (modo privado): se aplica solo en esta sesión
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  // Pulsar la pestaña activa pliega el panel; cualquier otra lo abre en esa pestaña
  setLeftTab: (leftTab) =>
    set((s) => (s.leftTab === leftTab && s.leftOpen ? { leftOpen: false } : { leftTab, leftOpen: true })),
  toggleLayerVisibility: (layer) =>
    set((state) => ({
      hiddenLayers: state.hiddenLayers.includes(layer)
        ? state.hiddenLayers.filter((l) => l !== layer)
        : [...state.hiddenLayers, layer],
    })),
  setCursorPt: (cursorPt) => set({ cursorPt }),
  requestPropertiesPanel: () => set((s) => ({ propertiesOpenRequest: s.propertiesOpenRequest + 1 })),
  requestMeasurementsPanel: () => set((s) => ({ measurementsOpenRequest: s.measurementsOpenRequest + 1 })),
  requestExport: (kind) => set((s) => ({ exportRequest: { kind, seq: (s.exportRequest?.seq ?? 0) + 1 } })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));
