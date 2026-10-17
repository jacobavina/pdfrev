import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  executeRotatePage,
  executeDeletePage,
  executeInsertBlankPage,
  executeExtractPage,
  executeReorderPage,
  executeCombineDocuments,
} from './pageService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useDocumentTabsStore } from '../store/useDocumentTabsStore';
import { Markup } from '../types/markup';

// Mock de exportService para saveExportFile
vi.mock('./exportService', () => ({
  saveExportFileWithDialog: vi.fn().mockResolvedValue(true),
}));

// Mock de toastService
vi.mock('./toastService', () => ({
  showToast: vi.fn(),
}));

// Mock de pdfService para evitar que pdfjs-dist busque worker en entorno Node.js
vi.mock('./pdfService', () => ({
  loadPdfDocument: vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return {
      numPages: doc.getPageCount(),
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 600, height: 800 }),
      }),
    } as any;
  }),
}));

describe('pageService - Integración de Operaciones de Página (Paquete 5)', () => {
  let initialPdfBytes: Uint8Array;

  beforeEach(async () => {
    // PDF sintético de 3 páginas
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]); // Pag 0
    doc.addPage([600, 800]); // Pag 1
    doc.addPage([600, 800]); // Pag 2
    initialPdfBytes = await doc.save();

    useDocumentStore.setState({
      filePath: 'C:/planos/proyecto.pdf',
      fileName: 'proyecto.pdf',
      pdfBytes: initialPdfBytes,
      numPages: 3,
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      pdfDoc: {
        numPages: 3,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 600, height: 800 }),
        }),
      } as any,
    });

    useMarkupStore.setState({
      markups: [
        { id: 'm0', type: 'rectangle', pageIndex: 0 } as Markup,
        { id: 'm1', type: 'circle', pageIndex: 1 } as Markup,
        { id: 'm2', type: 'line', pageIndex: 2 } as Markup,
      ],
      selectedMarkupIds: [],
    });

    useCalibrationStore.setState({
      calibrations: {
        0: { scale: 0.01, unit: 'm', precision: 2 },
        1: { scale: 0.02, unit: 'm', precision: 2 },
        2: { scale: 0.05, unit: 'm', precision: 2 },
      },
    });
  });

  it('executeRotatePage rota la página y actualiza los bytes del documento', async () => {
    const success = await executeRotatePage(1, 90);
    expect(success).toBe(true);

    const updatedDoc = await PDFDocument.load(useDocumentStore.getState().pdfBytes!);
    expect(updatedDoc.getPage(1).getRotation().angle).toBe(90);
  });

  it('executeDeletePage elimina página 1, remapea marcas y calibraciones', async () => {
    const success = await executeDeletePage(1);
    expect(success).toBe(true);

    expect(useDocumentStore.getState().numPages).toBe(2);

    const markups = useMarkupStore.getState().markups;
    expect(markups).toHaveLength(2);
    expect(markups[0].id).toBe('m0');
    expect(markups[0].pageIndex).toBe(0);

    // m2 pasó de página 2 a 1
    expect(markups[1].id).toBe('m2');
    expect(markups[1].pageIndex).toBe(1);

    const calibrations = useCalibrationStore.getState().calibrations;
    expect(calibrations[0].scale).toBe(0.01);
    expect(calibrations[1].scale).toBe(0.05); // remapeada desde la página 2
    expect(calibrations[2]).toBeUndefined();
  });

  it('executeDeletePage rechaza eliminar si solo queda 1 página', async () => {
    useDocumentStore.setState({ numPages: 1 });

    const success = await executeDeletePage(0);
    expect(success).toBe(false);
  });

  it('executeInsertBlankPage añade una página y desplaza los índices de marcas', async () => {
    const success = await executeInsertBlankPage(1);
    expect(success).toBe(true);

    expect(useDocumentStore.getState().numPages).toBe(4);
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);

    const markups = useMarkupStore.getState().markups;
    expect(markups).toHaveLength(3);
    expect(markups[0].id).toBe('m0');
    expect(markups[0].pageIndex).toBe(0);

    // m1 y m2 desplazadas a la derecha
    expect(markups[1].id).toBe('m1');
    expect(markups[1].pageIndex).toBe(2);
    expect(markups[2].id).toBe('m2');
    expect(markups[2].pageIndex).toBe(3);
  });

  it('executeExtractPage genera archivo de exportación de la página elegida', async () => {
    const success = await executeExtractPage(0);
    expect(success).toBe(true);

    const { saveExportFileWithDialog } = await import('./exportService');
    expect(saveExportFileWithDialog).toHaveBeenCalledWith(
      'proyecto_pag_1.pdf',
      'pdf',
      expect.any(Uint8Array)
    );
  });

  describe('executeReorderPage (ADR-0082)', () => {
    it('reordena página 0 a posición 2, actualiza marcas, calibraciones, página activa y estado dirty', async () => {
      const success = await executeReorderPage(0, 2);
      expect(success).toBe(true);

      // Total de páginas se mantiene
      expect(useDocumentStore.getState().numPages).toBe(3);
      // La página activa sigue a la página movida (ahora índice 2)
      expect(useDocumentStore.getState().currentPageIndex).toBe(2);

      // Marcas remapeadas
      const markups = useMarkupStore.getState().markups;
      expect(markups).toHaveLength(3);
      expect(markups.find((m) => m.id === 'm0')?.pageIndex).toBe(2);
      expect(markups.find((m) => m.id === 'm1')?.pageIndex).toBe(0);
      expect(markups.find((m) => m.id === 'm2')?.pageIndex).toBe(1);

      // Calibraciones remapeadas
      const calibrations = useCalibrationStore.getState().calibrations;
      expect(calibrations[0].scale).toBe(0.02); // antigua pág 1
      expect(calibrations[1].scale).toBe(0.05); // antigua pág 2
      expect(calibrations[2].scale).toBe(0.01); // antigua pág 0

      // El documento debe quedar marcado como sucio (dirty)
      expect(useMarkupStore.getState().isDirty).toBe(true);
    });

    it('reordena hacia atrás (2 a 0)', async () => {
      useDocumentStore.setState({ currentPageIndex: 2 });
      const success = await executeReorderPage(2, 0);
      expect(success).toBe(true);

      expect(useDocumentStore.getState().currentPageIndex).toBe(0);
      const markups = useMarkupStore.getState().markups;
      expect(markups.find((m) => m.id === 'm2')?.pageIndex).toBe(0);
      expect(markups.find((m) => m.id === 'm0')?.pageIndex).toBe(1);
      expect(markups.find((m) => m.id === 'm1')?.pageIndex).toBe(2);
    });

    it('devuelve true de inmediato si fromIndex es igual a toIndex sin alterar estado', async () => {
      const success = await executeReorderPage(1, 1);
      expect(success).toBe(true);
    });

    it('rechaza índices fuera de rango', async () => {
      const success1 = await executeReorderPage(-1, 2);
      expect(success1).toBe(false);

      const success2 = await executeReorderPage(0, 10);
      expect(success2).toBe(false);
    });
  });

  describe('executeCombineDocuments (ADR-0084)', () => {
    it('combina múltiples documentos y abre el resultado como documento activo', async () => {
      const doc1 = await PDFDocument.create();
      doc1.addPage([500, 500]);
      const bytes1 = await doc1.save();

      const doc2 = await PDFDocument.create();
      doc2.addPage([600, 600]);
      const bytes2 = await doc2.save();

      const sources = [
        { name: 'planoA.pdf', bytes: bytes1 },
        { name: 'planoB.pdf', bytes: bytes2 },
      ];

      const merged = await executeCombineDocuments(sources, 'JuegoCompleto.pdf');
      expect(merged).not.toBeNull();

      // Verifica que el documento activo en useDocumentStore se actualizó como documento en memoria sin ruta previa en disco
      expect(useDocumentStore.getState().fileName).toBe('JuegoCompleto.pdf');
      expect(useDocumentStore.getState().filePath).toBeNull();
      expect(useDocumentStore.getState().numPages).toBe(2);

      // Verifica que se registró una pestaña para el nuevo documento combinado
      const tabs = useDocumentTabsStore.getState().tabs;
      expect(tabs.length).toBeGreaterThan(0);
      const activeTab = tabs.find((t) => t.id === useDocumentTabsStore.getState().activeTabId);
      expect(activeTab?.fileName).toBe('JuegoCompleto.pdf');
      expect(activeTab?.filePath).toBeNull();
    });

    it('retorna null y muestra toast si la lista de fuentes está vacía', async () => {
      const merged = await executeCombineDocuments([]);
      expect(merged).toBeNull();
    });
  });
});
