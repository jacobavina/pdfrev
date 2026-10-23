import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { PageLabelsDialog } from './PageLabelsDialog';
import { MenuBar } from '../shell/MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import { readPageLabelRanges, writePageLabelRanges } from '../../core/pdf/pageLabels';

const toasts: string[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/pdfService', () => ({
  loadPdfDocument: vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { numPages: doc.getPageCount() } as never;
  }),
}));

const make = async (n: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([600, 400]);
  return doc.save();
};
const change = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('Page Labels (ADR-0124)', () => {
  let bytes: Uint8Array;
  beforeEach(async () => {
    toasts.length = 0;
    bytes = await make(8);
    useDocumentStore.setState({ filePath: 'C:/p/a.pdf', fileName: 'a.pdf', pdfBytes: bytes, numPages: 8, currentPageIndex: 2, scale: 1, rotation: 0, pdfDoc: { numPages: 8 } as never, pageLabels: null });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useUiStore.setState({ pageToolDialog: null });
  });

  it('Document ▸ Page Labels abre el diálogo y se desactiva sin documento', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    expect(screen.getByTestId('menu-page-labels')).toBeDisabled();
    unmount();
    useDocumentStore.setState({ pdfBytes: bytes, numPages: 8 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    fireEvent.click(screen.getByTestId('menu-page-labels'));
    expect(useUiStore.getState().pageToolDialog).toBe('labels');
  });

  it('sin etiquetas empieza con un rango decimal y la vista previa lee 1, 2, 3…', async () => {
    act(() => useUiStore.setState({ pageToolDialog: 'labels' }));
    render(<PageLabelsDialog />);
    await waitFor(() => expect(screen.getByTestId('labels-row-0')).toBeInTheDocument());
    expect(screen.getByTestId('labels-preview')).toHaveTextContent('1 · 2 · 3 · 4 · 5 · 6 · 7 · 8');
  });

  it('dos rangos (romanos y luego A-101…) se ven en la vista previa, se escriben en el PDF y se muestran en el visor', async () => {
    act(() => useUiStore.setState({ pageToolDialog: 'labels' }));
    render(<PageLabelsDialog />);
    await waitFor(() => expect(screen.getByTestId('labels-row-0')).toBeInTheDocument());
    change('labels-style-0', 'r');
    fireEvent.click(screen.getByTestId('labels-add'));
    change('labels-start-1', '3');
    change('labels-style-1', 'D');
    change('labels-prefix-1', 'A-');
    change('labels-first-1', '101');
    expect(screen.getByTestId('labels-preview')).toHaveTextContent('i · ii · A-101 · A-102 · A-103 · A-104 · A-105 · A-106');
    fireEvent.click(screen.getByTestId('labels-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(toasts.at(-1)).toMatch(/Page labels updated/);
    expect(useDocumentStore.getState().pageLabels).toMatchObject({ 0: 'i', 1: 'ii', 2: 'A-101', 7: 'A-106' });
    const written = await readPageLabelRanges(useDocumentStore.getState().pdfBytes!);
    expect(written.map((r) => [r.startPage, r.style, r.prefix ?? '', r.startNum ?? 1])).toEqual([[0, 'r', '', 1], [2, 'D', 'A-', 101]]);
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('reabre con las etiquetas que el PDF ya tiene', async () => {
    const labelled = await writePageLabelRanges(bytes, [{ startPage: 0, style: 'A' }, { startPage: 4, prefix: 'Anexo' }]);
    useDocumentStore.setState({ pdfBytes: labelled });
    act(() => useUiStore.setState({ pageToolDialog: 'labels' }));
    render(<PageLabelsDialog />);
    await waitFor(() => expect(screen.getByTestId('labels-row-1')).toBeInTheDocument());
    expect(screen.getByTestId('labels-style-0')).toHaveValue('A');
    expect(screen.getByTestId('labels-start-1')).toHaveValue(5);
    expect(screen.getByTestId('labels-prefix-1')).toHaveValue('Anexo');
    expect(screen.getByTestId('labels-style-1')).toHaveValue('');
  });

  it('datos no válidos se explican y desactivan Apply: página fuera, repetida o primer número menor que 1', async () => {
    act(() => useUiStore.setState({ pageToolDialog: 'labels' }));
    render(<PageLabelsDialog />);
    await waitFor(() => expect(screen.getByTestId('labels-row-0')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('labels-add'));
    change('labels-start-1', '1');
    expect(screen.getByTestId('labels-problem')).toHaveTextContent('Two rows start on page 1');
    expect(screen.getByTestId('labels-apply')).toBeDisabled();
    change('labels-start-1', '20');
    expect(screen.getByTestId('labels-problem')).toHaveTextContent('between 1 and 8');
    change('labels-start-1', '4');
    change('labels-first-1', '0');
    expect(screen.getByTestId('labels-problem')).toHaveTextContent('1 or more');
    change('labels-first-1', '1');
    expect(screen.queryByTestId('labels-problem')).toBeNull();
    expect(screen.getByTestId('labels-apply')).not.toBeDisabled();
  });

  it('quitar un rango y no poder quitar el último; Remove all labels deja el PDF sin etiquetas', async () => {
    const labelled = await writePageLabelRanges(bytes, [{ startPage: 0, style: 'R' }]);
    useDocumentStore.setState({ pdfBytes: labelled, pageLabels: { 0: 'I' } as never });
    act(() => useUiStore.setState({ pageToolDialog: 'labels' }));
    render(<PageLabelsDialog />);
    await waitFor(() => expect(screen.getByTestId('labels-row-0')).toBeInTheDocument());
    expect(screen.getByTestId('labels-remove-0')).toBeDisabled();
    fireEvent.click(screen.getByTestId('labels-clear'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(await readPageLabelRanges(useDocumentStore.getState().pdfBytes!)).toEqual([]);
    expect(useDocumentStore.getState().pageLabels).toBeNull();
    expect(toasts.at(-1)).toMatch(/removed/);
  });

  it('Escape cierra el diálogo sin cambiar el documento', () => {
    act(() => useUiStore.setState({ pageToolDialog: 'labels' }));
    render(<PageLabelsDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
    expect(useDocumentStore.getState().pdfBytes).toBe(bytes);
  });
});
