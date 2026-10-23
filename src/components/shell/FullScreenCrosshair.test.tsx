import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FullScreenCrosshair } from './FullScreenCrosshair';
import { MenuBar } from './MenuBar';
import { useUiStore } from '../../store/useUiStore';

describe('Full-Screen Crosshair (ADR-0127)', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => useUiStore.setState({ showCrosshair: false }));
  });

  it('apagada no dibuja nada; encendida sigue al cursor con una línea horizontal y otra vertical', () => {
    render(<FullScreenCrosshair />);
    expect(screen.queryByTestId('crosshair')).toBeNull();
    act(() => useUiStore.getState().setShowCrosshair(true));
    expect(screen.queryByTestId('crosshair')).toBeNull();
    fireEvent.mouseMove(window, { clientX: 120, clientY: 80 });
    expect(screen.getByTestId('crosshair-h')).toHaveStyle({ top: '80px' });
    expect(screen.getByTestId('crosshair-v')).toHaveStyle({ left: '120px' });
    expect(screen.getByTestId('crosshair-h').className).toContain('pointer-events-none');
    fireEvent.mouseMove(window, { clientX: 300, clientY: 10 });
    expect(screen.getByTestId('crosshair-v')).toHaveStyle({ left: '300px' });
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
