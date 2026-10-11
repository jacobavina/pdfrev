import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useSearchStore } from '../store/useSearchStore';

// Mock de renderPageToCanvas para entorno jsdom
vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    hasText: true,
  }),
}));

describe('PdfViewer - Resaltado Visual de Búsqueda (Paquete 5)', () => {
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
      pdfDoc: {} as any,
    });
    useSearchStore.getState().clearSearch();
  });

  it('renderiza rectángulos de coincidencia activa y no activa en el SVG', async () => {
    useSearchStore.setState({
      isOpen: true,
      query: 'Viga',
      matches: [
        {
          pageIndex: 0,
          matchIndex: 0,
          pageMatchIndex: 0,
          text: 'Viga',
          rects: [{ x: 0.1, y: 0.1, width: 0.1, height: 0.05 }],
        },
        {
          pageIndex: 0,
          matchIndex: 1,
          pageMatchIndex: 1,
          text: 'Viga',
          rects: [{ x: 0.3, y: 0.3, width: 0.1, height: 0.05 }],
        },
        {
          pageIndex: 1, // Otra página: no debe renderizarse en página 0
          matchIndex: 2,
          pageMatchIndex: 0,
          text: 'Viga',
          rects: [{ x: 0.5, y: 0.5, width: 0.1, height: 0.05 }],
        },
      ],
      activeMatchIndex: 0,
    });

    await act(async () => {
      render(<PdfViewer />);
    });

    const activeHighlights = screen.getAllByTestId('search-active-highlight');
    const matchHighlights = screen.getAllByTestId('search-match-highlight');

    expect(activeHighlights).toHaveLength(1);
    expect(matchHighlights).toHaveLength(1); // Solo la segunda de la página 0
  });

  it('actualiza reactivamente el resaltado activo al cambiar activeMatchIndex', async () => {
    useSearchStore.setState({
      isOpen: true,
      query: 'Viga',
      matches: [
        {
          pageIndex: 0,
          matchIndex: 0,
          pageMatchIndex: 0,
          text: 'Viga',
          rects: [{ x: 0.1, y: 0.1, width: 0.1, height: 0.05 }],
        },
        {
          pageIndex: 0,
          matchIndex: 1,
          pageMatchIndex: 1,
          text: 'Viga',
          rects: [{ x: 0.3, y: 0.3, width: 0.1, height: 0.05 }],
        },
      ],
      activeMatchIndex: 0,
    });

    await act(async () => {
      render(<PdfViewer />);
    });

    expect(screen.getAllByTestId('search-active-highlight')).toHaveLength(1);

    act(() => {
      useSearchStore.getState().setActiveMatchIndex(1);
    });

    const activeHighlights = screen.getAllByTestId('search-active-highlight');
    expect(activeHighlights).toHaveLength(1);
  });
});
