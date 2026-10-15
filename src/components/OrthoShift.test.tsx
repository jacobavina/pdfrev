import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { orthoConstrain, ORTHO_TOOLS } from '../core/markup/ortho';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const click = (svg: Element, x: number, y: number, shiftKey = false) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y, shiftKey });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y, shiftKey });
  });
};

describe('Trazo recto con Shift (ADR-0047)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
    useToolStore.setState({ activeTool: 'select', currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 } });
  });

  it('lleva el punto a la horizontal o a la vertical del punto anterior, la más cercana al cursor', () => {
    const dims = { width: 800, height: 600 };
    expect(orthoConstrain({ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.15 }, dims)).toEqual({ x: 0.5, y: 0.1 });
    expect(orthoConstrain({ x: 0.1, y: 0.1 }, { x: 0.13, y: 0.6 }, dims)).toEqual({ x: 0.1, y: 0.6 });
    // Se compara en unidades de página: 0.1 de ancho (80 pt) gana a 0.12 de alto (72 pt)
    expect(orthoConstrain({ x: 0, y: 0 }, { x: 0.1, y: 0.12 }, dims)).toEqual({ x: 0.1, y: 0 });
    expect(ORTHO_TOOLS.has('line')).toBe(true);
    expect(ORTHO_TOOLS.has('rectangle')).toBe(false);
  });

  it('con Shift la línea queda horizontal y la polilínea sigue en vertical; sin Shift sigue al cursor', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => useToolStore.setState({ activeTool: 'line' }));
    click(svg, 100, 100);
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 400, clientY: 160, shiftKey: true });
    });
    click(svg, 400, 160, true);
    const line = useMarkupStore.getState().markups[0];
    expect(line.points[1].y).toBeCloseTo(line.points[0].y, 9);
    expect(line.points[1].x).toBeCloseTo(0.5, 6);

    act(() => useToolStore.setState({ activeTool: 'polyLine' }));
    click(svg, 100, 300);
    click(svg, 130, 500, true); // vertical
    click(svg, 400, 520, true); // horizontal
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    const poly = useMarkupStore.getState().markups[1];
    expect(poly.points[1].x).toBeCloseTo(poly.points[0].x, 9);
    expect(poly.points[2].y).toBeCloseTo(poly.points[1].y, 9);

    act(() => useToolStore.setState({ activeTool: 'line' }));
    click(svg, 100, 100);
    click(svg, 400, 160);
    const free = useMarkupStore.getState().markups[2];
    expect(free.points[1].y).not.toBeCloseTo(free.points[0].y, 3);
  });
});
