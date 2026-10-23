import { HIDDEN_PANELS, anyPanelOpen, snapshotPanels, type PanelsState } from '../core/ui/panelVisibility';
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  BUILTIN_PROFILES,
  LayoutSnapshot,
  ProfileId,
  isProfileId,
  parseLayoutSnapshot,
} from '../core/ui/profiles';

/** Paneles del lado derecho (ADR-0044). */
export type RightPanelId = 'properties' | 'measure' | 'toolchest';

/**
 * Estado de la interfaz del espacio de trabajo (ADR-0017): tema, panel izquierdo activo, visibilidad de
 * capas, posición del cursor sobre la página y peticiones de apertura de paneles.
 * No contiene datos del documento: nada de aquí se persiste en el PDF ni pasa por el historial.
 */

export type Theme = 'light' | 'dark';
export type LeftPanelTab = 'pages' | 'bookmarks' | 'layers' | 'links' | 'flags' | 'spaces' | 'sets' | 'forms' | 'signatures';
/** Modo de visualización de páginas (ADR-0019): todas apiladas con scroll continuo, o una sola página. */
export type ViewMode = 'continuous' | 'single';
export type FitKind = 'page' | 'width';
export interface SnapSettings {
  endpoint: boolean;
  midpoint: boolean;
  nearest: boolean;
  /** Cruce de dos líneas (ADR-0031). */
  intersection: boolean;
  /** Ajustar también a los trazos del plano, no solo a las marcas ("Snap to Content", ADR-0031). */
  content: boolean;
}

const SNAP_STORAGE_KEY = 'rea-snap';
const DEFAULT_SNAP: SnapSettings = { endpoint: true, midpoint: true, nearest: false, intersection: true, content: true };

function readStoredSnap(): SnapSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SNAP_STORAGE_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        endpoint: raw.endpoint !== false,
        midpoint: raw.midpoint !== false,
        nearest: raw.nearest === true,
        intersection: raw.intersection !== false,
        content: raw.content !== false,
      };
    }
  } catch {
    // Preferencia ilegible: se usan los valores por defecto
  }
  return { ...DEFAULT_SNAP };
}

const THEME_STORAGE_KEY = 'rea-theme';
const VIEW_MODE_STORAGE_KEY = 'rea-view-mode';
const RULERS_STORAGE_KEY = 'rea-rulers';
const AUTO_PANELS_STORAGE_KEY = 'rea-auto-panels';
const GRID_STORAGE_KEY = 'rea-grid';
export type RibbonTabId = 'markup' | 'measure' | 'insert';

const LIST_AT_START_STORAGE_KEY = 'rea-markups-list-at-start';
const PROFILE_STORAGE_KEY = 'rea-profile';
const CUSTOM_LAYOUT_STORAGE_KEY = 'rea-profile-custom';

function readStoredProfile(): ProfileId | null {
  try {
    const v = localStorage.getItem(PROFILE_STORAGE_KEY);
    return isProfileId(v) ? v : null;
  } catch {
    return null;
  }
}

