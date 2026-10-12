import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer, dedupeConsecutivePoints } from './PdfViewer';
import { StatusBar } from './shell/StatusBar';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { Markup } from '../types/markup';

// Mock de renderPageToCanvas para entorno jsdom
vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    hasText: true,
  }),
}));

const MM_PER_PT = 25.4 / 72;

/** En jsdom getBoundingClientRect devuelve 0: clientX/clientY son píxeles de página a escala 1 (800x600). */
const click = (svg: Element, x: number, y: number) => {
  fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
};

const rect = (id: string, layer?: string): Markup => ({
  id,
  type: 'rectangle',
  pageIndex: 0,
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.5 },
  ],
  style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
  author: 'Tester',
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  status: 'pending',
  layer,
});

describe('PdfViewer + barra de estado - Calibración e indicador de escala', () => {
  beforeEach(() => {
    useMarkupStore.setState({
      markups: [],
      selectedMarkupIds: [],
    });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useCalibrationStore.setState({
      calibrations: {},
    });
    useToolStore.setState({
      activeTool: 'select',
    });
    useUiStore.setState({ hiddenLayers: [] });
  });

  it('muestra en la barra de estado que la página no está calibrada (escala de papel en mm)', async () => {
    await act(async () => {
      render(<StatusBar />);
    });

    const indicator = screen.getByTestId('calibration-indicator');
    expect(indicator).toHaveTextContent('Scale not set (paper scale, mm)');
  });

  it('abre el modal de calibración del visor al pulsar el indicador de la barra de estado', async () => {
    await act(async () => {
      render(
        <>
          <PdfViewer />
          <StatusBar />
        </>
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('calibration-indicator'));
    });

    expect(screen.getByTestId('calibration-modal')).toBeInTheDocument();
  });

  it('actualiza reactivamente el texto del indicador cuando la página se calibra', async () => {
    await act(async () => {
      render(<StatusBar />);
    });

    const indicator = screen.getByTestId('calibration-indicator');
    expect(indicator).toHaveTextContent('Scale not set');

    // Calibrar página 0: 1 metro = 50 puntos (scale = 1/50 = 0.02)
    act(() => {
      useCalibrationStore.getState().setPageCalibration(0, {
        scale: 0.02,
        unit: 'm',
        precision: 2,
      });
    });

    expect(indicator).toHaveTextContent('Scale: 1 m = 50.0 pt');
  });
});

describe('PdfViewer - Área por polígono, capas ocultas y menú contextual (ADR-0017)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useCalibrationStore.setState({ calibrations: {} });
    useToolStore.setState({ activeTool: 'select' });
    useUiStore.setState({ hiddenLayers: [] });
  });

  it('el área se traza por vértices, se cierra con Enter y mide superficie y perímetro del polígono', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    act(() => useToolStore.setState({ activeTool: 'area' }));
    const svg = screen.getByTestId('markup-overlay-svg');

    // Cuadrilátero de 320 x 240 pt (0.1..0.5 en normalizado sobre 800 x 600).
    // Un act() por clic: como en el navegador, cada vértice se renderiza antes del siguiente clic.
    for (const [x, y] of [
      [80, 60],
      [400, 60],
      [400, 300],
      [80, 300],
    ]) {
      act(() => click(svg, x, y));
    }
    expect(useMarkupStore.getState().markups).toHaveLength(0); // aún sin cerrar
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    const [area] = useMarkupStore.getState().markups;
    expect(area.type).toBe('area');
    expect(area.points).toHaveLength(4);
    expect(area.measurement!.unit).toBe('mm');
    expect(area.measurement!.value).toBeCloseTo(320 * 240 * MM_PER_PT * MM_PER_PT, 6);
    expect(area.measurement!.perimeter).toBeCloseTo(2 * (320 + 240) * MM_PER_PT, 6);
    expect(area.style.fillColor).toMatch(/^rgba\(/); // relleno translúcido visible
  });

  it('un área con menos de 3 vértices no crea marca', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    act(() => useToolStore.setState({ activeTool: 'area' }));
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => click(svg, 80, 60));
    act(() => click(svg, 400, 60));
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    expect(useMarkupStore.getState().markups).toHaveLength(0);
  });

  it('dedupeConsecutivePoints elimina los vértices repetidos de un doble clic', () => {
    expect(
      dedupeConsecutivePoints([
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
      ])
    ).toHaveLength(3);
  });

  it('las marcas de una capa oculta no se dibujan', async () => {
    useMarkupStore.setState({ markups: [rect('visible', 'Arquitectura'), rect('oculta', 'Estructura')] });
    await act(async () => {
      render(<PdfViewer />);
    });
    expect(document.querySelector('[data-testid="markup-g-oculta"]')).not.toBeNull();

    act(() => useUiStore.getState().toggleLayerVisibility('Estructura'));
    expect(document.querySelector('[data-testid="markup-g-oculta"]')).toBeNull();
    expect(document.querySelector('[data-testid="markup-g-visible"]')).not.toBeNull();
  });

  it('clic derecho sobre una marca la selecciona y su menú cambia el estado (deshacible)', async () => {
    useMarkupStore.setState({ markups: [rect('m-ctx')] });
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');

    // Sobre el borde izquierdo del rectángulo (x = 0.1 → 80 px)
    act(() => {
      fireEvent.contextMenu(svg, { clientX: 80, clientY: 180 });
    });
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['m-ctx']);
    expect(screen.getByTestId('canvas-context-menu')).toHaveTextContent('Rectangle');

    act(() => {
      fireEvent.click(screen.getByTestId('canvas-menu-status-accepted'));
    });
    expect(useMarkupStore.getState().markups[0].status).toBe('accepted');
    expect(screen.queryByTestId('canvas-context-menu')).toBeNull();

    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].status).toBe('pending');
  });

  it('clic derecho en una zona vacía no abre el menú', async () => {
    useMarkupStore.setState({ markups: [rect('m-ctx')] });
    await act(async () => {
      render(<PdfViewer />);
    });
    act(() => {
      fireEvent.contextMenu(screen.getByTestId('markup-overlay-svg'), { clientX: 700, clientY: 550 });
    });
    expect(screen.queryByTestId('canvas-context-menu')).toBeNull();
  });
});
