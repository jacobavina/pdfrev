import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentBar } from './DocumentBar';
import { useDocumentTabsStore, DocumentTabSession } from '../../store/useDocumentTabsStore';
import * as fileDialogService from '../../services/fileDialogService';

vi.mock('../../services/fileDialogService', () => ({
  openPdfDialog: vi.fn(),
}));

describe('DocumentBar - Barra de Pestañas Multi-Documento (ADR-0083)', () => {
  const dummyDoc = { numPages: 1 } as any;

  const mockTab1: DocumentTabSession = {
    id: 'tab-1',
    filePath: 'C:/planos/plano1.pdf',
    fileName: 'plano1.pdf',
    pdfBytes: new Uint8Array([1]),
    pdfDoc: dummyDoc,
    numPages: 1,
    currentPageIndex: 0,
    scale: 1,
    rotation: 0,
    pageDimensions: {},
    pageHasText: {},
    importedAnnotationIds: [],
    markups: [],
    selectedMarkupIds: [],
    isDirty: false,
    calibrations: {},
    viewports: {},
    attachments: {},
    hiddenLayers: [],
  };

  const mockTab2: DocumentTabSession = {
    id: 'tab-2',
    filePath: 'C:/planos/plano2.pdf',
    fileName: 'plano2.pdf',
    pdfBytes: new Uint8Array([2]),
    pdfDoc: dummyDoc,
    numPages: 1,
    currentPageIndex: 0,
    scale: 1,
    rotation: 0,
    pageDimensions: {},
    pageHasText: {},
    importedAnnotationIds: [],
    markups: [],
    selectedMarkupIds: [],
    isDirty: true,
    calibrations: {},
    viewports: {},
    attachments: {},
    hiddenLayers: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentTabsStore.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it('no renderiza nada si no hay pestañas abiertas', () => {
    const { container } = render(<DocumentBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza pestañas abiertas con indicador de activo y dirty', () => {
    useDocumentTabsStore.setState({
      tabs: [mockTab1, mockTab2],
      activeTabId: 'tab-1',
    });

    render(<DocumentBar />);

    expect(screen.getByTestId('document-tab-tab-1')).toBeInTheDocument();
    expect(screen.getByTestId('document-tab-tab-2')).toBeInTheDocument();
    expect(screen.getByText('plano1.pdf')).toBeInTheDocument();
    expect(screen.getByText('plano2.pdf')).toBeInTheDocument();

    // Indicador sucio en tab 2
    expect(screen.getByText('●')).toBeInTheDocument();
  });

  it('al hacer clic en una pestaña llama a switchTab', () => {
    const switchTabSpy = vi.fn();
    useDocumentTabsStore.setState({
      tabs: [mockTab1, mockTab2],
      activeTabId: 'tab-1',
      switchTab: switchTabSpy,
    });

    render(<DocumentBar />);

    fireEvent.click(screen.getByTestId('document-tab-tab-2'));
    expect(switchTabSpy).toHaveBeenCalledWith('tab-2');
  });

  it('al pulsar el botón X de una pestaña llama a closeTab', () => {
    const closeTabSpy = vi.fn();
    useDocumentTabsStore.setState({
      tabs: [mockTab1, mockTab2],
      activeTabId: 'tab-1',
      closeTab: closeTabSpy,
    });

    render(<DocumentBar />);

    fireEvent.click(screen.getByTestId('close-tab-btn-tab-1'));
    expect(closeTabSpy).toHaveBeenCalledWith('tab-1');
  });

  it('al pulsar el botón + llama a openPdfDialog', () => {
    useDocumentTabsStore.setState({
      tabs: [mockTab1],
      activeTabId: 'tab-1',
    });

    render(<DocumentBar />);

    fireEvent.click(screen.getByTestId('add-document-tab-btn'));
    expect(fileDialogService.openPdfDialog).toHaveBeenCalledTimes(1);
  });
});
