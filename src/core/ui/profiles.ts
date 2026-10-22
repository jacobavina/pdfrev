/**
 * Perfiles de interfaz (ADR-0098): una disposición de la ventana para cada tipo de trabajo. Puro: el almacén de la
 * interfaz aplica el perfil; aquí solo se definen y se validan.
 */

export type ProfileId = 'review' | 'takeoff' | 'field' | 'custom';

export type ProfileRightPanel = 'properties' | 'measure' | 'toolchest' | null;

/** Lo que fija un perfil. Nada de esto toca el documento ni el historial. */
export interface LayoutSnapshot {
  ribbonTab: 'markup' | 'measure' | 'insert';
  leftOpen: boolean;
  leftTab: 'pages' | 'bookmarks' | 'layers';
  rightPanel: ProfileRightPanel;
  markupsListOpen: boolean;
  viewMode: 'continuous' | 'single';
  showRulers: boolean;
}

export const PROFILE_LABELS: Record<ProfileId, string> = {
  review: 'Review',
  takeoff: 'Takeoff',
  field: 'Field',
  custom: 'Custom',
};

/** Los tres perfiles de fábrica. "Custom" es la disposición que guarda el usuario. */
export const BUILTIN_PROFILES: Record<Exclude<ProfileId, 'custom'>, LayoutSnapshot> = {
  // Revisión de planos: marcas, miniaturas y la lista de marcas a la vista
  review: {
    ribbonTab: 'markup',
    leftOpen: true,
    leftTab: 'pages',
    rightPanel: 'properties',
    markupsListOpen: true,
    viewMode: 'continuous',
    showRulers: false,
  },
  // Metrados: mediciones, panel de mediciones y reglas
  takeoff: {
    ribbonTab: 'measure',
    leftOpen: true,
    leftTab: 'pages',
    rightPanel: 'measure',
    markupsListOpen: true,
    viewMode: 'single',
    showRulers: true,
  },
  // Obra: lo mínimo para ver el plano, con las herramientas de marcar a mano
  field: {
    ribbonTab: 'markup',
    leftOpen: false,
    leftTab: 'pages',
    rightPanel: null,
    markupsListOpen: false,
    viewMode: 'single',
    showRulers: false,
  },
};

const RIBBON_TABS = ['markup', 'measure', 'insert'];
const LEFT_TABS = ['pages', 'bookmarks', 'layers'];
const RIGHT_PANELS = ['properties', 'measure', 'toolchest'];
const VIEW_MODES = ['continuous', 'single'];

/** Lee una disposición guardada; devuelve null si no es válida (almacenamiento antiguo o manipulado). */
export function parseLayoutSnapshot(raw: unknown): LayoutSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!RIBBON_TABS.includes(String(r.ribbonTab))) return null;
  if (!LEFT_TABS.includes(String(r.leftTab))) return null;
  if (!(r.rightPanel === null || RIGHT_PANELS.includes(String(r.rightPanel)))) return null;
  if (!VIEW_MODES.includes(String(r.viewMode))) return null;
  if (typeof r.leftOpen !== 'boolean' || typeof r.markupsListOpen !== 'boolean' || typeof r.showRulers !== 'boolean') return null;
  return {
    ribbonTab: r.ribbonTab as LayoutSnapshot['ribbonTab'],
    leftOpen: r.leftOpen,
    leftTab: r.leftTab as LayoutSnapshot['leftTab'],
    rightPanel: r.rightPanel as ProfileRightPanel,
    markupsListOpen: r.markupsListOpen,
    viewMode: r.viewMode as LayoutSnapshot['viewMode'],
    showRulers: r.showRulers,
  };
}

export const isProfileId = (v: unknown): v is ProfileId => v === 'review' || v === 'takeoff' || v === 'field' || v === 'custom';
