import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useToolStore } from '../store/useToolStore';
import { useDocumentStore } from '../store/useDocumentStore';

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

describe('ZoomWindowAndRotation Integration (ADR-0086: Zoom a Ventana con tecla Z y Rotación de Vista 90°)', () => {
  beforeEach(() => {
    useToolStore.getState().setActiveTool('select');
    useDocumentStore.setState({
      pdfBytes: new Uint8Array([1, 2, 3]),
      currentPageIndex: 0,
      numPages: 2,
      scale: 1.0,
      rotation: 0,
    });
    vi.restoreAllMocks();
  });

  it('atajo Z activa la herramienta zoom y asigna el cursor cursor-zoom-in', async () => {
    render(<PdfViewer />);

    // Simular keydown 'z'
    fireEvent.keyDown(window, { key: 'z', code: 'KeyZ' });

    expect(useToolStore.getState().activeTool).toBe('zoom');

    // El SVG overlay debe tener la clase cursor-zoom-in
    const svgOverlay = screen.getByTestId('markup-overlay-svg');
    expect(svgOverlay.getAttribute('class')).toContain('cursor-zoom-in');
  });

  it('pulsar Escape con herramienta zoom revierte la herramienta a select', async () => {
    useToolStore.getState().setActiveTool('zoom');
    render(<PdfViewer />);

    expect(useToolStore.getState().activeTool).toBe('zoom');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(useToolStore.getState().activeTool).toBe('select');
  });

  it('arrastrar con herramienta zoom dibuja el zoom-marquee y calcula nuevo zoom en mouseUp', async () => {
    useToolStore.getState().setActiveTool('zoom');
    render(<PdfViewer />);

    const svgOverlay = screen.getByTestId('markup-overlay-svg');

    // MouseDown at (100, 100)
    fireEvent.mouseDown(svgOverlay, { clientX: 100, clientY: 100, button: 0 });

    // MouseMove to (300, 250) -> arrastre de 200x150 px
    fireEvent.mouseMove(svgOverlay, { clientX: 300, clientY: 250 });

    const marquee = screen.getByTestId('zoom-marquee');
    expect(marquee).toBeInTheDocument();
    expect(marquee.getAttribute('stroke-dasharray')).toBe('4 3');

    // MouseUp finaliza el encuadre y revierte herramienta a select
    fireEvent.mouseUp(svgOverlay, { clientX: 300, clientY: 250 });

    expect(useToolStore.getState().activeTool).toBe('select');
    expect(screen.queryByTestId('zoom-marquee')).not.toBeInTheDocument();
    // La escala debió aumentar (> 1.0)
    expect(useDocumentStore.getState().scale).toBeGreaterThan(1.0);
  });

  it('clic simple (< 5px) con herramienta zoom amplía 1.5x y revierte a select', async () => {
    useToolStore.getState().setActiveTool('zoom');
    useDocumentStore.setState({ scale: 1.0 });
    render(<PdfViewer />);

    const svgOverlay = screen.getByTestId('markup-overlay-svg');

    // Clic en el mismo punto (100, 100)
    fireEvent.mouseDown(svgOverlay, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseUp(svgOverlay, { clientX: 101, clientY: 101, button: 0 });

    expect(useToolStore.getState().activeTool).toBe('select');
    expect(useDocumentStore.getState().scale).toBe(1.5);
  });

  it('rotación de vista en store opera a 90°, 180°, 270° y reinicia a 0°', () => {
    const store = useDocumentStore.getState();
    expect(store.rotation).toBe(0);

    store.rotateClockwise();
    expect(useDocumentStore.getState().rotation).toBe(90);

    store.rotateClockwise();
    expect(useDocumentStore.getState().rotation).toBe(180);

    store.rotateClockwise();
    expect(useDocumentStore.getState().rotation).toBe(270);

    store.rotateClockwise();
    expect(useDocumentStore.getState().rotation).toBe(0);

    store.rotateCounterClockwise();
    expect(useDocumentStore.getState().rotation).toBe(270);

    store.resetRotation();
    expect(useDocumentStore.getState().rotation).toBe(0);
  });

  it('atajos de rotación de vista Ctrl+Shift++ y Ctrl+Shift+- rotan el visor', async () => {
    useDocumentStore.setState({ rotation: 0 });
    render(<PdfViewer />);

    // Ctrl+Shift++
    fireEvent.keyDown(window, { key: '+', code: 'Equal', ctrlKey: true, shiftKey: true });
    expect(useDocumentStore.getState().rotation).toBe(90);

    // Ctrl+Shift+-
    fireEvent.keyDown(window, { key: '-', code: 'Minus', ctrlKey: true, shiftKey: true });
    expect(useDocumentStore.getState().rotation).toBe(0);
  });
});
