import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { ALL_TOOLS } from './shell/toolDefinitions';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const key = (k: string, opts: Partial<KeyboardEventInit> = {}) =>
  act(() => {
    fireEvent.keyDown(window, { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, ...opts });
  });

describe('Atajos de Revu y desplazamiento del plano (ADR-0052)', () => {
  beforeEach(async () => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never, pageHasText: [true] });
    useUiStore.setState({ hiddenLayers: [] });
    useToolStore.setState({ activeTool: 'select' });
    await act(async () => {
      render(<PdfViewer />);
    });
  });

  it('las letras y combinaciones de Revu activan su herramienta (y F, O y Shift+Alt+R siguen funcionando)', () => {
    const cases: [string, Partial<KeyboardEventInit>, string][] = [
      ['p', {}, 'freehand'],
      ['e', {}, 'circle'],
      ['u', {}, 'underline'],
      ['d', {}, 'strikeOut'],
      ['s', {}, 'stamp'],
      ['P', { shiftKey: true }, 'polygon'],
      ['N', { shiftKey: true }, 'polyLine'],
      ['V', { shiftKey: true }, 'pan'],
      ['U', { shiftKey: true, altKey: true }, 'radius'],
      ['f', {}, 'freehand'],
      ['o', {}, 'circle'],
      ['R', { shiftKey: true, altKey: true }, 'radius'],
    ];
    for (const [k, opts, tool] of cases) {
      key(k, opts);
      expect(useToolStore.getState().activeTool).toBe(tool);
    }
    // Los títulos de la cinta anuncian los de Revu
    const label = (t: string) => ALL_TOOLS.find((x) => x.type === t)!.label;
    expect(label('freehand')).toBe('Pen (P)');
    expect(label('polygon')).toBe('Polygon (Shift+P)');
    expect(label('polyLine')).toBe('Polyline (Shift+N)');
  });

  it('Espacio mantenido es Pan temporal y arrastrar con Pan desplaza el plano', () => {
    act(() => useToolStore.setState({ activeTool: 'line' }));
    act(() => {
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    });
    expect(useToolStore.getState().activeTool).toBe('pan');
    const svg = screen.getByTestId('markup-overlay-svg');
    const container = screen.getByTestId('pdf-viewer-container');
    container.scrollLeft = 200;
    container.scrollTop = 150;
    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 300, clientY: 300 });
    });
    expect(svg.getAttribute('class')).toContain('cursor-grabbing');
    act(() => {
      fireEvent.mouseMove(window, { clientX: 260, clientY: 280 });
    });
    act(() => {
      fireEvent.mouseUp(window, { clientX: 260, clientY: 280 });
    });
    expect(container.scrollLeft).toBe(240);
    expect(container.scrollTop).toBe(170);
    act(() => {
      fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    });
    expect(useToolStore.getState().activeTool).toBe('line');
    expect(useMarkupStore.getState().markups).toHaveLength(0);
  });
});
