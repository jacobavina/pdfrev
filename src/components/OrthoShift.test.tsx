import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { orthoConstrain, squareConstrain, ORTHO_TOOLS, SQUARE_TOOLS } from '../core/markup/ortho';

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
    expect(ORTHO_TOOLS.has('line')).toBe(true);
    expect(ORTHO_TOOLS.has('rectangle')).toBe(false);
  });

  it('también ajusta a 45° (diagonal) en unidades de página, y las cajas forman un cuadrado (ADR-0048)', () => {
    const dims = { width: 800, height: 600 };
    // 80 pt × 72 pt (≈ 42°) → diagonal a 45°: mismo desplazamiento en pt en ambos ejes
    const d = orthoConstrain({ x: 0, y: 0 }, { x: 0.1, y: 0.12 }, dims);
    expect(d.x * 800).toBeCloseTo(d.y * 600, 6);
    expect(d.x * 800).toBeCloseTo(76, 6);
    // Diagonal hacia arriba a la izquierda
    const up = orthoConstrain({ x: 0.5, y: 0.5 }, { x: 0.4, y: 0.37 }, dims);
    expect((0.5 - up.x) * 800).toBeCloseTo((0.5 - up.y) * 600, 6);
    // Cuadrado: el lado mayor manda y conserva el sentido del arrastre
    const sq = squareConstrain({ x: 0.5, y: 0.5 }, { x: 0.4, y: 0.6 }, dims);
    expect((0.5 - sq.x) * 800).toBeCloseTo(80, 6);
    expect((sq.y - 0.5) * 600).toBeCloseTo(80, 6);
    expect([...SQUARE_TOOLS]).toEqual(['rectangle', 'circle', 'cloud', 'cloudPlus']);
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

  it('con Shift el rectángulo arrastrado es un cuadrado; el cursor del plano es la cruz oscura con halo', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    expect(svg.getAttribute('class')).toContain('cursor-rea-select');
    act(() => useToolStore.setState({ activeTool: 'rectangle' }));
    expect(svg.getAttribute('class')).toContain('cursor-rea-draw');
    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 100, clientY: 100 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 300, clientY: 160, shiftKey: true });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 300, clientY: 160, shiftKey: true });
    });
    const [r] = useMarkupStore.getState().markups;
    const w = Math.abs(r.points[1].x - r.points[0].x) * 800;
    const h = Math.abs(r.points[1].y - r.points[0].y) * 600;
    expect(w).toBeCloseTo(h, 6);
    act(() => useToolStore.setState({ activeTool: 'pan' }));
    expect(svg.getAttribute('class')).toContain('cursor-grab');
  });
});
