/**
 * Ocultar paneles (Hide Panels, ADR-0120): se guardan los paneles que estaban abiertos, se cierran todos para que el plano
 * ocupe la ventana y la segunda vez se reabren tal y como estaban. Puro.
 */

export interface PanelsState<R = string | null> {
  leftOpen: boolean;
  rightPanel: R;
  markupsListOpen: boolean;
}

/** ¿Hay algún panel abierto que se pueda ocultar? */
export const anyPanelOpen = (s: PanelsState): boolean => s.leftOpen || s.rightPanel !== null || s.markupsListOpen;

/** Lo que cambia al ocultar: todo cerrado. */
export const HIDDEN_PANELS = { leftOpen: false, rightPanel: null, markupsListOpen: false } as const;

/** Copia de lo que hay abierto, para volver a ello. */
export function snapshotPanels<R>(s: PanelsState<R>): PanelsState<R> {
  return { leftOpen: s.leftOpen, rightPanel: s.rightPanel, markupsListOpen: s.markupsListOpen };
}
