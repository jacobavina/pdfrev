import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PrintDialog } from './PrintDialog';
import { MenuBar } from '../shell/MenuBar';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import type { PrintRequest } from '../../services/printService';

const requests: PrintRequest[] = [];
let outcome = { ok: true, message: 'ok' };
const toasts: string[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/printService', () => ({
  printDocument: vi.fn().mockImplementation(async (req: PrintRequest) => {
    requests.push(req);
    req.onProgress?.(1, req.pages.length);
    return outcome;
  }),
}));

const change = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const openPrint = () => act(() => useUiStore.setState({ pageToolDialog: 'print' }));

describe('Diálogo Print (ADR-0115)', () => {
  beforeEach(() => {
    requests.length = 0;
    toasts.length = 0;
    outcome = { ok: true, message: 'ok' };
    useDocumentStore.setState({ pdfBytes: new Uint8Array([1]), numPages: 12, currentPageIndex: 4, fileName: 'a.pdf' });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useUiStore.setState({ pageToolDialog: null });
  });

  it('File ▸ Print abre el diálogo con su atajo y se desactiva sin documento', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-archivo'));
    expect(screen.getByTestId('menu-print')).toBeDisabled();
    unmount();
    useDocumentStore.setState({ pdfBytes: new Uint8Array([1]), numPages: 12 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-archivo'));
    expect(screen.getByTestId('menu-print')).toHaveTextContent('Ctrl+P');
    fireEvent.click(screen.getByTestId('menu-print'));
    expect(useUiStore.getState().pageToolDialog).toBe('print');
  });

  it('por defecto imprime todas las páginas con las marcas, ajustadas al papel y a 150 dpi', async () => {
    openPrint();
    render(<PrintDialog />);
    fireEvent.click(screen.getByTestId('print-apply'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ withMarkups: true, dpi: 150, scale: 'fit', grayscale: false });
    expect(requests[0].pages).toHaveLength(12);
    await waitFor(() => expect(useUiStore.getState().pageToolDialog).toBeNull());
  });

  it('las opciones elegidas llegan al servicio: página actual, sin marcas, tamaño real, 300 dpi y blanco y negro', async () => {
    openPrint();
    render(<PrintDialog />);
    fireEvent.click(screen.getByTestId('print-scope-current'));
    fireEvent.click(screen.getByTestId('print-without-markups'));
    fireEvent.click(screen.getByTestId('print-scale-actual'));
    change('print-dpi', '300');
    fireEvent.click(screen.getByTestId('print-gray'));
    fireEvent.click(screen.getByTestId('print-apply'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ pages: [4], withMarkups: false, dpi: 300, scale: 'actual', grayscale: true });
  });

  it('una lista de páginas escrita se interpreta y una no válida lo explica y desactiva Print', async () => {
    openPrint();
    render(<PrintDialog />);
    fireEvent.click(screen.getByTestId('print-scope-range'));
    change('print-range', '20');
    expect(screen.getByTestId('print-problem')).toHaveTextContent('Type the pages like 1-3, 5, 8-10.');
    expect(screen.getByTestId('print-apply')).toBeDisabled();
    change('print-range', '2-3, 7');
    expect(screen.queryByTestId('print-problem')).toBeNull();
    fireEvent.click(screen.getByTestId('print-apply'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].pages).toEqual([1, 2, 6]);
  });

  it('avisa de que un trabajo de muchas páginas tardará', () => {
    useDocumentStore.setState({ numPages: 80 });
    openPrint();
    render(<PrintDialog />);
    expect(screen.getByTestId('print-large')).toHaveTextContent('80 pages will take a while');
    fireEvent.click(screen.getByTestId('print-scope-current'));
    expect(screen.queryByTestId('print-large')).toBeNull();
  });

  it('si el servicio falla, el aviso lo cuenta y el diálogo se cierra', async () => {
    outcome = { ok: false, message: 'Could not prepare the print job: x' };
    openPrint();
    render(<PrintDialog />);
    fireEvent.click(screen.getByTestId('print-apply'));
    await waitFor(() => expect(toasts.at(-1)).toBe('Could not prepare the print job: x'));
    expect(useUiStore.getState().pageToolDialog).toBeNull();
  });

  it('Escape cierra el diálogo sin imprimir', () => {
    openPrint();
    render(<PrintDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
    expect(requests).toHaveLength(0);
  });
});
