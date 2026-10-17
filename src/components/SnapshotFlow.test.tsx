import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import { useDocumentStore } from '../store/useDocumentStore';
import {
  clearSnapshotCache,
  getSnapshotCache,
  hasSnapshotInCache,
  setSnapshotCache,
} from '../services/snapshotService';
import * as toastService from '../services/toastService';

vi.mock('../services/pdfService', () => ({
  loadPdfDocument: vi.fn().mockResolvedValue({
    numPages: 2,
    getPage: vi.fn().mockResolvedValue({
      getViewport: () => ({ width: 800, height: 600 }),
      render: () => ({ promise: Promise.resolve() }),
      getTextContent: () => Promise.resolve({ items: [] }),
    }),
  }),
  renderPageToCanvas: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    hasText: false,
    textItems: [],
  }),
}));

describe('SnapshotFlow Integration (ADR-0085: Herramienta Instantánea, Tecla G y Pegado)', () => {
  beforeEach(() => {
    clearSnapshotCache();
    useMarkupStore.getState().setMarkups([]);
    useMarkupStore.getState().setSelectedMarkupIds([]);
    useMarkupStore.getState().setClipboardMarkups([]);
    useToolStore.getState().setActiveTool('select');
    useDocumentStore.setState({
      pdfBytes: new Uint8Array([1, 2, 3]),
      currentPageIndex: 0,
      numPages: 2,
      rotation: 0,
    });
    vi.restoreAllMocks();

    let canvas = document.getElementById('pdf-render-canvas') as HTMLCanvasElement;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'pdf-render-canvas';
      canvas.width = 800;
      canvas.height = 600;
      document.body.appendChild(canvas);
    }
  });

  afterEach(() => {
    const canvas = document.getElementById('pdf-render-canvas');
    if (canvas) {
      canvas.remove();
    }
  });

  it('atajo G activa la herramienta snapshot y asigna el cursor crosshair', async () => {
    render(<PdfViewer />);

    // Simular keydown 'g'
    fireEvent.keyDown(window, { key: 'g', code: 'KeyG' });

    expect(useToolStore.getState().activeTool).toBe('snapshot');

    // El SVG overlay debe tener la clase cursor-crosshair
    const svgOverlay = screen.getByTestId('markup-overlay-svg');
    expect(svgOverlay.getAttribute('class')).toContain('cursor-crosshair');
  });

  it('pulsar Escape con herramienta snapshot revierte la herramienta a select', async () => {
    useToolStore.getState().setActiveTool('snapshot');
    render(<PdfViewer />);

    expect(useToolStore.getState().activeTool).toBe('snapshot');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(useToolStore.getState().activeTool).toBe('select');
  });

  it('arrastrar con herramienta snapshot dibuja el marquee rectangular', async () => {
    useToolStore.getState().setActiveTool('snapshot');
    render(<PdfViewer />);

    const svgOverlay = screen.getByTestId('markup-overlay-svg');

    // MouseDown at (100, 100)
    fireEvent.mouseDown(svgOverlay, { clientX: 100, clientY: 100, button: 0 });

    // MouseMove to (300, 250)
    fireEvent.mouseMove(svgOverlay, { clientX: 300, clientY: 250 });

    const marquee = screen.getByTestId('snapshot-marquee');
    expect(marquee).toBeInTheDocument();
    expect(marquee.getAttribute('stroke-dasharray')).toBe('4 3');
  });

  it('mouseUp captura la instantánea, muestra notificación y destello, y revierte a select', async () => {
    const toastSpy = vi.spyOn(toastService, 'showToast');
    useToolStore.getState().setActiveTool('snapshot');
    render(<PdfViewer />);

    const svgOverlay = screen.getByTestId('markup-overlay-svg');

    fireEvent.mouseDown(svgOverlay, { clientX: 50, clientY: 50, button: 0 });
    fireEvent.mouseMove(svgOverlay, { clientX: 250, clientY: 200 });

    // Simular mouseUp
    await act(async () => {
      fireEvent.mouseUp(svgOverlay, { clientX: 250, clientY: 200, button: 0 });
    });

    // Debe mostrar notificación toast
    expect(toastSpy).toHaveBeenCalledWith('Snapshot copied to clipboard. Press Ctrl+V to paste.');

    // Debe quedar guardado en caché de snapshot
    expect(hasSnapshotInCache()).toBe(true);
    const cache = getSnapshotCache();
    expect(cache).not.toBeNull();
    expect(cache?.dataUrl).toContain('data:image/png');

    // El portapapeles vectorial se limpia para que prime la instantánea
    expect(useMarkupStore.getState().clipboardMarkups).toHaveLength(0);

    // Debe revertir la herramienta activa a 'select' (flujo Revu 21)
    expect(useToolStore.getState().activeTool).toBe('select');
  });

  it('Ctrl+V con snapshot en caché pega la imagen como marca interactiva con undo/redo', async () => {
    setSnapshotCache({
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      width: 400,
      height: 300,
      normWidth: 0.3,
      normHeight: 0.2,
      sourcePageIndex: 0,
    });

    render(<PdfViewer />);

    // Pulsar Ctrl+V
    await act(async () => {
      fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    });

    const markups = useMarkupStore.getState().markups;
    expect(markups).toHaveLength(1);
    expect(markups[0].type).toBe('image');
    expect(markups[0].customFields?.imageSrc).toContain('data:image/png');

    // La marca recién pegada queda seleccionada
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual([markups[0].id]);

    // Deshacer con Ctrl+Z elimina la marca pegada
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(useMarkupStore.getState().markups).toHaveLength(0);

    // Rehacer con Ctrl+Y restaura la marca pegada
    await act(async () => {
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    });
    expect(useMarkupStore.getState().markups).toHaveLength(1);
    expect(useMarkupStore.getState().markups[0].type).toBe('image');
  });
});
