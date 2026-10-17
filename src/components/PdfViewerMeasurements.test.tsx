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

  it('el indicador de escala abre el panel Measure, donde se calibra (ADR-0031)', async () => {
    await act(async () => {
      render(<StatusBar />);
    });
    const before = useUiStore.getState().measurementsOpenRequest;
    await act(async () => {
      fireEvent.click(screen.getByTestId('calibration-indicator'));
    });
    expect(useUiStore.getState().measurementsOpenRequest).toBe(before + 1);
    // Ya no abre el diálogo antiguo sin puntos
    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(false);
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
    // El menú se carga al primer clic derecho (ADR-0045)
    expect(await screen.findByTestId('canvas-context-menu')).toHaveTextContent('Rectangle');

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

  it('cutout ortogonal / rectangular de 4 vértices con altura menor a 0.02 no se cierra en el 3er vértice y se completa con 4 puntos', async () => {
    const initialArea: Markup = {
      id: 'area-cutout-test',
      type: 'area',
      pageIndex: 0,
      points: [
        { x: 100 / 800, y: 100 / 600 },
        { x: 500 / 800, y: 100 / 600 },
        { x: 500 / 800, y: 500 / 600 },
        { x: 100 / 800, y: 500 / 600 },
      ],
      style: { strokeColor: '#0284c7', strokeWidth: 2, opacity: 1 },
      author: 'Tester',
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z',
      status: 'pending',
    };
    useMarkupStore.setState({ markups: [initialArea] });
    await act(async () => {
      render(<PdfViewer />);
    });

    // Iniciar cutout
    act(() => {
      useUiStore.getState().startCutout('area-cutout-test');
      useToolStore.getState().setActiveTool('area');
    });
    const svg = screen.getByTestId('markup-overlay-svg');

    // Clic en los 4 vértices de un recorte rectangular de 20 x 10 px sobre 800 x 600:
    // Altura = 10 / 600 = 0.01667 < 0.02 (con el cálculo anterior en normalizado disparaba el cierre en el 3er punto)
    for (const [x, y] of [
      [200, 200], // vértice 1
      [220, 200], // vértice 2
      [220, 210], // vértice 3
      [200, 210], // vértice 4 (no debe cerrar anticipadamente en triángulo)
    ]) {
      act(() => click(svg, x, y));
    }

    // El 4.° vértice está colocado, el recorte aún no se ha cerrado
    expect(useMarkupStore.getState().markups[0].cutouts).toBeUndefined();

    // 5.° clic sobre el primer vértice [200, 200] para cerrar la figura
    act(() => click(svg, 200, 200));

    const updatedArea = useMarkupStore.getState().markups[0];
    expect(updatedArea.cutouts).toHaveLength(1);
    expect(updatedArea.cutouts![0]).toHaveLength(4);
    expect(updatedArea.cutouts![0][0]).toEqual({ x: 200 / 800, y: 200 / 600 });
    expect(updatedArea.cutouts![0][1]).toEqual({ x: 220 / 800, y: 200 / 600 });
    expect(updatedArea.cutouts![0][2]).toEqual({ x: 220 / 800, y: 210 / 600 });
    expect(updatedArea.cutouts![0][3]).toEqual({ x: 200 / 800, y: 210 / 600 });
    expect(useUiStore.getState().activeCutoutTargetId).toBeNull();
  });

  it('cutout ortogonal / rectangular de 4 vértices se puede cerrar también con la tecla Enter', async () => {
    const initialArea: Markup = {
      id: 'area-cutout-enter',
      type: 'area',
      pageIndex: 0,
      points: [
        { x: 100 / 800, y: 100 / 600 },
        { x: 500 / 800, y: 100 / 600 },
        { x: 500 / 800, y: 500 / 600 },
        { x: 100 / 800, y: 500 / 600 },
      ],
      style: { strokeColor: '#0284c7', strokeWidth: 2, opacity: 1 },
      author: 'Tester',
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z',
      status: 'pending',
    };
    useMarkupStore.setState({ markups: [initialArea] });
    await act(async () => {
      render(<PdfViewer />);
    });

    act(() => {
      useUiStore.getState().startCutout('area-cutout-enter');
      useToolStore.getState().setActiveTool('area');
    });
    const svg = screen.getByTestId('markup-overlay-svg');

    for (const [x, y] of [
      [300, 300],
      [330, 300],
      [330, 315],
      [300, 315],
    ]) {
      act(() => click(svg, x, y));
    }

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    const updatedArea = useMarkupStore.getState().markups[0];
    expect(updatedArea.cutouts).toHaveLength(1);
    expect(updatedArea.cutouts![0]).toHaveLength(4);
    expect(useUiStore.getState().activeCutoutTargetId).toBeNull();
  });
});
