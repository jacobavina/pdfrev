import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { HeadersFootersDialog } from './HeadersFootersDialog';
import { ReplacePagesDialog } from './ReplacePagesDialog';
import { SplitDocumentDialog } from './SplitDocumentDialog';
import { MenuBar } from '../shell/MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useUiStore } from '../../store/useUiStore';

const toasts: string[] = [];
const downloads: string[] = [];
let pickedPdf: { name: string; bytes: Uint8Array } | null = null;
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/exportService', () => ({
  saveExportFileWithDialog: vi.fn().mockImplementation(async (name: string) => {
    downloads.push(name);
    return true;
  }),
}));
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
const change = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const openDialog = (d: 'headerFooter' | 'replace' | 'split') => act(() => useUiStore.setState({ pageToolDialog: d }));

let docBytes: Uint8Array;

describe('Diálogos de Headers & Footers, Replace Pages y Split Document (ADR-0114)', () => {
  beforeEach(async () => {
    toasts.length = 0;
    downloads.length = 0;
    pickedPdf = null;
    docBytes = await make(4, 600);
    useDocumentStore.setState({ filePath: 'C:/planos/Obra.pdf', fileName: 'Obra.pdf', pdfBytes: docBytes, numPages: 4, currentPageIndex: 1, scale: 1, rotation: 0, pdfDoc: { numPages: 4 } as never });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useCalibrationStore.setState({ calibrations: {}, viewports: {} });
    useUiStore.setState({ pageToolDialog: null });
  });

  it('Document ▸ Headers & Footers, Replace Pages y Split Document abren su diálogo y se desactivan sin documento', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    for (const id of ['menu-headers-footers', 'menu-replace-pages', 'menu-split-document']) expect(screen.getByTestId(id)).toBeDisabled();
    unmount();
    useDocumentStore.setState({ pdfBytes: docBytes, numPages: 4 });
    render(<MenuBar />);
    for (const [id, dialog] of [
      ['menu-headers-footers', 'headerFooter'],
      ['menu-replace-pages', 'replace'],
      ['menu-split-document', 'split'],
    ] as const) {
      fireEvent.click(screen.getByTestId('menu-documento'));
      fireEvent.click(screen.getByTestId(id));
      expect(useUiStore.getState().pageToolDialog).toBe(dialog);
    }
  });

  it('Headers & Footers: enseña cómo quedará la primera página, exige texto y estampa las páginas elegidas', async () => {
    openDialog('headerFooter');
    render(<HeadersFootersDialog />);
    expect(screen.getByTestId('hf-sample')).toHaveTextContent('Page 1 of 4');
    change('hf-footerCenter', '');
    expect(screen.getByTestId('hf-problem')).toHaveTextContent('at least one of the six boxes');
    expect(screen.getByTestId('hf-apply')).toBeDisabled();
    change('hf-headerLeft', '{file} — {n}/{total}');
    change('hf-headerRight', '{date}');
    expect(screen.getByTestId('hf-sample')).toHaveTextContent('Obra — 1/4');
    fireEvent.click(screen.getByTestId('hf-scope-range'));
    change('hf-range', '2-3');
    expect(screen.getByTestId('hf-sample')).toHaveTextContent('Obra — 1/2');
    fireEvent.click(screen.getByTestId('hf-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(toasts.at(-1)).toBe('Headers and footers added to 2 pages.');
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('Headers & Footers: una lista de páginas no válida o un tamaño fuera de rango lo explican', () => {
    openDialog('headerFooter');
    render(<HeadersFootersDialog />);
    fireEvent.click(screen.getByTestId('hf-scope-range'));
    change('hf-range', '7-9');
    expect(screen.getByTestId('hf-problem')).toHaveTextContent('Type the pages like 1-3, 5, 8-10.');
    change('hf-range', '1');
    change('hf-size', '90');
    expect(screen.getByTestId('hf-problem')).toHaveTextContent('between 4 and 72');
  });

  it('Replace Pages: elegir el PDF, ver el resumen y sustituir las páginas conservando las marcas', async () => {
    pickedPdf = { name: 'revision.pdf', bytes: await make(3, 900) };
    useMarkupStore.setState({
      markups: [{ id: 'm', type: 'rectangle', pageIndex: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending' } as never],
    });
    openDialog('replace');
    render(<ReplacePagesDialog />);
    expect(screen.getByTestId('replace-problem')).toHaveTextContent('Choose the PDF');
    expect(screen.getByTestId('replace-targets')).toHaveValue('2');
    fireEvent.click(screen.getByTestId('replace-choose'));
    await waitFor(() => expect(screen.getByTestId('replace-source')).toHaveTextContent('revision.pdf (3 pages)'));
    change('replace-source-pages', '3');
    expect(screen.getByTestId('replace-summary')).toHaveTextContent('1 page will be replaced by 1. The document will have 4 pages.');
    expect(screen.getByTestId('replace-keep')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('replace-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(await widths(useDocumentStore.getState().pdfBytes!)).toEqual([600, 902, 602, 603]);
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['m']);
    expect(toasts.at(-1)).toBe('1 page replaced (4 → 4 pages).');
  });

  it('Replace Pages: con distinta cantidad avisa de que las marcas se quitan y desactiva conservarlas', async () => {
    pickedPdf = { name: 'revision.pdf', bytes: await make(3, 900) };
    openDialog('replace');
    render(<ReplacePagesDialog />);
    fireEvent.click(screen.getByTestId('replace-choose'));
    await waitFor(() => expect(screen.getByTestId('replace-source')).toHaveTextContent('revision.pdf'));
    change('replace-source-pages', '1-3');
    expect(screen.getByTestId('replace-summary')).toHaveTextContent('The document will have 6 pages.');
    expect(screen.getByTestId('replace-summary')).toHaveTextContent('removed because the page count changes');
    expect(screen.getByTestId('replace-keep')).toBeDisabled();
    change('replace-targets', '9');
    expect(screen.getByTestId('replace-problem')).toHaveTextContent('this document has 4');
    expect(screen.getByTestId('replace-apply')).toBeDisabled();
  });

  it('Split Document: la vista previa lista los archivos y sus páginas, y Split los descarga', async () => {
    openDialog('split');
    render(<SplitDocumentDialog />);
    change('split-every', '3');
    expect(screen.getByTestId('split-preview')).toHaveTextContent('2 files');
    expect(screen.getByTestId('split-preview')).toHaveTextContent('Obra_p1-3.pdf');
    expect(screen.getByTestId('split-preview')).toHaveTextContent('Obra_p4.pdf');
    change('split-every', '4');
    expect(screen.getByTestId('split-problem')).toHaveTextContent('one file with every page');
    fireEvent.click(screen.getByTestId('split-mode-ranges'));
    change('split-ranges', '1-2; 3, 4');
    expect(screen.getByTestId('split-preview')).toHaveTextContent('Obra_p1-2.pdf');
    expect(screen.getByTestId('split-preview')).toHaveTextContent('Obra_p3-4.pdf');
    change('split-ranges', '1-2; 9');
    expect(screen.getByTestId('split-problem')).toHaveTextContent('Type the parts like 1-3; 4-6; 8');
    expect(screen.getByTestId('split-apply')).toBeDisabled();
    change('split-ranges', '1-2; 3-4');
    fireEvent.click(screen.getByTestId('split-apply'));
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
    expect(downloads).toEqual(['Obra_p1-2.pdf', 'Obra_p3-4.pdf']);
    expect(toasts.at(-1)).toBe('2 files downloaded.');
  });

  it('Escape cierra los diálogos sin tocar el documento', () => {
    for (const d of ['headerFooter', 'replace', 'split'] as const) {
      openDialog(d);
      const { unmount } = render(d === 'headerFooter' ? <HeadersFootersDialog /> : d === 'replace' ? <ReplacePagesDialog /> : <SplitDocumentDialog />);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(useUiStore.getState().pageToolDialog).toBeNull();
      unmount();
    }
    expect(useDocumentStore.getState().pdfBytes).toBe(docBytes);
  });
});
