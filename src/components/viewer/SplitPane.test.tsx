import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SplitPane } from './SplitPane';
import { useSplitStore } from '../../store/useSplitStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { scrollToCenter, viewCenterOnPage } from '../../core/compare/splitSync';
import { Markup } from '../../types/markup';

vi.mock('../../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
  loadPdfDocument: vi.fn().mockResolvedValue({ numPages: 5, destroy: vi.fn().mockResolvedValue(undefined) }),
}));

const rect = (id: string, pageIndex: number): Markup => ({
  id,
  type: 'rectangle',
  pageIndex,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
});

describe('Vista lado a lado (ADR-0049)', () => {
  beforeEach(() => {
    useSplitStore.getState().close();
    useDocumentStore.setState({ pdfDoc: { numPages: 3 } as never, numPages: 3, currentPageIndex: 0, scale: 1, rotation: 0 });
    useMarkupStore.setState({ markups: [rect('p1', 1), rect('p0', 0)], selectedMarkupIds: [] });
  });

  it('el centro de la vista se expresa sobre la página y el panel se desplaza para centrar ese punto', () => {
    // Página de 800×600 que empieza 100 px a la izquierda del contenedor de 400×300
    const c = viewCenterOnPage({ left: 0, top: 0, width: 400, height: 300 }, { left: -100, top: -50, width: 800, height: 600 })!;
    expect(c.nx).toBeCloseTo(0.375, 9);
    expect(c.ny).toBeCloseTo(200 / 600, 9);
    const s = scrollToCenter(c.nx, c.ny, { width: 800, height: 600 }, { x: 32, y: 32 }, { width: 400, height: 300 }, { width: 864, height: 664 });
    expect(s).toEqual({ left: 132, top: 82 });
    // Nunca fuera del rango desplazable
    expect(scrollToCenter(0, 0, { width: 800, height: 600 }, { x: 32, y: 32 }, { width: 400, height: 300 }, { width: 864, height: 664 })).toEqual({ left: 0, top: 0 });
  });

  it('muestra otra página del documento con sus marcas, navega entre páginas y se cierra', async () => {
    act(() => useSplitStore.getState().start({ name: 'This document', bytes: null, pageCount: 3, pageIndex: 1 }));
    await act(async () => {
      render(<SplitPane />);
    });
    expect(screen.getByTestId('split-source')).toHaveTextContent('This document');
    expect(screen.getByTestId('split-page')).toHaveTextContent('2 / 3');
    // Las marcas de REA de esa página, de solo lectura
    expect(screen.getByTestId('split-markups').querySelectorAll('g')).not.toHaveLength(0);
    fireEvent.click(screen.getByTestId('split-next'));
    expect(screen.getByTestId('split-page')).toHaveTextContent('3 / 3');
    expect(screen.getByTestId('split-next')).toBeDisabled();
    fireEvent.click(screen.getByTestId('split-sync'));
    expect(useSplitStore.getState().sync).toBe(false);
    fireEvent.click(screen.getByTestId('split-close'));
    expect(useSplitStore.getState().active).toBe(false);
  });

  it('con otro PDF y Sync, sigue la página del visor principal', async () => {
    act(() => useSplitStore.getState().start({ name: 'Rev B.pdf', bytes: new Uint8Array([1]), pageCount: 5, pageIndex: 0 }));
    await act(async () => {
      render(<SplitPane />);
    });
    act(() => useSplitStore.getState().setMainView({ pageIndex: 3, nx: 0.5, ny: 0.5 }));
    expect(screen.getByTestId('split-page')).toHaveTextContent('4 / 5');
    expect(screen.queryByTestId('split-markups')).toBeNull();
  });
});
