import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDocumentTabsStore, DocumentTabSession } from './useDocumentTabsStore';
import { useDocumentStore } from './useDocumentStore';
import { useMarkupStore } from './useMarkupStore';
import { useCalibrationStore } from './useCalibrationStore';
import { Markup } from '../types/markup';

describe('useDocumentTabsStore - Pestañas Multi-Documento (ADR-0083)', () => {
  const dummyPdfDoc = {
    numPages: 2,
    getPage: vi.fn(),
  } as any;

  const sampleSession1: Omit<DocumentTabSession, 'id'> = {
    filePath: 'C:/planos/plano1.pdf',
    fileName: 'plano1.pdf',
    pdfBytes: new Uint8Array([1, 2, 3]),
    pdfDoc: dummyPdfDoc,
    numPages: 2,
    currentPageIndex: 0,
    scale: 1.0,
    rotation: 0,
    pageDimensions: { 0: { width: 600, height: 800 } },
    pageHasText: { 0: true },
    importedAnnotationIds: [],
    markups: [
      { id: 'm1_tab1', type: 'rectangle', pageIndex: 0 } as Markup,
    ],
    selectedMarkupIds: [],
    isDirty: false,
    calibrations: {
      0: { scale: 0.05, unit: 'm', precision: 2 },
    },
    viewports: {},
    attachments: {},
    hiddenLayers: [],
    historyStacks: { undoStack: [], redoStack: [] },
  };

  const sampleSession2: Omit<DocumentTabSession, 'id'> = {
    filePath: 'C:/planos/plano2.pdf',
    fileName: 'plano2.pdf',
    pdfBytes: new Uint8Array([4, 5, 6]),
    pdfDoc: dummyPdfDoc,
    numPages: 3,
    currentPageIndex: 1,
    scale: 1.5,
    rotation: 90,
    pageDimensions: { 0: { width: 800, height: 600 } },
    pageHasText: { 0: false },
    importedAnnotationIds: [],
    markups: [
      { id: 'm1_tab2', type: 'circle', pageIndex: 1 } as Markup,
      { id: 'm2_tab2', type: 'line', pageIndex: 1 } as Markup,
    ],
    selectedMarkupIds: [],
    isDirty: true,
    calibrations: {
      1: { scale: 0.1, unit: 'm', precision: 3 },
    },
    viewports: {},
    attachments: {},
    hiddenLayers: ['CapaOculta'],
    historyStacks: { undoStack: [], redoStack: [] },
  };

  beforeEach(() => {
    useDocumentTabsStore.getState().closeAllTabs();
  });

  it('inicia vacío sin pestañas y con activeTabId en null', () => {
    const { tabs, activeTabId } = useDocumentTabsStore.getState();
    expect(tabs).toHaveLength(0);
    expect(activeTabId).toBeNull();
  });

  it('openDocumentInTab abre la primera pestaña y restaura su sesión en los stores', () => {
    const tabId = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);

    expect(tabId).toBeTruthy();
    expect(useDocumentTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentTabsStore.getState().activeTabId).toBe(tabId);

    // Stores sincronizados
    expect(useDocumentStore.getState().fileName).toBe('plano1.pdf');
    expect(useMarkupStore.getState().markups).toHaveLength(1);
    expect(useMarkupStore.getState().markups[0].id).toBe('m1_tab1');
    expect(useCalibrationStore.getState().calibrations[0].scale).toBe(0.05);
  });

  it('abrir un segundo documento crea una segunda pestaña sin sobreescribir la primera', () => {
    const tab1Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    const tab2Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession2);

    expect(useDocumentTabsStore.getState().tabs).toHaveLength(2);
    expect(useDocumentTabsStore.getState().tabs[0].id).toBe(tab1Id);
    expect(useDocumentTabsStore.getState().activeTabId).toBe(tab2Id);

    // El store activo ahora tiene el documento 2
    expect(useDocumentStore.getState().fileName).toBe('plano2.pdf');
    expect(useMarkupStore.getState().markups).toHaveLength(2);
    expect(useMarkupStore.getState().markups[0].id).toBe('m1_tab2');
    expect(useCalibrationStore.getState().calibrations[1].scale).toBe(0.1);
  });

  it('switchTab conmuta entre pestañas conservando las modificaciones de cada una sin mezclar', () => {
    const tab1Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    const tab2Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession2);

    // Modificamos marcas en tab 2
    useMarkupStore.getState().addMarkup({ id: 'm3_tab2', type: 'cloud', pageIndex: 0 } as Markup);
    expect(useMarkupStore.getState().markups).toHaveLength(3);

    // Conmutamos de vuelta a tab 1
    useDocumentTabsStore.getState().switchTab(tab1Id);
    expect(useDocumentTabsStore.getState().activeTabId).toBe(tab1Id);

    // Verificamos que tab 1 solo tiene su marca original (m1_tab1)
    expect(useDocumentStore.getState().fileName).toBe('plano1.pdf');
    expect(useMarkupStore.getState().markups).toHaveLength(1);
    expect(useMarkupStore.getState().markups[0].id).toBe('m1_tab1');
    expect(useCalibrationStore.getState().calibrations[0].scale).toBe(0.05);

    // Conmutamos nuevamente a tab 2
    useDocumentTabsStore.getState().switchTab(tab2Id);
    expect(useDocumentTabsStore.getState().activeTabId).toBe(tab2Id);

    // Tab 2 conserva las 3 marcas añadidas
    expect(useDocumentStore.getState().fileName).toBe('plano2.pdf');
    expect(useMarkupStore.getState().markups).toHaveLength(3);
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toContain('m3_tab2');
  });

  it('closeTab sobre una pestaña inactiva la elimina sin alterar la pestaña activa', () => {
    const tab1Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    const tab2Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession2);

    // Cerramos tab 1 estando en tab 2
    useDocumentTabsStore.getState().closeTab(tab1Id);

    expect(useDocumentTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentTabsStore.getState().activeTabId).toBe(tab2Id);
    expect(useDocumentStore.getState().fileName).toBe('plano2.pdf');
  });

  it('closeTab sobre la pestaña activa conmuta automáticamente a la pestaña adyacente', () => {
    const tab1Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    const tab2Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession2);

    // Cerramos tab 2 (activa)
    useDocumentTabsStore.getState().closeTab(tab2Id);

    expect(useDocumentTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentTabsStore.getState().activeTabId).toBe(tab1Id);
    expect(useDocumentStore.getState().fileName).toBe('plano1.pdf');
    expect(useMarkupStore.getState().markups[0].id).toBe('m1_tab1');
  });

  it('closeAllTabs resetea la aplicación al estado inicial sin documentos', () => {
    useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    useDocumentTabsStore.getState().openDocumentInTab(sampleSession2);

    useDocumentTabsStore.getState().closeAllTabs();

    expect(useDocumentTabsStore.getState().tabs).toHaveLength(0);
    expect(useDocumentTabsStore.getState().activeTabId).toBeNull();
    expect(useDocumentStore.getState().fileName).toBeNull();
    expect(useMarkupStore.getState().markups).toHaveLength(0);
  });

  it('reorderTabs cambia el orden visual de las pestañas en la barra', () => {
    const tab1Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    const tab2Id = useDocumentTabsStore.getState().openDocumentInTab(sampleSession2);

    expect(useDocumentTabsStore.getState().tabs[0].id).toBe(tab1Id);
    expect(useDocumentTabsStore.getState().tabs[1].id).toBe(tab2Id);

    useDocumentTabsStore.getState().reorderTabs(0, 1);

    expect(useDocumentTabsStore.getState().tabs[0].id).toBe(tab2Id);
    expect(useDocumentTabsStore.getState().tabs[1].id).toBe(tab1Id);
  });

  it('captureActiveTab captura el estado actual de los stores en la pestaña activa', () => {
    const tabId = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    useMarkupStore.getState().addMarkup({ id: 'm_captured', type: 'line', pageIndex: 0 } as Markup);

    useDocumentTabsStore.getState().captureActiveTab();

    const activeTab = useDocumentTabsStore.getState().tabs.find((t) => t.id === tabId);
    expect(activeTab?.markups.map((m) => m.id)).toContain('m_captured');
  });

  it('updateActiveTabLocation actualiza el nombre y ruta de la pestaña activa', () => {
    const tabId = useDocumentTabsStore.getState().openDocumentInTab(sampleSession1);
    useDocumentTabsStore.getState().updateActiveTabLocation('C:/planos/renombrado.pdf', 'renombrado.pdf');

    const activeTab = useDocumentTabsStore.getState().tabs.find((t) => t.id === tabId);
    expect(activeTab?.filePath).toBe('C:/planos/renombrado.pdf');
    expect(activeTab?.fileName).toBe('renombrado.pdf');
  });

  it('closeTab y closeAllTabs invocan destroy() sobre el proxy de PDF.js para liberar memoria', () => {
    const mockDestroy1 = vi.fn();
    const mockDestroy2 = vi.fn();

    const sessionWithDestroy1 = {
      ...sampleSession1,
      pdfDoc: { numPages: 1, destroy: mockDestroy1 } as any,
    };
    const sessionWithDestroy2 = {
      ...sampleSession2,
      pdfDoc: { numPages: 1, destroy: mockDestroy2 } as any,
    };

    const tab1 = useDocumentTabsStore.getState().openDocumentInTab(sessionWithDestroy1);
    useDocumentTabsStore.getState().openDocumentInTab(sessionWithDestroy2);

    useDocumentTabsStore.getState().closeTab(tab1);
    expect(mockDestroy1).toHaveBeenCalledTimes(1);

    useDocumentTabsStore.getState().closeAllTabs();
    expect(mockDestroy2).toHaveBeenCalledTimes(1);
  });
});
