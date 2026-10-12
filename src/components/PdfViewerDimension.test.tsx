import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

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
};

describe('Cota, puntos de control y zoom con doble clic (ADR-0020/0021)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      numPages: 1,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useUiStore.setState({ hiddenLayers: [] });
    useToolStore.setState({
      activeTool: 'select',
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('Shift+L activa la cota; al trazarla queda con 3 puntos, flechas y la longitud como texto editable', async () => {
    await renderViewer();
    act(() => {
      fireEvent.keyDown(window, { key: 'L', shiftKey: true });
    });
    expect(useToolStore.getState().activeTool).toBe('dimension');
    drag(screen.getByTestId('markup-overlay-svg'), 100, 300, 500, 300);

    const [m] = useMarkupStore.getState().markups;
    expect(m.type).toBe('dimension');
    expect(m.points).toHaveLength(3);
    // Trazada hacia la derecha: línea de cota 15 pt por encima
    expect(m.points[2].y).toBeCloseTo(285 / 600, 6);
    expect(m.text).toBe('141.1 mm');
    expect(m.style.lineEndingStart).toBe('closedArrow');
    expect(m.style.lineEndingEnd).toBe('closedArrow');
    expect(screen.getByTestId(`markup-dimension-${m.id}`)).toBeInTheDocument();
  });

  it('arrastrar un punto de control cambia la forma de la nube en un paso deshacible', async () => {
    const cloud: Markup = {
      id: 'nube-cp',
      type: 'cloud',
      pageIndex: 0,
      points: [
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.5 },
      ],
      style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
      author: 'Revisor',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
    };
    useMarkupStore.setState({ markups: [cloud], selectedMarkupIds: ['nube-cp'] });
    await renderViewer();

    expect(screen.getAllByTestId(/^control-point-/)).toHaveLength(4);
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => {
      fireEvent.mouseDown(screen.getByTestId('control-point-2'), { button: 0, clientX: 400, clientY: 300 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 640, clientY: 480 });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 640, clientY: 480 });
    });

    const reshaped = useMarkupStore.getState().markups[0];
    expect(reshaped.points).toEqual([
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.25 },
      { x: 0.8, y: 0.8 },
      { x: 0.25, y: 0.5 },
    ]);
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].points).toEqual(cloud.points);
  });

  it('doble clic en el plano vacío muestra el control de zoom: + acerca, Esc lo cierra', async () => {
    await renderViewer();
    act(() => {
      fireEvent.doubleClick(screen.getByTestId('markup-overlay-svg'), { clientX: 700, clientY: 50 });
    });
    expect(screen.getByTestId('zoom-widget')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByTestId('zoom-widget-in'));
    });
    expect(useDocumentStore.getState().scale).toBe(1.25);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('zoom-widget')).toBeNull();
  });

  it('atajos de medición de Revu: Shift+Alt+Q polilongitud, Shift+Alt+A área, Shift+Alt+L longitud', async () => {
    await renderViewer();
    for (const [code, tool] of [
      ['KeyQ', 'polylineMeasure'],
      ['KeyA', 'area'],
      ['KeyL', 'length'],
      ['KeyC', 'count'],
    ] as const) {
      act(() => {
        fireEvent.keyDown(window, { key: code.slice(3), code, shiftKey: true, altKey: true });
      });
      expect(useToolStore.getState().activeTool).toBe(tool);
    }
  });

  it('con el control de zoom abierto, la rueda acerca y aleja sin Ctrl (ADR-0023)', async () => {
    await renderViewer();
    const container = screen.getByTestId('pdf-viewer-container');
    // Sin control abierto, la rueda sin Ctrl no cambia el zoom (es scroll)
    act(() => {
      fireEvent.wheel(container, { deltaY: -100, clientX: 700, clientY: 50 });
    });
    expect(useDocumentStore.getState().scale).toBe(1);
    act(() => {
      fireEvent.doubleClick(screen.getByTestId('markup-overlay-svg'), { clientX: 700, clientY: 50 });
    });
    act(() => {
      fireEvent.wheel(container, { deltaY: -100, clientX: 700, clientY: 50 });
    });
    expect(useDocumentStore.getState().scale).toBe(1.15);
    act(() => {
      fireEvent.wheel(screen.getByTestId('zoom-widget'), { deltaY: 100, clientX: 700, clientY: 50 });
    });
    expect(useDocumentStore.getState().scale).toBe(1);
  });

  it('atajos de vista de Revu: Ctrl+9 ajustar, Ctrl+8 tamaño real, Ctrl+4/5 modo de vista, Ctrl+3 modo oscuro', async () => {
    await renderViewer();
    const fitSeq = useUiStore.getState().fitRequest?.seq ?? 0;
    act(() => {
      fireEvent.keyDown(window, { key: '9', code: 'Digit9', ctrlKey: true });
    });
    expect(useUiStore.getState().fitRequest).toEqual({ kind: 'page', seq: fitSeq + 1 });
    act(() => {
      fireEvent.keyDown(window, { key: '0', code: 'Digit0', ctrlKey: true });
    });
    expect(useUiStore.getState().fitRequest?.kind).toBe('width');
    act(() => useDocumentStore.setState({ scale: 2 }));
    act(() => {
      fireEvent.keyDown(window, { key: '8', code: 'Digit8', ctrlKey: true });
    });
    expect(useDocumentStore.getState().scale).toBe(1);
    act(() => {
      fireEvent.keyDown(window, { key: '4', code: 'Digit4', ctrlKey: true });
    });
    expect(useUiStore.getState().viewMode).toBe('single');
    act(() => {
      fireEvent.keyDown(window, { key: '5', code: 'Digit5', ctrlKey: true });
    });
    expect(useUiStore.getState().viewMode).toBe('continuous');
    const before = useUiStore.getState().theme;
    act(() => {
      fireEvent.keyDown(window, { key: '3', code: 'Digit3', ctrlKey: true });
    });
    expect(useUiStore.getState().theme).not.toBe(before);
  });

  it('snap: la longitud nueva arranca exactamente en el extremo de una línea cercana, con su etiqueta (ADR-0025)', async () => {
    const line: Markup = {
      id: 'l-snap',
      type: 'line',
      pageIndex: 0,
      points: [
        { x: 0.25, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ],
      style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
      author: 'Reviewer',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
    };
    useMarkupStore.setState({ markups: [line], selectedMarkupIds: [] });
    useUiStore.setState({ snap: { endpoint: true, midpoint: true, nearest: false }, showMeasureLabels: true });
    useToolStore.setState({ measureLabel: 'Wall' });
    await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'length' }));
    const svg = screen.getByTestId('markup-overlay-svg');
    // 4 px a la derecha y 3 px abajo del extremo (200, 300): se ajusta al extremo
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 404, clientY: 303 });
    });
    expect(screen.getByTestId('snap-indicator-endpoint')).toBeInTheDocument();
    drag(svg, 404, 303, 600, 450);
    const m = useMarkupStore.getState().markups.find((x) => x.type === 'length')!;
    expect(m.points[0]).toEqual({ x: 0.5, y: 0.5 });
    expect(m.customFields?.measureLabel).toBe('Wall');
    expect(screen.getByTestId(`markup-length-${m.id}`)).toHaveTextContent(/^Wall: /);
    // "Show Result Information" desactivado: el valor deja de dibujarse
    act(() => useUiStore.setState({ showMeasureLabels: false }));
    expect(screen.getByTestId(`markup-length-${m.id}`).querySelector('text')).toBeNull();
    act(() => useToolStore.setState({ measureLabel: '' }));
  });

  it('Stamp: un clic coloca el sello elegido con autor y fecha, centrado en el punto (ADR-0026)', async () => {
    useToolStore.setState({ activeStampId: 'for-construction', author: 'Ana' });
    await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'stamp' }));
    const svg = screen.getByTestId('markup-overlay-svg');
    drag(svg, 400, 300, 400, 300);
    const m = useMarkupStore.getState().markups[0];
    expect(m.type).toBe('stamp');
    expect(m.text).toBe('FOR CONSTRUCTION');
    expect(m.style.strokeColor).toBe('#15803d');
    expect(String(m.customFields?.stampSubtitle)).toMatch(/^Ana · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const cx = (m.points[0].x + m.points[1].x) / 2;
    const cy = (m.points[0].y + m.points[1].y) / 2;
    expect(cx).toBeCloseTo(0.5, 6);
    expect(cy).toBeCloseTo(0.5, 6);
    expect(screen.getByTestId(`markup-stamp-${m.id}`)).toHaveTextContent('FOR CONSTRUCTION');
    act(() => useToolStore.setState({ author: 'Reviewer' }));
  });
});
