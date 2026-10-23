import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { InsertPagesDialog } from './InsertPagesDialog';
import { MenuBar } from '../shell/MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useUiStore } from '../../store/useUiStore';
import type { Markup } from '../../types/markup';

const toasts: string[] = [];
let pickedPdf: { name: string; bytes: Uint8Array } | null = null;
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/overlayService', () => ({ pickPdf: vi.fn().mockImplementation(async () => pickedPdf) }));
vi.mock('../../services/pdfService', () => ({
  loadPdfDocument: vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { numPages: doc.getPageCount() } as never;
  }),
}));

const make = async (n: number, base: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([base + i, 400]);
  return doc.save();
};
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());
const mk = (id: string, pageIndex: number): Markup =>
  ({ id, type: 'rectangle', pageIndex, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending' }) as Markup;
const change = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('Insert Pages from File (ADR-0123)', () => {
  let docBytes: Uint8Array;
  beforeEach(async () => {
    toasts.length = 0;
    pickedPdf = null;
    docBytes = await make(4, 600);
    useDocumentStore.setState({ filePath: 'C:/p/a.pdf', fileName: 'a.pdf', pdfBytes: docBytes, numPages: 4, currentPageIndex: 1, scale: 1, rotation: 0, pdfDoc: { numPages: 4 } as never, pageLabels: { 0: 'A' } as never });
    useMarkupStore.setState({ markups: [mk('p0', 0), mk('p1', 1), mk('p3', 3)], selectedMarkupIds: [] });
    useCalibrationStore.setState({
      calibrations: { 1: { scale: 2, unit: 'm' }, 3: { scale: 3, unit: 'm' } },
      viewports: { 3: [{ id: 'v', name: 'v', pageIndex: 3, bounds: { x: 0, y: 0, width: 0.5, height: 0.5 }, calibration: { scale: 1, unit: 'm' } }] },
    });
    useUiStore.setState({ pageToolDialog: null });
  });

  it('Document ▸ Insert Pages from File abre el diálogo y se desactiva sin documento', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    expect(screen.getByTestId('menu-insert-pages')).toBeDisabled();
    unmount();
    useDocumentStore.setState({ pdfBytes: docBytes, numPages: 4 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    fireEvent.click(screen.getByTestId('menu-insert-pages'));
    expect(useUiStore.getState().pageToolDialog).toBe('insert');
  });

  it('elegir el PDF, ver cómo quedará y insertar después de la página actual, corriendo marcas, escalas y viewports', async () => {
    pickedPdf = { name: 'nuevas.pdf', bytes: await make(3, 900) };
    act(() => useUiStore.setState({ pageToolDialog: 'insert' }));
    render(<InsertPagesDialog />);
    expect(screen.getByTestId('insert-problem')).toHaveTextContent('Choose the PDF');
    fireEvent.click(screen.getByTestId('insert-choose'));
    await waitFor(() => expect(screen.getByTestId('insert-source')).toHaveTextContent('nuevas.pdf (3 pages)'));
    change('insert-pages', '1-2');
    expect(screen.getByTestId('insert-summary')).toHaveTextContent('2 pages will go in as pages 3–4. The document will have 6 pages.');
    fireEvent.click(screen.getByTestId('insert-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(await widths(useDocumentStore.getState().pdfBytes!)).toEqual([600, 601, 900, 901, 602, 603]);
    // p3 pasa de la página 4 a la 6; lo anterior no se mueve
    expect(useMarkupStore.getState().markups.map((m) => [m.id, m.pageIndex])).toEqual([['p0', 0], ['p1', 1], ['p3', 5]]);
    expect(Object.keys(useCalibrationStore.getState().calibrations).map(Number).sort()).toEqual([1, 5]);
    expect(useCalibrationStore.getState().viewports[5][0].pageIndex).toBe(5);
    expect(useDocumentStore.getState().pageLabels).toBeNull();
    expect(useDocumentStore.getState().currentPageIndex).toBe(2);
    expect(toasts.at(-1)).toBe('2 pages inserted (4 → 6 pages).');
  });

  it('antes de la página actual y al final cambian la posición', async () => {
    pickedPdf = { name: 'una.pdf', bytes: await make(1, 900) };
    act(() => useUiStore.setState({ pageToolDialog: 'insert' }));
    render(<InsertPagesDialog />);
    fireEvent.click(screen.getByTestId('insert-choose'));
    await waitFor(() => expect(screen.getByTestId('insert-source')).toHaveTextContent('una.pdf'));
    fireEvent.click(screen.getByTestId('insert-where-before'));
    expect(screen.getByTestId('insert-summary')).toHaveTextContent('will go in as page 2.');
    fireEvent.click(screen.getByTestId('insert-where-end'));
    expect(screen.getByTestId('insert-summary')).toHaveTextContent('will go in as page 5.');
    fireEvent.click(screen.getByTestId('insert-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(await widths(useDocumentStore.getState().pdfBytes!)).toEqual([600, 601, 602, 603, 900]);
    expect(useMarkupStore.getState().markups.map((m) => m.pageIndex)).toEqual([0, 1, 3]);
  });

  it('una lista de páginas que no existen lo explica y desactiva Insert', async () => {
    pickedPdf = { name: 'nuevas.pdf', bytes: await make(2, 900) };
    act(() => useUiStore.setState({ pageToolDialog: 'insert' }));
    render(<InsertPagesDialog />);
    fireEvent.click(screen.getByTestId('insert-choose'));
    await waitFor(() => expect(screen.getByTestId('insert-source')).toHaveTextContent('nuevas.pdf'));
    change('insert-pages', '5');
    expect(screen.getByTestId('insert-problem')).toHaveTextContent('that PDF has 2');
    expect(screen.getByTestId('insert-apply')).toBeDisabled();
  });

  it('Escape cierra el diálogo sin cambiar el documento', () => {
    act(() => useUiStore.setState({ pageToolDialog: 'insert' }));
    render(<InsertPagesDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
    expect(useDocumentStore.getState().pdfBytes).toBe(docBytes);
  });
});
