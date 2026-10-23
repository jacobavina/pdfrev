import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FullScreenCrosshair } from './FullScreenCrosshair';
import { MenuBar } from './MenuBar';
import { useUiStore } from '../../store/useUiStore';

/** Área de trabajo simulada: jsdom no calcula geometrías. */
function mountWorkArea() {
  const el = document.createElement('div');
  el.setAttribute('data-testid', 'pdf-viewer-container');
  el.getBoundingClientRect = () => ({ left: 50, top: 100, right: 850, bottom: 700, width: 800, height: 600, x: 50, y: 100, toJSON: () => ({}) });
  Object.defineProperty(el, 'clientWidth', { value: 785 });
  Object.defineProperty(el, 'clientHeight', { value: 600 });
  document.body.appendChild(el);
  return el;
}

describe('Full-Screen Crosshair (ADR-0127)', () => {
  let area: HTMLElement;
  beforeEach(() => {
    area?.remove();
    area = mountWorkArea();
    localStorage.clear();
    act(() => useUiStore.setState({ showCrosshair: false }));
  });

  it('apagada no dibuja nada; encendida sigue al cursor con una línea horizontal y otra vertical', () => {
    render(<FullScreenCrosshair />);
    expect(screen.queryByTestId('crosshair')).toBeNull();
    act(() => useUiStore.getState().setShowCrosshair(true));
    expect(screen.queryByTestId('crosshair')).toBeNull();
    fireEvent.mouseMove(window, { clientX: 120, clientY: 180 });
    expect(screen.getByTestId('crosshair-h')).toHaveStyle({ top: '180px' });
    expect(screen.getByTestId('crosshair-v')).toHaveStyle({ left: '120px' });
    expect(screen.getByTestId('crosshair-h').className).toContain('pointer-events-none');
    fireEvent.mouseMove(window, { clientX: 300, clientY: 110 });
    expect(screen.getByTestId('crosshair-v')).toHaveStyle({ left: '300px' });
  });

  it('las líneas se quedan dentro del área de trabajo y desaparecen cuando el cursor la deja', () => {
    render(<FullScreenCrosshair />);
    act(() => useUiStore.getState().setShowCrosshair(true));
    fireEvent.mouseMove(window, { clientX: 400, clientY: 300 });
    expect(screen.getByTestId('crosshair-h')).toHaveStyle({ left: '50px', width: '785px' });
    expect(screen.getByTestId('crosshair-v')).toHaveStyle({ top: '100px', height: '600px' });
    // Sobre un panel (fuera del área) o sobre la barra de desplazamiento no hay cruz
    fireEvent.mouseMove(window, { clientX: 20, clientY: 300 });
    expect(screen.queryByTestId('crosshair')).toBeNull();
    fireEvent.mouseMove(window, { clientX: 400, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 845, clientY: 300 });
    expect(screen.queryByTestId('crosshair')).toBeNull();
  });

  it('se recuerda entre sesiones y View ▸ Full-Screen Crosshair la alterna', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.click(screen.getByTestId('menu-view-crosshair'));
    expect(useUiStore.getState().showCrosshair).toBe(true);
    expect(localStorage.getItem('rea-crosshair')).toBe('1');
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.click(screen.getByTestId('menu-view-crosshair'));
    expect(localStorage.getItem('rea-crosshair')).toBe('0');
  });
});
