import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HIDDEN_PANELS, anyPanelOpen, snapshotPanels } from './panelVisibility';
import { useUiStore } from '../../store/useUiStore';
import { MenuBar } from '../../components/shell/MenuBar';

let tauri = false;
const win = { fullscreen: false, onTop: false, calls: [] as string[] };
vi.mock('../../services/bbxPersistenceService', async () => ({ ...(await vi.importActual<typeof import('../../services/bbxPersistenceService')>('../../services/bbxPersistenceService')), isTauriEnvironment: () => tauri }));
vi.mock('../../services/toastService', async () => ({ ...(await vi.importActual<typeof import('../../services/toastService')>('../../services/toastService')), showToast: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setFullscreen: async (on: boolean) => {
      win.calls.push(`fullscreen:${on}`);
      win.fullscreen = on;
    },
    isFullscreen: async () => win.fullscreen,
    setAlwaysOnTop: async (on: boolean) => {
      win.calls.push(`top:${on}`);
      win.onTop = on;
    },
  }),
}));

describe('Hide Panels, Full Screen y Always On Top (ADR-0120)', () => {
  beforeEach(() => {
    tauri = false;
    win.fullscreen = false;
    win.onTop = false;
    win.calls.length = 0;
    useUiStore.setState({ leftOpen: true, rightPanel: 'properties', markupsListOpen: true, panelsBackup: null, fullscreen: false, alwaysOnTop: false });
  });

  it('un panel abierto es cualquiera de los tres, y con todo cerrado no hay nada que ocultar', () => {
    expect(anyPanelOpen({ leftOpen: false, rightPanel: null, markupsListOpen: false })).toBe(false);
    expect(anyPanelOpen({ leftOpen: true, rightPanel: null, markupsListOpen: false })).toBe(true);
    expect(anyPanelOpen({ leftOpen: false, rightPanel: 'measure', markupsListOpen: false })).toBe(true);
    expect(anyPanelOpen({ leftOpen: false, rightPanel: null, markupsListOpen: true })).toBe(true);
    expect(HIDDEN_PANELS).toEqual({ leftOpen: false, rightPanel: null, markupsListOpen: false });
    const before = { leftOpen: true, rightPanel: 'toolchest', markupsListOpen: false };
    const snap = snapshotPanels(before);
    expect(snap).toEqual(before);
    expect(snap).not.toBe(before);
  });

  it('Shift+F4 oculta todos los paneles y la segunda vez los devuelve tal y como estaban', () => {
    const s = useUiStore.getState();
    expect(s.togglePanels()).toBe(true);
    expect(useUiStore.getState()).toMatchObject({ leftOpen: false, rightPanel: null, markupsListOpen: false });
    expect(useUiStore.getState().panelsBackup).toEqual({ leftOpen: true, rightPanel: 'properties', markupsListOpen: true });
    expect(useUiStore.getState().togglePanels()).toBe(false);
    expect(useUiStore.getState()).toMatchObject({ leftOpen: true, rightPanel: 'properties', markupsListOpen: true, panelsBackup: null });
  });

  it('solo vuelve lo que estaba abierto, y con nada abierto no hace nada', () => {
    useUiStore.setState({ leftOpen: false, rightPanel: 'measure', markupsListOpen: false });
    useUiStore.getState().togglePanels();
    useUiStore.getState().togglePanels();
    expect(useUiStore.getState()).toMatchObject({ leftOpen: false, rightPanel: 'measure', markupsListOpen: false });
    useUiStore.setState({ leftOpen: false, rightPanel: null, markupsListOpen: false, panelsBackup: null });
    expect(useUiStore.getState().togglePanels()).toBe(false);
    expect(useUiStore.getState().panelsBackup).toBeNull();
  });

  it('Full Screen en la aplicación de escritorio usa la ventana de Tauri y guarda el estado en que queda', async () => {
    tauri = true;
    await useUiStore.getState().toggleFullscreen();
    expect(win.calls).toEqual(['fullscreen:true']);
    expect(useUiStore.getState().fullscreen).toBe(true);
    await useUiStore.getState().toggleFullscreen();
    expect(win.calls).toEqual(['fullscreen:true', 'fullscreen:false']);
    expect(useUiStore.getState().fullscreen).toBe(false);
  });

  it('Always On Top solo existe en el escritorio: en el navegador no hace nada y el menú lo desactiva', async () => {
    await useUiStore.getState().toggleAlwaysOnTop();
    expect(useUiStore.getState().alwaysOnTop).toBe(false);
    expect(win.calls).toEqual([]);
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    expect(screen.getByTestId('menu-view-always-on-top')).toBeDisabled();
  });

  it('Always On Top en el escritorio se pone y se quita', async () => {
    tauri = true;
    await useUiStore.getState().toggleAlwaysOnTop();
    expect(useUiStore.getState().alwaysOnTop).toBe(true);
    await useUiStore.getState().toggleAlwaysOnTop();
    expect(win.calls).toEqual(['top:true', 'top:false']);
    expect(useUiStore.getState().alwaysOnTop).toBe(false);
  });

  it('un fallo de la ventana no rompe nada y el estado no cambia', async () => {
    tauri = true;
    const fs = win.fullscreen;
    vi.spyOn(win, 'calls', 'get').mockImplementation(() => {
      throw new Error('sin permiso');
    });
    await useUiStore.getState().toggleFullscreen();
    expect(useUiStore.getState().fullscreen).toBe(false);
    expect(fs).toBe(false);
    vi.restoreAllMocks();
  });

  it('View muestra Full Screen, Hide Panels y Always On Top con sus atajos y marcas de activo', () => {
    useUiStore.setState({ fullscreen: true });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    expect(screen.getByTestId('menu-view-fullscreen')).toHaveTextContent('F11');
    expect(screen.getByTestId('menu-view-fullscreen').querySelector('.ring-1')).not.toBeNull();
    expect(screen.getByTestId('menu-view-hide-panels')).toHaveTextContent('Shift+F4');
    fireEvent.click(screen.getByTestId('menu-view-hide-panels'));
    expect(useUiStore.getState().panelsBackup).not.toBeNull();
    fireEvent.click(screen.getByTestId('menu-ver'));
    expect(screen.getByTestId('menu-view-hide-panels').querySelector('.ring-1')).not.toBeNull();
  });

  it('las teclas F11 y Shift+F4 actúan desde la ventana', async () => {
    const { default: App } = await import('../../App');
    await act(async () => {
      render(<App />);
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 'F4', shiftKey: true });
    });
    expect(useUiStore.getState().panelsBackup).not.toBeNull();
    tauri = true;
    await act(async () => {
      fireEvent.keyDown(window, { key: 'F11' });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(win.calls).toContain('fullscreen:true');
  });
});
