import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { MenuBar } from './shell/MenuBar';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const MM_PER_PT = 25.4 / 72;

const drag = (svg: Element, x1: number, y1: number, x2: number, y2: number) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x1, clientY: y1 });
  });
  act(() => {
    fireEvent.mouseMove(svg, { clientX: x2, clientY: y2 });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x2, clientY: y2 });
  });
};

const renderViewer = async () => {
  await act(async () => {
    render(<PdfViewer />);
  });
  return screen.getByTestId('markup-overlay-svg');
};

describe('Show Grid y Snap to Grid en el visor (ADR-0106)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1, 2, 3]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {} });
    useUiStore.setState({
      hiddenLayers: [],
      snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false },
      showGrid: false,
      snapToGrid: false,
      gridSpacing: null,
    });
    useToolStore.setState({
      activeTool: 'select',
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('Show Grid dibuja las líneas sobre la hoja y al apagarlo desaparecen', async () => {
    await renderViewer();
    expect(screen.queryByTestId('grid-overlay')).toBeNull();
    act(() => useUiStore.getState().setShowGrid(true));
    const grid = screen.getByTestId('grid-overlay');
    // Hoja de 800×600 pt con líneas cada 20 mm (56.7 pt): 15 verticales y 11 horizontales
    expect(grid.querySelectorAll('line')).toHaveLength(15 + 11);
    act(() => useUiStore.getState().setShowGrid(false));
    expect(screen.queryByTestId('grid-overlay')).toBeNull();
  });

  it('la rejilla no intercepta el ratón: el visor sigue recibiendo los clics', async () => {
    await renderViewer();
    act(() => useUiStore.getState().setShowGrid(true));
    expect(screen.getByTestId('grid-overlay')).toHaveAttribute('pointer-events', 'none');
  });

  it('con Snap to Grid, un Radius arrastrado entre puntos sueltos queda en intersecciones de la rejilla', async () => {
    const svg = await renderViewer();
    act(() => useUiStore.getState().setSnapToGrid(true));
    act(() => useToolStore.setState({ activeTool: 'radius' }));
    drag(svg, 400, 300, 520, 300);
    const [r] = useMarkupStore.getState().markups;
    const step = 20 / MM_PER_PT;
    for (const p of r.points) {
      expect((p.x * 800) / step).toBeCloseTo(Math.round((p.x * 800) / step), 6);
      expect((p.y * 600) / step).toBeCloseTo(Math.round((p.y * 600) / step), 6);
    }
    // 400→7 pasos y 520→9 pasos: el radio mide dos pasos de 20 mm
    expect(r.measurement!.value).toBeCloseTo(40, 6);
  });

  it('sin Snap to Grid los puntos quedan donde se hizo clic', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'radius' }));
    drag(svg, 400, 300, 520, 300);
    const [r] = useMarkupStore.getState().markups;
    expect(r.measurement!.value).toBeCloseTo(120 * MM_PER_PT, 6);
  });

  it('un espaciado elegido (10 mm) cambia el paso y las medidas quedan en múltiplos de 10 mm', async () => {
    const svg = await renderViewer();
    act(() => {
      useUiStore.getState().setSnapToGrid(true);
      useUiStore.getState().setGridSpacing(10);
    });
    act(() => useToolStore.setState({ activeTool: 'radius' }));
    drag(svg, 400, 300, 520, 300);
    const [r] = useMarkupStore.getState().markups;
    expect(r.measurement!.value % 10).toBeCloseTo(0, 6);
    expect(r.measurement!.value).toBeGreaterThan(0);
  });

  it('las preferencias de la rejilla se recuerdan y vuelven al abrir la aplicación', () => {
    act(() => {
      useUiStore.getState().setShowGrid(true);
      useUiStore.getState().setSnapToGrid(true);
      useUiStore.getState().setGridSpacing(2.5);
    });
    expect(JSON.parse(localStorage.getItem('rea-grid')!)).toEqual({ show: true, snap: true, spacing: 2.5 });
    act(() => useUiStore.getState().setGridSpacing(0));
    expect(useUiStore.getState().gridSpacing).toBeNull();
  });

  it('View ▸ Show Grid y Snap to Grid alternan los ajustes y muestran la marca de activo', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    expect(screen.getByTestId('menu-view-grid')).toHaveTextContent('Shift+F9');
    fireEvent.click(screen.getByTestId('menu-view-grid'));
    expect(useUiStore.getState().showGrid).toBe(true);
    fireEvent.click(screen.getByTestId('menu-ver'));
    expect(screen.getByTestId('menu-view-snap-grid')).toHaveTextContent('Ctrl+Shift+F9');
    fireEvent.click(screen.getByTestId('menu-view-snap-grid'));
    expect(useUiStore.getState().snapToGrid).toBe(true);
    fireEvent.click(screen.getByTestId('menu-ver'));
    expect(screen.getByTestId('menu-view-grid').querySelector('.ring-1')).not.toBeNull();
  });
});
