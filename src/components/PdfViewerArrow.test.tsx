import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { dashArrayFor } from '../core/markup/lineStyles';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

/** Arrastre de (x1,y1) a (x2,y2) en píxeles de página a escala 1 (jsdom: getBoundingClientRect = 0). */
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

describe('Herramienta Flecha y estilo de línea al dibujar (ADR-0018)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useUiStore.setState({ hiddenLayers: [] });
    useToolStore.setState({
      activeTool: 'select',
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 2, opacity: 1 },
    });
  });

  it('la flecha crea una línea con punta cerrada al final', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    act(() => useToolStore.setState({ activeTool: 'arrow' }));
    drag(screen.getByTestId('markup-overlay-svg'), 100, 100, 400, 300);

    const [m] = useMarkupStore.getState().markups;
    expect(m.type).toBe('line');
    expect(m.style.lineEndingEnd).toBe('closedArrow');
    expect(m.points).toHaveLength(2);
  });

  it('la flecha respeta el extremo y el tipo de línea elegidos en la cinta', async () => {
    useToolStore.setState({
      currentStyle: {
        strokeColor: '#0284c7',
        fillColor: 'transparent',
        strokeWidth: 3,
        opacity: 1,
        lineEndingStart: 'circle',
        lineEndingEnd: 'openArrow',
        dashArray: dashArrayFor('dashDot', 3),
      },
    });
    await act(async () => {
      render(<PdfViewer />);
    });
    act(() => useToolStore.setState({ activeTool: 'arrow' }));
    drag(screen.getByTestId('markup-overlay-svg'), 100, 100, 400, 300);

    const [m] = useMarkupStore.getState().markups;
    expect(m.style.lineEndingStart).toBe('circle');
    expect(m.style.lineEndingEnd).toBe('openArrow');
    expect(m.style.dashArray).toEqual([18, 7.5, 3, 7.5]);
  });

  it('los atajos de una letra seleccionan herramientas (A flecha, R rectángulo, L línea, V seleccionar)', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    for (const [key, tool] of [
      ['a', 'arrow'],
      ['r', 'rectangle'],
      ['l', 'line'],
      ['c', 'cloud'],
      ['v', 'select'],
    ] as const) {
      act(() => {
        fireEvent.keyDown(window, { key });
      });
      expect(useToolStore.getState().activeTool).toBe(tool);
    }
  });

  it('los atajos no se disparan con Ctrl (Ctrl+C sigue siendo copiar)', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    });
    expect(useToolStore.getState().activeTool).toBe('select');
  });
});
