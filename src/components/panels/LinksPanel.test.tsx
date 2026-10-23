import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LinksPanel } from './LinksPanel';
import { LeftDock } from '../shell/LeftDock';
import { MenuBar } from '../shell/MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import type { Markup } from '../../types/markup';

const opened: string[] = [];
const toasts: string[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/linkService', async () => {
  const real = await vi.importActual<typeof import('../../services/linkService')>('../../services/linkService');
  return { ...real, openExternalUrl: vi.fn().mockImplementation(async (u: string) => void opened.push(u)) };
});

const link = (id: string, pageIndex: number, custom: Record<string, string | number>, extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'link', pageIndex, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.3 }], style: { strokeColor: '#00f', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending', customFields: custom, ...extra }) as Markup;

/** Documento de PDF.js simulado: la página 2 tiene un enlace a una dirección y otro a la página 1; la 3 uno que es marca de REA. */
const fakeDoc = {
  numPages: 3,
  getPage: async (n: number) => ({
    getViewport: () => ({ width: 100, height: 100, convertToViewportRectangle: (r: number[]) => r }),
    getAnnotations: async () =>
      n === 2
        ? [
            { subtype: 'Link', rect: [0, 40, 10, 50], url: 'https://pdf.example/a', id: 'x1' },
            { subtype: 'Link', rect: [0, 70, 10, 80], dest: [0], id: 'x2' },
            { subtype: 'Text', rect: [0, 0, 1, 1], id: 'nota' },
          ]
        : n === 3
        ? [{ subtype: 'Link', rect: [0, 10, 10, 20], url: 'https://dup.example', id: 'rea-1' }]
        : [],
  }),
  getDestination: async () => null,
  getPageIndex: async () => 0,
};

describe('Panel Links (ADR-0116)', () => {
  beforeEach(() => {
    opened.length = 0;
    toasts.length = 0;
    useDocumentStore.setState({ numPages: 3, currentPageIndex: 0, pdfBytes: new Uint8Array([1]), pdfDoc: fakeDoc as never });
    useMarkupStore.setState({
      markups: [
        link('rea-1', 2, { linkUri: 'https://dup.example' }),
        link('rea-2', 0, { linkPage: 2 }),
        link('rea-3', 0, { linkPage: 40 }),
        link('rea-4', 1, {}, { locked: true }),
      ],
      selectedMarkupIds: [],
    });
    useUiStore.setState({ leftOpen: true, leftTab: 'links' });
  });

  it('lista los enlaces de REA y los del PDF agrupados por página, sin repetir los de REA', async () => {
    render(<LinksPanel />);
    await waitFor(() => expect(screen.queryByText(/Reading the links/)).toBeNull());
    expect(screen.getByTestId('links-count')).toHaveTextContent('6');
    // Página 1: dos de REA; página 2: la marca bloqueada sin destino y los dos del PDF; página 3: el de REA (el del PDF con su id no se repite)
    expect(screen.getByTestId('links-page-0')).toHaveTextContent('Page 2');
    expect(screen.getByTestId('links-page-1')).toHaveTextContent('https://pdf.example/a');
    expect(screen.getByTestId('links-page-1')).toHaveTextContent('Page 1');
    expect(screen.getByTestId('links-page-2').querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByTestId('link-row-p:1:x1')).toHaveTextContent('PDF');
  });

  it('marca los enlaces rotos y el contador los cuenta; el filtro los separa', async () => {
    render(<LinksPanel />);
    await waitFor(() => expect(screen.queryByText(/Reading the links/)).toBeNull());
    // Rotos: la página 40 y la marca sin destino
    expect(screen.getByTestId('links-count')).toHaveTextContent('2 broken');
    fireEvent.change(screen.getByTestId('links-filter'), { target: { value: 'broken' } });
    expect(screen.getByTestId('links-count')).toHaveTextContent('2');
    expect(screen.queryByTestId('link-row-m:rea-2')).toBeNull();
    expect(screen.getByTestId('link-row-m:rea-3')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('links-filter'), { target: { value: 'url' } });
    expect(screen.getByTestId('links-count')).toHaveTextContent('2');
  });

  it('un clic en la fila va a la página del enlace y selecciona la marca', async () => {
    render(<LinksPanel />);
    await waitFor(() => expect(screen.queryByText(/Reading the links/)).toBeNull());
    fireEvent.click(screen.getByTestId('link-row-m:rea-1').querySelector('button')!);
    expect(useDocumentStore.getState().currentPageIndex).toBe(2);
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['rea-1']);
  });

  it('el botón de la fila sigue el enlace: abre la dirección o va a la página, y los rotos no lo tienen', async () => {
    render(<LinksPanel />);
    await waitFor(() => expect(screen.queryByText(/Reading the links/)).toBeNull());
    fireEvent.click(screen.getByTestId('link-follow-p:1:x1'));
    await waitFor(() => expect(opened).toEqual(['https://pdf.example/a']));
    fireEvent.click(screen.getByTestId('link-follow-m:rea-2'));
    await waitFor(() => expect(useDocumentStore.getState().currentPageIndex).toBe(1));
    expect(screen.queryByTestId('link-follow-m:rea-3')).toBeNull();
  });

  it('borrar un enlace de REA lo quita de las marcas y se puede deshacer; los del PDF y los bloqueados no se borran', async () => {
    render(<LinksPanel />);
    await waitFor(() => expect(screen.queryByText(/Reading the links/)).toBeNull());
    expect(screen.queryByTestId('link-delete-p:1:x1')).toBeNull();
    expect(screen.queryByTestId('link-delete-m:rea-4')).toBeNull();
    fireEvent.click(screen.getByTestId('link-delete-m:rea-2'));
    expect(useMarkupStore.getState().markups.map((m) => m.id)).not.toContain('rea-2');
    expect(screen.queryByTestId('link-row-m:rea-2')).toBeNull();
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toContain('rea-2');
  });

  it('un documento sin enlaces lo explica', async () => {
    useMarkupStore.setState({ markups: [] });
    useDocumentStore.setState({ pdfDoc: { numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 1, height: 1, convertToViewportRectangle: (r: number[]) => r }), getAnnotations: async () => [] }) } as never, numPages: 1 });
    render(<LinksPanel />);
    await waitFor(() => expect(screen.getByTestId('links-empty')).toHaveTextContent('has no links'));
  });

  it('View ▸ Panels ▸ Links Panel abre el panel en el dock y el riel tiene su pestaña', () => {
    useUiStore.setState({ leftOpen: false, leftTab: 'pages' });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
    fireEvent.click(screen.getByTestId('menu-panel-links'));
    expect(useUiStore.getState()).toMatchObject({ leftTab: 'links', leftOpen: true });
    render(<LeftDock />);
    expect(screen.getByTestId('left-tab-links')).toBeInTheDocument();
  });
});
