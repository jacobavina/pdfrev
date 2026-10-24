import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SlipSheetDialog } from './SlipSheetDialog';
import { MenuBar } from '../shell/MenuBar';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';

const toasts: string[] = [];
const requests: unknown[] = [];
const CURRENT = new Uint8Array([1, 1, 1]);
const REVISION = new Uint8Array([2, 2, 2]);
let revisionKeys: (string | null)[] = ['S201', 'A103', 'A101', 'A102'];

vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/overlayService', async () => {
  const real = await vi.importActual<typeof import('../../services/overlayService')>('../../services/overlayService');
  return { ...real, pickPdf: vi.fn().mockImplementation(async () => ({ name: 'Rev-B.pdf', bytes: REVISION })) };
});
vi.mock('../../services/pageToolsService', async () => {
  const real = await vi.importActual<typeof import('../../services/pageToolsService')>('../../services/pageToolsService');
  return {
    ...real,
    readSheetKeys: vi.fn().mockImplementation(async (bytes: Uint8Array) => (bytes[0] === 2 ? revisionKeys : ['A101', 'A102', 'S201'])),
    executeSlipSheet: vi.fn().mockImplementation(async (req: unknown) => {
      requests.push(req);
      return { ok: true, message: '3 sheets replaced. Save the document to keep it.' };
    }),
  };
});

const openSlip = () => act(() => useUiStore.setState({ pageToolDialog: 'slip' }));
const chooseRevision = async () => {
  fireEvent.click(screen.getByTestId('slip-choose'));
  await waitFor(() => expect(screen.getByTestId('slip-rows')).toBeInTheDocument());
};

describe('Diálogo Slip Sheet (ADR-0129)', () => {
  beforeEach(() => {
    toasts.length = 0;
    requests.length = 0;
    revisionKeys = ['S201', 'A103', 'A101', 'A102'];
    useUiStore.setState({ pageToolDialog: null });
    useDocumentStore.setState({ pdfBytes: CURRENT, numPages: 3 });
  });

  it('Document ▸ Slip Sheet solo está disponible con un documento abierto', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    expect(screen.getByTestId('menu-slip-sheet')).toBeDisabled();
  });

  it('empareja las láminas por número aunque la revisión venga en otro orden y deja la que sobra sin pareja', async () => {
    openSlip();
    render(<SlipSheetDialog />);
    expect(screen.getByTestId('slip-problem')).toHaveTextContent('Choose the PDF that has the new revision');
    await chooseRevision();
    expect(screen.getByTestId('slip-source')).toHaveTextContent('Rev-B.pdf · 4 sheets');
    expect((screen.getByTestId('slip-select-0') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByTestId('slip-select-1') as HTMLSelectElement).value).toBe('3');
    expect((screen.getByTestId('slip-select-2') as HTMLSelectElement).value).toBe('0');
    expect(screen.getByTestId('slip-by-0')).toHaveTextContent('by sheet');
    expect(screen.getByTestId('slip-summary')).toHaveTextContent('3 of 3 pages will be replaced');
    expect(screen.getByLabelText('Add the 1 new sheet with no match at the end', { exact: false })).not.toBeDisabled();
  });

  it('aplicar manda los emparejamientos, conserva las marcas y añade la lámina sobrante si se pide', async () => {
    openSlip();
    render(<SlipSheetDialog />);
    await chooseRevision();
    fireEvent.click(screen.getByTestId('slip-append'));
    fireEvent.click(screen.getByTestId('slip-apply'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      pairs: [{ oldIndex: 0, newIndex: 2 }, { oldIndex: 1, newIndex: 3 }, { oldIndex: 2, newIndex: 0 }],
      append: [1],
      keepMarkups: true,
    });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
    expect(toasts.at(-1)).toMatch(/3 sheets replaced/);
  });

  it('se puede cambiar un emparejamiento a mano o dejar una página como está; dos páginas con la misma lámina nueva no se aceptan', async () => {
    openSlip();
    render(<SlipSheetDialog />);
    await chooseRevision();
    fireEvent.change(screen.getByTestId('slip-select-2'), { target: { value: '-1' } });
    expect(screen.getByTestId('slip-summary')).toHaveTextContent('2 of 3 pages will be replaced');
    fireEvent.change(screen.getByTestId('slip-select-2'), { target: { value: '2' } });
    expect(screen.getByTestId('slip-by-2')).toHaveTextContent('manual');
    expect(screen.getByTestId('slip-problem')).toHaveTextContent('two pages');
    expect(screen.getByTestId('slip-apply')).toBeDisabled();
  });

  it('si la revisión no trae números de lámina empareja por orden y quitar las marcas se manda tal cual', async () => {
    revisionKeys = [null, null];
    openSlip();
    render(<SlipSheetDialog />);
    await chooseRevision();
    expect(screen.getByTestId('slip-by-0')).toHaveTextContent('by order');
    expect((screen.getByTestId('slip-select-2') as HTMLSelectElement).value).toBe('-1');
    fireEvent.click(screen.getByTestId('slip-keep'));
    fireEvent.click(screen.getByTestId('slip-apply'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ pairs: [{ oldIndex: 0, newIndex: 0 }, { oldIndex: 1, newIndex: 1 }], append: [], keepMarkups: false });
  });

  it('Escape cierra el diálogo', () => {
    openSlip();
    render(<SlipSheetDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
  });
});
