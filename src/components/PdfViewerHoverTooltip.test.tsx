import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    hasText: true,
  }),
}));

describe('PdfViewer - Nube de información al posar el mouse sobre una anotación (ADR-0136 / URGE)', () => {
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
      pdfDoc: {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 800, height: 600 }),
        }),
      } as never,
    });
    useToolStore.setState({
      activeTool: 'select',
    });
  });

  it('muestra la nube con autor y medición al pasar el cursor sobre una marca de área', async () => {
    const areaMarkup: Markup = {
      id: 'area-1',
      type: 'area',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.1 },
        { x: 0.4, y: 0.4 },
        { x: 0.1, y: 0.4 },
      ],
      style: { strokeColor: '#00aa00', fillColor: 'rgba(0, 170, 0, 0.2)', strokeWidth: 1, opacity: 1 },
      author: 'Reviewer',
      createdAt: '2026-10-26T10:00:00Z',
      updatedAt: '2026-10-26T10:00:00Z',
      status: 'pending',
      measurement: {
        value: 36530.47,
        unit: 'ft',
        formatted: '36,530.47 ft²',
      },
    };

    useMarkupStore.setState({ markups: [areaMarkup] });

    render(<PdfViewer />);

    const svg = screen.getByTestId('markup-overlay-svg');

    // Inicialmente no hay tooltip
    expect(screen.queryByTestId('markup-hover-tooltip')).toBeNull();

    // Mover el mouse sobre el centro de la marca (0.25 * 800 = 200, 0.25 * 600 = 150)
    fireEvent.mouseMove(svg, {
      clientX: 200,
      clientY: 150,
    });

    const tooltip = screen.getByTestId('markup-hover-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(screen.getByTestId('markup-hover-author')).toHaveTextContent('Reviewer');
    expect(screen.getByTestId('markup-hover-content')).toHaveTextContent('36,530.47 ft²');

    // Mover fuera de la marca (punto 0.9, 0.9 -> 720, 540)
    fireEvent.mouseMove(svg, {
      clientX: 720,
      clientY: 540,
    });

    expect(screen.queryByTestId('markup-hover-tooltip')).toBeNull();
  });

  it('oculta la nube de inmediato si el usuario hace clic o inicia interacción', () => {
    const rectMarkup: Markup = {
      id: 'rect-1',
      type: 'rectangle',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.3 },
      ],
      style: { strokeColor: '#0000ff', fillColor: '#ffffff', strokeWidth: 1, opacity: 1 },
      author: 'Jacob',
      createdAt: '2026-10-26T10:00:00Z',
      updatedAt: '2026-10-26T10:00:00Z',
      status: 'pending',
      subject: 'Sequence',
      text: '2',
    };

    useMarkupStore.setState({ markups: [rectMarkup] });

    render(<PdfViewer />);
    const svg = screen.getByTestId('markup-overlay-svg');

    // Mover sobre la marca (0.2 * 800 = 160, 0.2 * 600 = 120)
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 120 });
    expect(screen.getByTestId('markup-hover-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('markup-hover-content')).toHaveTextContent('Sequence: 2');

    // Clic con mouse down
    fireEvent.mouseDown(svg, { button: 0, clientX: 160, clientY: 120 });
    expect(screen.queryByTestId('markup-hover-tooltip')).toBeNull();
  });
});
