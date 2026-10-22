import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { MenuBar } from './shell/MenuBar';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import type { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));
const toasts: string[] = [];
vi.mock('../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));

const mk = (id: string, over: Partial<Markup> = {}): Markup =>
  ({
    id,
    type: 'rectangle',
    pageIndex: 0,
    points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
    style: { strokeColor: '#000000', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    author: 'Reviewer',
    createdAt: '',
    updatedAt: '',
    status: 'pending',
    ...over,
  }) as Markup;

const key = (init: KeyboardEventInit & { key: string }) =>
  act(() => {
    fireEvent.keyDown(window, init);
  });

const renderViewer = async () => {
  await act(async () => {
    render(<PdfViewer />);
  });
};

describe('Paste in Place, Format Painter y Hide (ADR-0109)', () => {
  beforeEach(() => {
    toasts.length = 0;
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [], clipboardMarkups: [], formatClipboard: null });
    useMarkupStore.getState().clearHistory();
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 2, pdfBytes: new Uint8Array([1, 2, 3]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {} });
    useToolStore.setState({ activeTool: 'select' });
    useUiStore.setState({ hiddenLayers: [] });
  });

  it('Ctrl+Shift+V pega las marcas copiadas en el mismo sitio, incluso pegadas al borde de la hoja', async () => {
    const edge = mk('a', { points: [{ x: 0, y: 0.005 }, { x: 1, y: 0.2 }] });
    useMarkupStore.setState({ markups: [edge], selectedMarkupIds: ['a'] });
    await renderViewer();
    key({ key: 'c', ctrlKey: true });
    key({ key: 'V', ctrlKey: true, shiftKey: true });
    // El import dinámico de la acción termina en la siguiente vuelta
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const [orig, copy] = useMarkupStore.getState().markups;
    expect(useMarkupStore.getState().markups).toHaveLength(2);
    expect(copy.id).not.toBe(orig.id);
    expect(copy.points).toEqual(orig.points);
    expect(copy.pageIndex).toBe(0);
  });

  it('Paste in Place va a la página en que se está, con las mismas coordenadas, y se deshace', () => {
    useMarkupStore.setState({ markups: [mk('a')], selectedMarkupIds: ['a'] });
    useMarkupStore.getState().copySelectedMarkups();
    useDocumentStore.setState({ currentPageIndex: 1 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    fireEvent.click(screen.getByTestId('menu-paste-in-place'));
    const copy = useMarkupStore.getState().markups.find((m) => m.id !== 'a')!;
    expect(copy.pageIndex).toBe(1);
    expect(copy.points).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }]);
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups).toHaveLength(1);
  });

  it('Paste in Place está desactivado sin nada copiado', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    expect(screen.getByTestId('menu-paste-in-place')).toBeDisabled();
  });

  it('Format Painter: copia el formato de una marca, lo pega en otras y un Undo las deja como estaban', () => {
    const src = mk('src', { style: { strokeColor: '#e02424', fillColor: '#ffeb3b', strokeWidth: 5, opacity: 0.6 } });
    const t1 = mk('t1', { type: 'polygon', points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.6, y: 0.6 }] });
    const t2 = mk('t2', { type: 'stamp' });
    useMarkupStore.setState({ markups: [src, t1, t2], selectedMarkupIds: ['src'] });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    fireEvent.click(screen.getByTestId('menu-copy-format'));
    expect(toasts.at(-1)).toMatch(/Format copied/);
    act(() => useMarkupStore.setState({ selectedMarkupIds: ['t1', 't2'] }));
    fireEvent.click(screen.getByTestId('menu-editar'));
    fireEvent.click(screen.getByTestId('menu-paste-format'));
    const [, p1, p2] = useMarkupStore.getState().markups;
    expect(p1.style).toMatchObject({ strokeColor: '#e02424', fillColor: '#ffeb3b', strokeWidth: 5, opacity: 0.6 });
    expect(p2.style.strokeColor).toBe('#000000'); // el sello no se pinta
    expect(toasts.at(-1)).toBe('Format applied to 1 markup.');
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[1].style.strokeColor).toBe('#000000');
  });

  it('Ctrl+Shift+C y Ctrl+Alt+V copian y pegan el formato desde el teclado', async () => {
    useMarkupStore.setState({
      markups: [mk('src', { style: { strokeColor: '#00ff00', strokeWidth: 3, opacity: 1 } }), mk('t')],
      selectedMarkupIds: ['src'],
    });
    await renderViewer();
    key({ key: 'C', ctrlKey: true, shiftKey: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(useMarkupStore.getState().formatClipboard?.style.strokeColor).toBe('#00ff00');
    act(() => useMarkupStore.setState({ selectedMarkupIds: ['t'] }));
    key({ key: 'v', code: 'KeyV', ctrlKey: true, altKey: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(useMarkupStore.getState().markups.find((m) => m.id === 't')!.style.strokeColor).toBe('#00ff00');
  });

  it('Pegar formato sin haber copiado ninguno, o Copiar formato sin selección, lo explica', () => {
    render(<MenuBar />);
    useMarkupStore.setState({ markups: [mk('a')], selectedMarkupIds: [] });
    expect(useMarkupStore.getState().copyFormatOfSelection()).toBe(false);
    expect(useMarkupStore.getState().pasteFormatToSelection()).toBe(0);
  });

  it('Hide oculta la marca del plano sin borrarla, la deselecciona y Show Hidden Markups la devuelve', async () => {
    useMarkupStore.setState({ markups: [mk('a'), mk('b')], selectedMarkupIds: ['a'] });
    await renderViewer();
    expect(screen.getByTestId('markup-g-a')).toBeInTheDocument();
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    expect(screen.getByTestId('menu-show-hidden')).toBeDisabled();
    fireEvent.click(screen.getByTestId('menu-hide'));
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'a')!.hidden).toBe(true);
    expect(useMarkupStore.getState().markups).toHaveLength(2);
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual([]);
    expect(screen.queryByTestId('markup-g-a')).toBeNull();
    expect(screen.getByTestId('markup-g-b')).toBeInTheDocument();
    expect(toasts.at(-1)).toMatch(/1 markup hidden/);
    fireEvent.click(screen.getByTestId('menu-editar'));
    fireEvent.click(screen.getByTestId('menu-show-hidden'));
    expect(screen.getByTestId('markup-g-a')).toBeInTheDocument();
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'a')!.hidden).toBeUndefined();
    unmount();
  });

  it('Hide se deshace de un paso y no oculta marcas bloqueadas', () => {
    useMarkupStore.setState({ markups: [mk('a'), mk('l', { locked: true })], selectedMarkupIds: ['a', 'l'] });
    expect(useMarkupStore.getState().setMarkupsHidden(['a', 'l'], true)).toBe(1);
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'l')!.hidden).toBeUndefined();
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups.find((m) => m.id === 'a')!.hidden).toBeUndefined();
  });
});
