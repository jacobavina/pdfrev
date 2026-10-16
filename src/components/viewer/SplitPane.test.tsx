import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SplitPane } from './SplitPane';
import { useSplitStore } from '../../store/useSplitStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useOverlayStore } from '../../store/useOverlayStore';
import { mainToSplitCenter, scrollToCenter, splitToMainCenter, viewCenterOnPage } from '../../core/compare/splitSync';
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
    useOverlayStore.getState().close();
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

  it('sincronización en ambos sentidos: desplazar o cambiar de página en el panel derecho mueve al visor principal y respeta la alineación (ADR-0054)', async () => {
    act(() => useSplitStore.getState().start({ name: 'Rev B.pdf', bytes: new Uint8Array([1]), pageCount: 5, pageIndex: 0 }));
    // Alineación activa con desfase de +80 pt en X y -60 pt en Y sobre página de 800×600 pt
    useOverlayStore.setState({ offset: { x: 80, y: -60 } });
    await act(async () => {
      render(<SplitPane />);
    });
    // Cambiar de página desde el panel derecho con otro PDF y Sync actualiza currentPageIndex del visor principal
    fireEvent.click(screen.getByTestId('split-next'));
    expect(screen.getByTestId('split-page')).toHaveTextContent('2 / 5');
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
    expect(useSplitStore.getState().driver).toBe('split');

    // Desplazar el panel derecho publica splitView con la alineación aplicada hacia el visor principal
    const scrollEl = screen.getByTestId('split-scroll');
    const pageEl = scrollEl.firstElementChild as HTMLElement;
    vi.spyOn(scrollEl, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);
    vi.spyOn(pageEl, 'getBoundingClientRect').mockReturnValue({ left: -200, top: -150, width: 800, height: 600 } as DOMRect);
    Object.defineProperty(scrollEl, 'scrollLeft', { value: 200, configurable: true });
    Object.defineProperty(scrollEl, 'scrollTop', { value: 150, configurable: true });
    fireEvent.scroll(scrollEl);

    const sv = useSplitStore.getState().splitView!;
    expect(useSplitStore.getState().driver).toBe('split');
    // Centro en split = (0.5, 0.5) -> en main con offset (+80, -60) sobre 800×600 = (0.6, 0.4)
    expect(sv.nx).toBeCloseTo(0.6, 5);
    expect(sv.ny).toBeCloseTo(0.4, 5);
    // Y la inversa devuelve (0.5, 0.5)
    const inv = mainToSplitCenter(sv, { width: 800, height: 600 }, useOverlayStore.getState().matrix, useOverlayStore.getState().offset);
    expect(inv.nx).toBeCloseTo(0.5, 5);
    expect(inv.ny).toBeCloseTo(0.5, 5);
    expect(splitToMainCenter(inv, { width: 800, height: 600 }, useOverlayStore.getState().matrix, useOverlayStore.getState().offset).nx).toBeCloseTo(0.6, 5);
  });
});

