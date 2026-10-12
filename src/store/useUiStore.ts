import { create } from 'zustand';

/**
 * Estado de la interfaz del espacio de trabajo (ADR-0017): tema, panel izquierdo activo, visibilidad de
 * capas, posición del cursor sobre la página y peticiones de apertura de paneles.
 * No contiene datos del documento: nada de aquí se persiste en el PDF ni pasa por el historial.
 */

export type Theme = 'light' | 'dark';
export type LeftPanelTab = 'pages' | 'bookmarks' | 'layers';
/** Modo de visualización de páginas (ADR-0019): todas apiladas con scroll continuo, o una sola página. */
export type ViewMode = 'continuous' | 'single';
export type FitKind = 'page' | 'width';
export interface SnapSettings {
  endpoint: boolean;
  midpoint: boolean;
  nearest: boolean;
}

const SNAP_STORAGE_KEY = 'rea-snap';
const DEFAULT_SNAP: SnapSettings = { endpoint: true, midpoint: true, nearest: false };

function readStoredSnap(): SnapSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SNAP_STORAGE_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        endpoint: raw.endpoint !== false,
        midpoint: raw.midpoint !== false,
        nearest: raw.nearest === true,
      };
    }
  } catch {
    // Preferencia ilegible: se usan los valores por defecto
  }
  return { ...DEFAULT_SNAP };
}

const THEME_STORAGE_KEY = 'rea-theme';
const VIEW_MODE_STORAGE_KEY = 'rea-view-mode';

export function readStoredViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'single' ? 'single' : 'continuous';
  } catch {
    return 'continuous';
  }
}

/** Nombre con el que se agrupan las marcas sin capa asignada. */
export const NO_LAYER = '';

/** Tema del sistema operativo; si el sistema no indica preferencia (o no se puede leer), oscuro. */
export function systemTheme(): Theme {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
  } catch {
    // Sin acceso a la preferencia del sistema
  }
  return 'dark';
}

/** Preferencia guardada: 'light' o 'dark' si el usuario eligió uno; null = seguir al sistema. */
export function readStoredThemePreference(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

/** Tema efectivo al arrancar: el elegido por el usuario o, si no eligió, el del sistema (oscuro por defecto). */
export function readStoredTheme(): Theme {
  return readStoredThemePreference() ?? systemTheme();
}

/**
 * Sigue los cambios de tema del sistema mientras el usuario no haya elegido uno. Devuelve la función que
 * deja de escuchar.
 */
export function followSystemTheme(onChange: (theme: Theme) => void): () => void {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      if (readStoredThemePreference() === null) onChange(systemTheme());
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  } catch {
    return () => {};
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
  viewMode: ViewMode;
  /** Petición de ajuste del zoom (la resuelve el visor, que conoce el tamaño del área y de la página). */
  fitRequest: { kind: FitKind; seq: number } | null;
  /** Snap al dibujar y medir (ADR-0025), recordado entre sesiones. */
  snap: SnapSettings;
  /** Mostrar el valor de las mediciones sobre el plano ("Show Result Information"). */
  showMeasureLabels: boolean;

  setTheme: (theme: Theme) => void;
  /** Olvida la elección del usuario y vuelve a seguir el tema del sistema. */
  useSystemTheme: () => void;
  /** true si el tema sigue al sistema (el usuario no eligió uno). */
  themeFollowsSystem: boolean;
  toggleTheme: () => void;
  setLeftTab: (tab: LeftPanelTab) => void;
  toggleLayerVisibility: (layer: string) => void;
  setCursorPt: (pt: { x: number; y: number } | null) => void;
  requestPropertiesPanel: () => void;
  requestMeasurementsPanel: () => void;
  requestExport: (kind: 'csv' | 'report') => void;
  setShortcutsOpen: (open: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  requestFit: (kind: FitKind) => void;
  setSnap: (update: Partial<SnapSettings>) => void;
  setShowMeasureLabels: (show: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: readStoredTheme(),
  themeFollowsSystem: readStoredThemePreference() === null,
  leftTab: 'pages',
  leftOpen: true,
  hiddenLayers: [],
  cursorPt: null,
  propertiesOpenRequest: 0,
  measurementsOpenRequest: 0,
  exportRequest: null,
  shortcutsOpen: false,
  viewMode: readStoredViewMode(),
  fitRequest: null,
  snap: readStoredSnap(),
  showMeasureLabels: true,

  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Preferencia no persistible (modo privado): se aplica solo en esta sesión
    }
    set({ theme, themeFollowsSystem: false });
  },
  useSystemTheme: () => {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Sin almacenamiento: igualmente se aplica el del sistema en esta sesión
    }
    const theme = systemTheme();
    applyTheme(theme);
    set({ theme, themeFollowsSystem: true });
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
  setViewMode: (viewMode) => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Preferencia no persistible: se aplica solo en esta sesión
    }
    set({ viewMode });
  },
  requestFit: (kind) => set((s) => ({ fitRequest: { kind, seq: (s.fitRequest?.seq ?? 0) + 1 } })),
  setSnap: (update) =>
    set((s) => {
      const snap = { ...s.snap, ...update };
      try {
        localStorage.setItem(SNAP_STORAGE_KEY, JSON.stringify(snap));
      } catch {
        // Preferencia no persistible: se aplica solo en esta sesión
      }
      return { snap };
    }),
  setShowMeasureLabels: (showMeasureLabels) => set({ showMeasureLabels }),
}));
