import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPdfData } from './fileDialogService';
import * as bbxPersistenceService from './bbxPersistenceService';
import * as pdfService from './pdfService';
import { registerToastListener } from './toastService';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { PDFDocumentProxy } from 'pdfjs-dist';

describe('fileDialogService - Carga de Documentos y Avisos BBX (Z.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useMarkupStore.getState().setMarkups([]);
    useDocumentStore.getState().closeDocument();
  });

  it('dispara notificaciones toast cuando el migrador de BBX reporta warnings (tipo desconocido, etc.)', async () => {
    // Mock de pdfService para simular carga de PDF
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);

    // Mock de loadBbxForPdf retornando marcas con estado cancelled y warnings de tipo degradado
    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue({
      document: {
        version: '1.1.0',
        pdfFileName: 'planta.pdf',
        lastSavedAt: '2026-10-10T20:00:00.000Z',
        author: 'Revisor',
        markups: [
          {
            id: 'm-cancelled-1',
            type: 'rectangle',
            pageIndex: 0,
            points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
            style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
            author: 'Revisor',
            createdAt: '2026-10-10T20:00:00.000Z',
            updatedAt: '2026-10-10T20:00:00.000Z',
            status: 'cancelled',
          },
        ],
      },
      warnings: [
        'Tipo de marca desconocido "laserBeam3D" degradado a "rectangle" en marca "m-alien"',
      ],
    });

    const toastListener = vi.fn();
    const unsubscribe = registerToastListener(toastListener);

    try {
      await loadPdfData('C:/proyectos/planta.pdf', 'planta.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));

      // 1. El toast debe haberse disparado con el warning correspondiente
      expect(toastListener).toHaveBeenCalledTimes(1);
      expect(toastListener).toHaveBeenCalledWith(
        expect.stringContaining('laserBeam3D')
      );

      // 2. Las marcas válidas deben haberse cargado en el store, conservando 'cancelled'
      const markupsInStore = useMarkupStore.getState().markups;
      expect(markupsInStore).toHaveLength(1);
      expect(markupsInStore[0].status).toBe('cancelled');
    } finally {
      unsubscribe();
    }
  });

  it('no dispara toast cuando el archivo BBX no contiene warnings', async () => {
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);

    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue({
      document: {
        version: '1.1.0',
        pdfFileName: 'limpio.pdf',
        lastSavedAt: '2026-10-10T20:00:00.000Z',
        author: 'Revisor',
        markups: [],
      },
      warnings: [],
    });

    const toastListener = vi.fn();
    const unsubscribe = registerToastListener(toastListener);

    try {
      await loadPdfData('C:/proyectos/limpio.pdf', 'limpio.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
      expect(toastListener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });
});
