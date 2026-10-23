import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { FlagsPanel } from './FlagsPanel';
import { PdfViewer } from '../PdfViewer';
import { MenuBar } from '../shell/MenuBar';
import { LeftDock } from '../shell/LeftDock';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useToolStore } from '../../store/useToolStore';
import { useUiStore } from '../../store/useUiStore';
import { saveIncrementalMarkups } from '../../core/pdf/incrementalWriter';
import { importPdfAnnotations } from '../../core/pdf/annotationReader';
import { isFlagged } from '../../core/markup/flags';
import type { Markup } from '../../types/markup';

vi.mock('../../services/pdfService', () => ({ renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }) }));
const toasts: string[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));

const mk = (id: string, pageIndex: number, y: number, extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'rectangle', pageIndex, points: [{ x: 0.2, y }, { x: 0.5, y: y + 0.1 }], style: { strokeColor: '#000', fillColor: 'transparent', strokeWidth: 1, opacity: 1 }, author: 'Ana', createdAt: '', updatedAt: '', status: 'pending', ...extra }) as Markup;
const flagged = (m: Markup): Markup => ({ ...m, customFields: { ...(m.customFields ?? {}), flagged: 1 } });

describe('Flags: panel, comandos y bandera sobre la hoja (ADR-0117)', () => {
  beforeEach(() => {
    toasts.length = 0;
    useDocumentStore.setState({ numPages: 3, currentPageIndex: 0, scale: 1, rotation: 0, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, viewports: {} });
    useToolStore.setState({ activeTool: 'select' });
    useUiStore.setState({ leftOpen: true, leftTab: 'flags', hiddenLayers: [] });
    useMarkupStore.setState({
      markups: [flagged(mk('b', 1, 0.5, { text: 'Revisar la losa' })), flagged(mk('a', 0, 0.2)), mk('sin', 0, 0.1), flagged(mk('c', 1, 0.1, { status: 'accepted' }))],
      selectedMarkupIds: [],
    });
    useMarkupStore.getState().clearHistory();
  });

  it('lista las marcas con bandera por página y posición, con su comentario, autor y estado', () => {
    render(<FlagsPanel />);
    expect(screen.getByTestId('flags-count')).toHaveTextContent('3');
    expect(screen.getByTestId('flags-page-0').querySelectorAll('li')).toHaveLength(1);
    const rows = [...screen.getByTestId('flags-page-1').querySelectorAll('li')].map((li) => li.getAttribute('data-testid'));
    expect(rows).toEqual(['flag-row-c', 'flag-row-b']);
    expect(screen.getByTestId('flag-row-b')).toHaveTextContent('Revisar la losa');
    expect(screen.getByTestId('flag-row-b')).toHaveTextContent('Ana · pending');
    expect(screen.queryByTestId('flag-row-sin')).toBeNull();
  });

  it('un clic lleva a la página de la marca y la selecciona; el filtro deja solo la página actual', () => {
    render(<FlagsPanel />);
    fireEvent.click(screen.getByTestId('flag-row-b').querySelector('button')!);
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['b']);
    fireEvent.change(screen.getByTestId('flags-scope'), { target: { value: 'page' } });
    expect(screen.getByTestId('flags-count')).toHaveTextContent('2');
    expect(screen.queryByTestId('flag-row-a')).toBeNull();
  });

  it('quitar una bandera y "Remove all" se deshacen de un paso', () => {
    render(<FlagsPanel />);
    fireEvent.click(screen.getByTestId('flag-remove-a'));
    expect(isFlagged(useMarkupStore.getState().markups.find((m) => m.id === 'a')!)).toBe(false);
    fireEvent.click(screen.getByTestId('flags-clear'));
    expect(screen.getByTestId('flags-empty')).toHaveTextContent('No flagged markups');
    expect(useMarkupStore.getState().markups.some(isFlagged)).toBe(false);
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups.filter(isFlagged).map((m) => m.id).sort()).toEqual(['b', 'c']);
  });

  it('Edit ▸ Flag pone la bandera a la selección y, si ya la tiene toda, la quita; se deshace', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['sin'] });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    expect(screen.getByTestId('menu-flag')).toHaveTextContent('Ctrl+Alt+F');
    fireEvent.click(screen.getByTestId('menu-flag'));
    expect(isFlagged(useMarkupStore.getState().markups.find((m) => m.id === 'sin')!)).toBe(true);
    expect(toasts.at(-1)).toMatch(/1 markup flagged/);
    fireEvent.click(screen.getByTestId('menu-editar'));
    fireEvent.click(screen.getByTestId('menu-flag'));
    expect(isFlagged(useMarkupStore.getState().markups.find((m) => m.id === 'sin')!)).toBe(false);
    expect(toasts.at(-1)).toMatch(/1 flag removed/);
    act(() => useMarkupStore.getState().undo());
    expect(isFlagged(useMarkupStore.getState().markups.find((m) => m.id === 'sin')!)).toBe(true);
  });

  it('Ctrl+Alt+F desde el visor pone la bandera y se dibuja sobre la hoja, y sin selección avisa', async () => {
    useMarkupStore.setState({ markups: [mk('x', 0, 0.3)], selectedMarkupIds: ['x'] });
    await act(async () => {
      render(<PdfViewer />);
    });
    expect(screen.queryByTestId('flag-glyph-x')).toBeNull();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true, altKey: true });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('flag-glyph-x')).toBeInTheDocument();
    act(() => useMarkupStore.setState({ selectedMarkupIds: [] }));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true, altKey: true });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(toasts.at(-1)).toBe('Select a markup to flag.');
  });

  it('View ▸ Panels ▸ Flags Panel y la pestaña del riel abren el panel', () => {
    useUiStore.setState({ leftOpen: false, leftTab: 'pages' });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
    fireEvent.click(screen.getByTestId('menu-panel-flags'));
    expect(useUiStore.getState()).toMatchObject({ leftTab: 'flags', leftOpen: true });
    render(<LeftDock />);
    expect(screen.getByTestId('left-tab-flags')).toBeInTheDocument();
  });

  it('la bandera se guarda en el PDF y vuelve al abrirlo; una marca sin bandera no escribe nada', async () => {
    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
    const saved = await saveIncrementalMarkups(blueprint, [flagged(mk('con', 0, 0.2)), mk('sin', 0, 0.5)]);
    const back = (await importPdfAnnotations(saved)).markups;
    expect(isFlagged(back.find((m) => m.id === 'con')!)).toBe(true);
    expect(isFlagged(back.find((m) => m.id === 'sin')!)).toBe(false);
  });

  it('copiar y pegar una marca con bandera conserva la bandera', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['a'] });
    useMarkupStore.getState().copySelectedMarkups();
    useMarkupStore.getState().pasteMarkups(0);
    expect(useMarkupStore.getState().markups.filter(isFlagged)).toHaveLength(4);
  });
});
