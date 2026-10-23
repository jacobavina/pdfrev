import { isTauriEnvironment } from './bbxPersistenceService';

/**
 * Control de la ventana (ADR-0120): pantalla completa y siempre encima. En la aplicación de escritorio se usa la API de
 * ventanas de Tauri; en el navegador, la pantalla completa del documento (siempre encima no existe en una pestaña).
 */

/** ¿La ventana puede ponerse siempre encima? Solo la aplicación de escritorio. */
export const supportsAlwaysOnTop = (): boolean => isTauriEnvironment();

export async function isFullscreen(): Promise<boolean> {
  if (isTauriEnvironment()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().isFullscreen();
  }
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}

/** Entra o sale de pantalla completa y devuelve el estado en que queda. */
export async function setFullscreen(on: boolean): Promise<boolean> {
  if (isTauriEnvironment()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.setFullscreen(on);
    return win.isFullscreen();
  }
  if (on) await document.documentElement.requestFullscreen();
  else if (document.fullscreenElement) await document.exitFullscreen();
  return document.fullscreenElement !== null;
}

/** Pone o quita "siempre encima". Devuelve el estado en que queda (falso en el navegador). */
export async function setAlwaysOnTop(on: boolean): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(on);
  return on;
}