function readStoredCustomLayout(): LayoutSnapshot | null {
  try {
    return parseLayoutSnapshot(JSON.parse(localStorage.getItem(CUSTOM_LAYOUT_STORAGE_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

/** La lista de marcas abre cerrada, como en Revu (ADR-0060), salvo con View ▸ Open Markups List at Start. */
export function readStoredListAtStart(): boolean {
  try {
    return localStorage.getItem(LIST_AT_START_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function readStoredAutoPanels(): boolean {
  try {
    return localStorage.getItem(AUTO_PANELS_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function readStoredRulers(): boolean {
  try {
    return localStorage.getItem(RULERS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Rejilla de la hoja (ADR-0106): se ve, imanta y con qué espaciado (null = automático, en unidades de la escala). */
export interface GridPrefs {
  show: boolean;
  snap: boolean;
  spacing: number | null;
}

export function readStoredGrid(): GridPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(GRID_STORAGE_KEY) ?? 'null') as Partial<GridPrefs> | null;
    const spacing = typeof raw?.spacing === 'number' && raw.spacing > 0 ? raw.spacing : null;
    return { show: raw?.show === true, snap: raw?.snap === true, spacing };
  } catch {
    return { show: false, snap: false, spacing: null };
  }
}

function storeGrid(prefs: GridPrefs): void {
  try {
    localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Preferencia no persistible: se aplica solo en esta sesión
  }
}

const CROSSHAIR_STORAGE_KEY = 'rea-crosshair';

/** Cruz de pantalla completa (ADR-0127), recordada entre sesiones. */
export function readStoredCrosshair(): boolean {
  try {
    return localStorage.getItem(CROSSHAIR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

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
  /** Panel derecho abierto (ADR-0044): uno a la vez, como los paneles de Revu; null = todos plegados. */
  rightPanel: RightPanelId | null;
  /** Pestaña de la cinta (ADR-0064): va en la fila de menús y sigue a la herramienta activa. */
  ribbonTab: RibbonTabId;
  setRibbonTab: (tab: RibbonTabId) => void;
  /** Lista de marcas abierta (ADR-0060); cerrada solo queda su botón en la barra de estado. Alt+L la alterna. */
  markupsListOpen: boolean;
  /** Abrir la lista de marcas al arrancar (View ▸ Open Markups List at Start). */
  markupsListAtStart: boolean;
  propertiesOpenRequest: number;
  measurementsOpenRequest: number;
  /** Petición de exportación de la lista de marcas (la ejecuta la lista, respetando sus filtros y columnas). */
  exportRequest: { kind: 'csv' | 'report' | 'append-report' | 'xlsx'; seq: number } | null;
  /** Petición de abrir el compositor de respuesta en hilo para una marca en la lista de marcas (ADR-0071). */
  replyRequest: { markupId: string; seq: number } | null;
  shortcutsOpen: boolean;
  /** Guía de funciones abierta (ADR-0100). */
  featureGuideOpen: boolean;
  /** Diálogo de Tool Sets de Revu (ADR-0105). */
  revuToolSetsOpen: boolean;
  setRevuToolSetsOpen: (open: boolean) => void;
  setFeatureGuideOpen: (open: boolean) => void;
  combineModalOpen: boolean;
  /** Diálogo de Offset o Multiply abierto (ADR-0107). */
  copyToolDialog: 'offset' | 'multiply' | null;
  /** Lista del historial de cambios abierta (ADR-0110). */
  undoHistoryOpen: boolean;
  /** Pantalla completa y siempre encima (ADR-0120). */
  fullscreen: boolean;
  alwaysOnTop: boolean;
  /** Paneles que había abiertos al pulsar Hide Panels; null si no están ocultos. */
  panelsBackup: PanelsState<RightPanelId | null> | null;
  /** Diálogo de páginas abierto: propiedades del documento, recorte o numeración (ADR-0113). */
  pageToolDialog: 'properties' | 'crop' | 'number' | 'headerFooter' | 'replace' | 'split' | 'print' | 'insert' | 'labels' | 'batch' | 'reduce' | null;
  viewMode: ViewMode;
  /** Petición de ajuste del zoom (la resuelve el visor, que conoce el tamaño del área y de la página). */
  fitRequest: { kind: FitKind; seq: number } | null;
  /** Snap al dibujar y medir (ADR-0025), recordado entre sesiones. */
  snap: SnapSettings;
  /** Mostrar el valor de las mediciones sobre el plano ("Show Result Information"). */
  showMeasureLabels: boolean;
  /** Reglas superior e izquierda en las unidades de la escala (View ▸ Rulers, Ctrl+R; ADR-0029). */
  showRulers: boolean;
  showGrid: boolean;
  /** Cruz que cruza toda la ventana siguiendo al cursor (ADR-0127). */
  showCrosshair: boolean;
  snapToGrid: boolean;
  gridSpacing: number | null;
  /** Abrir solo el panel de la marca seleccionada: Properties o Measure (View ▸ Open Panel on Selection, ADR-0043). */
  autoOpenPanels: boolean;
  /** Perfil de interfaz elegido (ADR-0098) o null si la disposición es la de arranque. Se recuerda entre sesiones. */
  profile: ProfileId | null;
  /** Disposición guardada por el usuario como perfil "Custom". */
  customLayout: LayoutSnapshot | null;
  /** Aplica un perfil: pestaña de la cinta, paneles, lista de marcas, modo de página y reglas. */
  applyProfile: (id: ProfileId) => void;
  /** Guarda la disposición actual como perfil "Custom" y la activa. */
  saveCustomProfile: () => void;

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
  setRightPanel: (panel: RightPanelId | null) => void;
  toggleMarkupsList: () => void;
  setMarkupsListOpen: (open: boolean) => void;
  setMarkupsListAtStart: (on: boolean) => void;
  requestMeasurementsPanel: () => void;
  requestExport: (kind: 'csv' | 'report' | 'append-report' | 'xlsx') => void;
  requestReply: (markupId: string) => void;
  setShortcutsOpen: (open: boolean) => void;
  setCombineModalOpen: (open: boolean) => void;
  setCopyToolDialog: (dialog: 'offset' | 'multiply' | null) => void;
  setUndoHistoryOpen: (open: boolean) => void;
  /** Hide Panels (Shift+F4): oculta todos los paneles y, la segunda vez, los devuelve. Devuelve si quedaron ocultos. */
  togglePanels: () => boolean;
  setFullscreenState: (on: boolean) => void;
  toggleFullscreen: () => Promise<void>;
  toggleAlwaysOnTop: () => Promise<void>;
  setPageToolDialog: (dialog: 'properties' | 'crop' | 'number' | 'headerFooter' | 'replace' | 'split' | 'print' | 'insert' | 'labels' | 'batch' | 'reduce' | null) => void;
  setViewMode: (mode: ViewMode) => void;
  requestFit: (kind: FitKind) => void;
  setSnap: (update: Partial<SnapSettings>) => void;
  setShowMeasureLabels: (show: boolean) => void;
  setShowRulers: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setShowCrosshair: (show: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridSpacing: (spacing: number | null) => void;
  setAutoOpenPanels: (on: boolean) => void;
  /** Marca sobre la que se está dibujando un recorte / cutout (ADR-0075). */
  activeCutoutTargetId: string | null;
  pageDimensionsPt: { width: number; height: number } | null;
  setPageDimensionsPt: (dims: { width: number; height: number } | null) => void;
  startCutout: (markupId: string) => void;
  cancelCutout: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  activeCutoutTargetId: null,
  pageDimensionsPt: null,
  setPageDimensionsPt: (pageDimensionsPt) => set({ pageDimensionsPt }),
  startCutout: (activeCutoutTargetId) => set({ activeCutoutTargetId }),
  cancelCutout: () => set({ activeCutoutTargetId: null }),
  theme: readStoredTheme(),
  themeFollowsSystem: readStoredThemePreference() === null,
  leftTab: 'pages',
  leftOpen: true,
  hiddenLayers: [],
  cursorPt: null,
  rightPanel: null,
  ribbonTab: 'markup',
  setRibbonTab: (ribbonTab) => set({ ribbonTab }),
  markupsListOpen: readStoredListAtStart(),
  markupsListAtStart: readStoredListAtStart(),
  propertiesOpenRequest: 0,
  measurementsOpenRequest: 0,
  exportRequest: null,
  replyRequest: null,
  shortcutsOpen: false,
  featureGuideOpen: false,
  revuToolSetsOpen: false,
  setRevuToolSetsOpen: (revuToolSetsOpen) => set({ revuToolSetsOpen }),
  setFeatureGuideOpen: (featureGuideOpen) => set({ featureGuideOpen }),
  combineModalOpen: false,
  copyToolDialog: null,
  undoHistoryOpen: false,
  fullscreen: false,
  alwaysOnTop: false,
  panelsBackup: null,
  togglePanels: () => {
    const s = get();
    if (s.panelsBackup) {
      set({ ...s.panelsBackup, panelsBackup: null });
      return false;
    }
    if (!anyPanelOpen(s)) return false;
    set({ ...HIDDEN_PANELS, panelsBackup: snapshotPanels(s) });
    return true;
  },
  setFullscreenState: (fullscreen) => set({ fullscreen }),
  toggleFullscreen: async () => {
    try {
      const { setFullscreen } = await import('../services/windowService');
      set({ fullscreen: await setFullscreen(!get().fullscreen) });
    } catch (err) {
      const { showToast } = await import('../services/toastService');
      showToast(`Could not change full screen: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  toggleAlwaysOnTop: async () => {
    try {
      const { setAlwaysOnTop } = await import('../services/windowService');
      set({ alwaysOnTop: await setAlwaysOnTop(!get().alwaysOnTop) });
    } catch (err) {
      const { showToast } = await import('../services/toastService');
      showToast(`Could not keep the window on top: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
  pageToolDialog: null,
  setPageToolDialog: (pageToolDialog) => set({ pageToolDialog }),
  setUndoHistoryOpen: (undoHistoryOpen) => set({ undoHistoryOpen }),
  setCopyToolDialog: (copyToolDialog) => set({ copyToolDialog }),
  setCombineModalOpen: (combineModalOpen) => set({ combineModalOpen }),
  viewMode: readStoredViewMode(),
  fitRequest: null,
  snap: readStoredSnap(),
  showMeasureLabels: true,
  showRulers: readStoredRulers(),
  showGrid: readStoredGrid().show,
  showCrosshair: readStoredCrosshair(),
  snapToGrid: readStoredGrid().snap,
  gridSpacing: readStoredGrid().spacing,
  autoOpenPanels: readStoredAutoPanels(),
  profile: readStoredProfile(),
  customLayout: readStoredCustomLayout(),

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
  requestPropertiesPanel: () => set((s) => ({ rightPanel: 'properties', propertiesOpenRequest: s.propertiesOpenRequest + 1 })),
  requestMeasurementsPanel: () =>
    set((s) => ({ rightPanel: 'measure', measurementsOpenRequest: s.measurementsOpenRequest + 1 })),
  setRightPanel: (rightPanel) => set({ rightPanel }),
  toggleMarkupsList: () => set((s) => ({ markupsListOpen: !s.markupsListOpen })),
  setMarkupsListOpen: (markupsListOpen) => set({ markupsListOpen }),
  setMarkupsListAtStart: (markupsListAtStart) => {
    try {
      localStorage.setItem(LIST_AT_START_STORAGE_KEY, markupsListAtStart ? '1' : '0');
    } catch {
      // Preferencia no persistible: se aplica solo en esta sesión
    }
    set({ markupsListAtStart });
  },
  requestExport: (kind) => set((s) => ({ exportRequest: { kind, seq: (s.exportRequest?.seq ?? 0) + 1 } })),
  requestReply: (markupId) =>
    set((s) => ({
      markupsListOpen: true,
      replyRequest: { markupId, seq: (s.replyRequest?.seq ?? 0) + 1 },
    })),
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
  setShowRulers: (showRulers) => {
    try {
      localStorage.setItem(RULERS_STORAGE_KEY, showRulers ? '1' : '0');
    } catch {
      // Preferencia no persistible: se aplica solo en esta sesión
    }
    set({ showRulers });
  },
  setShowCrosshair: (showCrosshair) => {
    try {
      localStorage.setItem(CROSSHAIR_STORAGE_KEY, showCrosshair ? '1' : '0');
    } catch {
      // Preferencia no persistible: se aplica solo en esta sesión
    }
    set({ showCrosshair });
  },
  setShowGrid: (showGrid) => {
    storeGrid({ show: showGrid, snap: get().snapToGrid, spacing: get().gridSpacing });
    set({ showGrid });
  },
  setSnapToGrid: (snapToGrid) => {
    storeGrid({ show: get().showGrid, snap: snapToGrid, spacing: get().gridSpacing });
    set({ snapToGrid });
  },
  setGridSpacing: (spacing) => {
    const gridSpacing = spacing && spacing > 0 ? spacing : null;
    storeGrid({ show: get().showGrid, snap: get().snapToGrid, spacing: gridSpacing });
    set({ gridSpacing });
  },
  applyProfile: (id) => {
    const layout = id === 'custom' ? get().customLayout : BUILTIN_PROFILES[id];
    if (!layout) return;
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, id);
    } catch {
      // Preferencia no persistible: se aplica solo en esta sesión
    }
    // El modo de página y las reglas ya tienen su propia preferencia persistente
    get().setViewMode(layout.viewMode);
    get().setShowRulers(layout.showRulers);
    set({
      profile: id,
      ribbonTab: layout.ribbonTab,
      leftOpen: layout.leftOpen,
      leftTab: layout.leftTab,
      rightPanel: layout.rightPanel,
      markupsListOpen: layout.markupsListOpen,
    });
  },
  saveCustomProfile: () => {
    const s = get();
    const layout: LayoutSnapshot = {
      ribbonTab: s.ribbonTab,
      leftOpen: s.leftOpen,
      leftTab: s.leftTab,
      rightPanel: s.rightPanel,
      markupsListOpen: s.markupsListOpen,
      viewMode: s.viewMode,
      showRulers: s.showRulers,
    };
    try {
      localStorage.setItem(CUSTOM_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
      localStorage.setItem(PROFILE_STORAGE_KEY, 'custom');
    } catch {
      // Preferencia no persistible: se guarda solo en esta sesión
    }
    set({ customLayout: layout, profile: 'custom' });
  },
  setAutoOpenPanels: (autoOpenPanels) => {
    try {
      localStorage.setItem(AUTO_PANELS_STORAGE_KEY, autoOpenPanels ? '1' : '0');
    } catch {
      // Preferencia no persistible: se aplica solo en esta sesión
    }
    set({ autoOpenPanels });
  },
}));

/**
 * Plegado de un panel derecho (ADR-0044): abrir uno pliega los demás. Con `defaultCollapsed = false` el panel se abre
 * al montarse. Devuelve [plegado, fijarPlegado].
 */
export function useRightPanel(id: RightPanelId, defaultCollapsed: boolean): [boolean, (collapsed: boolean) => void] {
  const open = useUiStore((s) => s.rightPanel === id);
  useEffect(() => {
    if (!defaultCollapsed) useUiStore.getState().setRightPanel(id);
    // Solo al montarse
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setCollapsed = (collapsed: boolean) => {
    const { rightPanel, setRightPanel } = useUiStore.getState();
    if (!collapsed) setRightPanel(id);
    else if (rightPanel === id) setRightPanel(null);
  };
  return [!open, setCollapsed];
}
