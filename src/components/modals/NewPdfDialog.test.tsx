// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewPdfDialog } from './NewPdfDialog';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useDocumentTabsStore } from '../../store/useDocumentTabsStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import * as fileDialogService from '../../services/fileDialogService';
import * as newBlankPdfModule from '../../core/pages/newBlankPdf';

describe('NewPdfDialog Component', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({ pageToolDialog: null });
    useDocumentStore.setState({
      pdfBytes: null,
      pdfDoc: null,
      fileName: null,
      filePath: null,
      currentPageIndex: 0,
      pageDimensions: [],
    });
    useDocumentTabsStore.setState({ tabs: [], activeTabId: null });
    useMarkupStore.setState({ isDirty: false, markups: [] });
    vi.restoreAllMocks();
  });

  it('no renderiza nada cuando pageToolDialog no es "newPdf"', () => {
    const { container } = render(<NewPdfDialog />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza todos los campos del formulario según la referencia de Revu cuando está abierto', () => {
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    expect(screen.getByRole('dialog', { name: 'New PDF' })).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-template')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-width')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-width-unit')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-height')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-height-unit')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-current-page')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-portrait')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-landscape')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-style')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-page-count')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-set-default')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-ok')).toBeInTheDocument();
    expect(screen.getByTestId('new-pdf-cancel')).toBeInTheDocument();
  });

  it('al cambiar la plantilla actualiza las dimensiones y unidades', () => {
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const templateSelect = screen.getByTestId('new-pdf-template') as HTMLSelectElement;
    fireEvent.change(templateSelect, { target: { value: 'ansi-a' } });

    const widthInput = screen.getByTestId('new-pdf-width') as HTMLInputElement;
    const heightInput = screen.getByTestId('new-pdf-height') as HTMLInputElement;
    const widthUnit = screen.getByTestId('new-pdf-width-unit') as HTMLSelectElement;

    expect(parseFloat(widthInput.value)).toBe(8.5);
    expect(parseFloat(heightInput.value)).toBe(11);
    expect(widthUnit.value).toBe('in');
  });

  it('al editar manualmente el ancho o alto cambia la plantilla a <Custom>', () => {
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const widthInput = screen.getByTestId('new-pdf-width');
    fireEvent.change(widthInput, { target: { value: '45.5' } });

    const templateSelect = screen.getByTestId('new-pdf-template') as HTMLSelectElement;
    expect(templateSelect.value).toBe('custom');
  });

  it('al alternar a Landscape intercambia el ancho y el alto', () => {
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const widthInput = screen.getByTestId('new-pdf-width') as HTMLInputElement;
    const heightInput = screen.getByTestId('new-pdf-height') as HTMLInputElement;
    const initialW = parseFloat(widthInput.value);
    const initialH = parseFloat(heightInput.value);

    const landscapeRadio = screen.getByTestId('new-pdf-landscape');
    fireEvent.click(landscapeRadio);

    expect(parseFloat(widthInput.value)).toBe(initialH);
    expect(parseFloat(heightInput.value)).toBe(initialW);
  });

  it('el botón "Current Page" está deshabilitado si no hay PDF abierto', () => {
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const currentPageBtn = screen.getByTestId('new-pdf-current-page');
    expect(currentPageBtn).toBeDisabled();
  });

  it('el botón "Current Page" copia las dimensiones de la página activa cuando hay documento', () => {
    useDocumentStore.setState({
      pdfBytes: new Uint8Array([1, 2, 3]),
      currentPageIndex: 0,
      pageDimensions: [{ width: 612, height: 792 }] as any,
    });
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const currentPageBtn = screen.getByTestId('new-pdf-current-page');
    expect(currentPageBtn).not.toBeDisabled();
    fireEvent.click(currentPageBtn);

    const templateSelect = screen.getByTestId('new-pdf-template') as HTMLSelectElement;
    expect(templateSelect.value).toBe('custom');
  });

  it('al pulsar "Set as Default" guarda los valores en localStorage', () => {
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const templateSelect = screen.getByTestId('new-pdf-template');
    fireEvent.change(templateSelect, { target: { value: 'ansi-b' } });

    const setDefaultBtn = screen.getByTestId('new-pdf-set-default');
    fireEvent.click(setDefaultBtn);

    const raw = localStorage.getItem(newBlankPdfModule.NEW_PDF_DEFAULT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).templateId).toBe('ansi-b');
  });

  it('al pulsar "Cancel" cierra el diálogo sin crear ningún documento', () => {
    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const cancelBtn = screen.getByTestId('new-pdf-cancel');
    fireEvent.click(cancelBtn);

    expect(useUiStore.getState().pageToolDialog).toBeNull();
  });

  it('al pulsar "OK" genera el PDF, abre Untitled.pdf, lo marca como sucio y cierra el diálogo', async () => {
    const dummyBytes = new Uint8Array([37, 80, 68, 70]); // %PDF
    const createSpy = vi.spyOn(newBlankPdfModule, 'createNewBlankPdf').mockResolvedValue(dummyBytes);
    const loadSpy = vi.spyOn(fileDialogService, 'loadPdfData').mockResolvedValue(undefined as any);

    useUiStore.setState({ pageToolDialog: 'newPdf' });
    render(<NewPdfDialog />);

    const okBtn = screen.getByTestId('new-pdf-ok');
    fireEvent.click(okBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy).toHaveBeenCalledWith(null, 'Untitled.pdf', dummyBytes);
      expect(useMarkupStore.getState().isDirty).toBe(true);
      expect(useUiStore.getState().pageToolDialog).toBeNull();
    });
  });
});
