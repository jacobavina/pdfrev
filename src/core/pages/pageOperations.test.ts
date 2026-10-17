import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  rotatePdfPage,
  deletePdfPage,
  insertBlankPdfPage,
  extractPdfPage,
  reorderPdfPages,
  remapMarkupsOnPageDeletion,
  remapMarkupsOnPageInsertion,
  remapMarkupsOnPageReorder,
  remapCalibrationsOnPageDeletion,
  remapCalibrationsOnPageInsertion,
  remapCalibrationsOnPageReorder,
  remapViewportsOnPageReorder,
  mergePdfDocuments,
  MergeSourceDocument,
} from './pageOperations';
import { Markup, PageCalibration, MeasurementViewport } from '../../types/markup';

describe('Page Operations & Markup Remapping (Paquete 5)', () => {
  let samplePdfBytes: Uint8Array;

  beforeEach(async () => {
    // Generar PDF sintético de 3 páginas para pruebas
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]); // Pag 0
    doc.addPage([600, 800]); // Pag 1
    doc.addPage([600, 800]); // Pag 2
    samplePdfBytes = await doc.save();
  });

  describe('rotatePdfPage', () => {
    it('rota una página en 90 grados y actualiza el diccionario del PDF', async () => {
      const rotated = await rotatePdfPage(samplePdfBytes, 1, 90);
      const doc = await PDFDocument.load(rotated);

      expect(doc.getPage(0).getRotation().angle).toBe(0);
      expect(doc.getPage(1).getRotation().angle).toBe(90);
      expect(doc.getPage(2).getRotation().angle).toBe(0);
    });

    it('acumula rotaciones cíclicas (90 + 90 = 180)', async () => {
      const step1 = await rotatePdfPage(samplePdfBytes, 0, 90);
      const step2 = await rotatePdfPage(step1, 0, 90);
      const doc = await PDFDocument.load(step2);

      expect(doc.getPage(0).getRotation().angle).toBe(180);
    });

    it('lanza error si el índice de página está fuera de límites', async () => {
      await expect(rotatePdfPage(samplePdfBytes, 99, 90)).rejects.toThrow(
        'Page index out of range'
      );
    });
  });

  describe('deletePdfPage', () => {
    it('elimina la página indicada y reduce el total de páginas', async () => {
      const result = await deletePdfPage(samplePdfBytes, 1);
      const doc = await PDFDocument.load(result);

      expect(doc.getPageCount()).toBe(2);
    });

    it('rechaza la eliminación si el PDF tiene una sola página', async () => {
      const singleDoc = await PDFDocument.create();
      singleDoc.addPage([600, 800]);
      const singleBytes = await singleDoc.save();

      await expect(deletePdfPage(singleBytes, 0)).rejects.toThrow(
        'The only page of the document cannot be deleted'
      );
    });
  });

  describe('insertBlankPdfPage', () => {
    it('inserta una página en blanco en la posición deseada', async () => {
      const result = await insertBlankPdfPage(samplePdfBytes, 1, { width: 500, height: 700 });
      const doc = await PDFDocument.load(result);

      expect(doc.getPageCount()).toBe(4);
      expect(doc.getPage(1).getSize().width).toBe(500);
      expect(doc.getPage(1).getSize().height).toBe(700);
    });
  });

  describe('extractPdfPage', () => {
    it('extrae una página individual a un nuevo documento PDF de 1 página', async () => {
      const extracted = await extractPdfPage(samplePdfBytes, 2);
      const doc = await PDFDocument.load(extracted);

      expect(doc.getPageCount()).toBe(1);
      expect(doc.getPage(0).getSize().width).toBe(600);
    });
  });

  describe('reorderPdfPages (ADR-0082)', () => {
    it('mueve una página hacia adelante (de 0 a 2) y preserva el resto de páginas', async () => {
      // PDF sintético con tamaños distintos para identificar cada hoja
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]); // Hoja A
      doc.addPage([200, 200]); // Hoja B
      doc.addPage([300, 300]); // Hoja C
      const bytes = await doc.save();

      const reordered = await reorderPdfPages(bytes, 0, 2);
      const reloaded = await PDFDocument.load(reordered);

      expect(reloaded.getPageCount()).toBe(3);
      expect(reloaded.getPage(0).getSize().width).toBe(200); // Hoja B ahora es primera
      expect(reloaded.getPage(1).getSize().width).toBe(300); // Hoja C ahora es segunda
      expect(reloaded.getPage(2).getSize().width).toBe(100); // Hoja A ahora es tercera
    });

    it('mueve una página hacia atrás (de 2 a 0)', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([100, 100]); // Hoja A
      doc.addPage([200, 200]); // Hoja B
      doc.addPage([300, 300]); // Hoja C
      const bytes = await doc.save();

      const reordered = await reorderPdfPages(bytes, 2, 0);
      const reloaded = await PDFDocument.load(reordered);

      expect(reloaded.getPageCount()).toBe(3);
      expect(reloaded.getPage(0).getSize().width).toBe(300); // Hoja C pasa al inicio
      expect(reloaded.getPage(1).getSize().width).toBe(100); // Hoja A se desplaza
      expect(reloaded.getPage(2).getSize().width).toBe(200); // Hoja B se desplaza
    });

    it('devuelve los mismos bytes si fromIndex es igual a toIndex', async () => {
      const result = await reorderPdfPages(samplePdfBytes, 1, 1);
      expect(result).toBe(samplePdfBytes);
    });

    it('lanza error si fromIndex o toIndex están fuera de rango', async () => {
      await expect(reorderPdfPages(samplePdfBytes, -1, 1)).rejects.toThrow('out of range');
      await expect(reorderPdfPages(samplePdfBytes, 0, 10)).rejects.toThrow('out of range');
    });
  });

  describe('Remapeo de Marcas en Eliminación e Inserción', () => {
    const mockMarkups: Markup[] = [
      { id: 'm0', type: 'rectangle', pageIndex: 0 } as Markup,
      { id: 'm1_a', type: 'line', pageIndex: 1 } as Markup,
      { id: 'm1_b', type: 'cloud', pageIndex: 1 } as Markup,
      { id: 'm2', type: 'text', pageIndex: 2 } as Markup,
    ];

    it('remapMarkupsOnPageDeletion elimina las marcas de la página y decrementa las posteriores', () => {
      const remapped = remapMarkupsOnPageDeletion(mockMarkups, 1);

      expect(remapped).toHaveLength(2);
      expect(remapped[0].id).toBe('m0');
      expect(remapped[0].pageIndex).toBe(0);

      // m2 pasa de página 2 a página 1
      expect(remapped[1].id).toBe('m2');
      expect(remapped[1].pageIndex).toBe(1);
    });

    it('remapMarkupsOnPageInsertion incrementa el índice de las marcas en/posteriores a la inserción', () => {
      const remapped = remapMarkupsOnPageInsertion(mockMarkups, 1);

      expect(remapped).toHaveLength(4);
      expect(remapped[0].id).toBe('m0');
      expect(remapped[0].pageIndex).toBe(0);

      // m1_a y m1_b pasan de página 1 a página 2
      expect(remapped[1].id).toBe('m1_a');
      expect(remapped[1].pageIndex).toBe(2);
      expect(remapped[2].id).toBe('m1_b');
      expect(remapped[2].pageIndex).toBe(2);

      // m2 pasa de página 2 a página 3
      expect(remapped[3].id).toBe('m2');
      expect(remapped[3].pageIndex).toBe(3);
    });

    it('remapMarkupsOnPageReorder hacia adelante (de 0 a 2) desplaza la página 0 a 2 y las intermedias a la izquierda', () => {
      const remapped = remapMarkupsOnPageReorder(mockMarkups, 0, 2);

      // m0 pasa de 0 a 2
      expect(remapped.find((m) => m.id === 'm0')?.pageIndex).toBe(2);
      // m1_a y m1_b pasan de 1 a 0
      expect(remapped.find((m) => m.id === 'm1_a')?.pageIndex).toBe(0);
      expect(remapped.find((m) => m.id === 'm1_b')?.pageIndex).toBe(0);
      // m2 pasa de 2 a 1
      expect(remapped.find((m) => m.id === 'm2')?.pageIndex).toBe(1);
    });

    it('remapMarkupsOnPageReorder hacia atrás (de 2 a 0) desplaza la página 2 a 0 y las intermedias a la derecha', () => {
      const remapped = remapMarkupsOnPageReorder(mockMarkups, 2, 0);

      // m2 pasa de 2 a 0
      expect(remapped.find((m) => m.id === 'm2')?.pageIndex).toBe(0);
      // m0 pasa de 0 a 1
      expect(remapped.find((m) => m.id === 'm0')?.pageIndex).toBe(1);
      // m1_a y m1_b pasan de 1 a 2
      expect(remapped.find((m) => m.id === 'm1_a')?.pageIndex).toBe(2);
      expect(remapped.find((m) => m.id === 'm1_b')?.pageIndex).toBe(2);
    });

    it('remapMarkupsOnPageReorder con from === to devuelve las marcas intactas', () => {
      const remapped = remapMarkupsOnPageReorder(mockMarkups, 1, 1);
      expect(remapped).toBe(mockMarkups);
    });
  });

  describe('Remapeo de Calibraciones y Viewports (ADR-0082)', () => {
    const mockCalibrations: Record<number, PageCalibration> = {
      0: { scale: 0.01, unit: 'm', precision: 2 },
      1: { scale: 0.02, unit: 'm', precision: 2 },
      2: { scale: 0.05, unit: 'm', precision: 2 },
    };

    it('remapCalibrationsOnPageDeletion descarta la eliminada y desplaza las siguientes', () => {
      const remapped = remapCalibrationsOnPageDeletion(mockCalibrations, 1);

      expect(remapped[0].scale).toBe(0.01);
      expect(remapped[1].scale).toBe(0.05); // la anterior página 2
      expect(remapped[2]).toBeUndefined();
    });

    it('remapCalibrationsOnPageInsertion desplaza las calibraciones a la derecha', () => {
      const remapped = remapCalibrationsOnPageInsertion(mockCalibrations, 1);

      expect(remapped[0].scale).toBe(0.01);
      expect(remapped[1]).toBeUndefined(); // nueva página en blanco no calibrada
      expect(remapped[2].scale).toBe(0.02);
      expect(remapped[3].scale).toBe(0.05);
    });

    it('remapCalibrationsOnPageReorder reasigna las escalas correctamente (0 -> 2)', () => {
      const remapped = remapCalibrationsOnPageReorder(mockCalibrations, 0, 2);

      expect(remapped[0].scale).toBe(0.02); // antigua pág 1
      expect(remapped[1].scale).toBe(0.05); // antigua pág 2
      expect(remapped[2].scale).toBe(0.01); // antigua pág 0
    });

    it('remapCalibrationsOnPageReorder reasigna las escalas correctamente (2 -> 0)', () => {
      const remapped = remapCalibrationsOnPageReorder(mockCalibrations, 2, 0);

      expect(remapped[0].scale).toBe(0.05); // antigua pág 2
      expect(remapped[1].scale).toBe(0.01); // antigua pág 0
      expect(remapped[2].scale).toBe(0.02); // antigua pág 1
    });

    it('remapViewportsOnPageReorder reasigna los viewports por página', () => {
      const mockViewports: Record<number, MeasurementViewport[]> = {
        0: [{ id: 'vp0', name: 'Detail A', pageIndex: 0, bounds: { x: 0, y: 0, width: 100, height: 100 }, calibration: { scale: 0.1, unit: 'm' } }],
        1: [{ id: 'vp1', name: 'Detail B', pageIndex: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, calibration: { scale: 0.2, unit: 'm' } }],
      };

      const remapped = remapViewportsOnPageReorder(mockViewports, 0, 1);
      expect(remapped[0][0].id).toBe('vp1');
      expect(remapped[0][0].pageIndex).toBe(0);
      expect(remapped[1][0].id).toBe('vp0');
      expect(remapped[1][0].pageIndex).toBe(1);
    });
  });

  describe('mergePdfDocuments - Combinar Documentos PDF (ADR-0084)', () => {
    it('combina 2 documentos PDF de 1 y 2 páginas resultando en un PDF de 3 páginas', async () => {
      // Doc 1 (1 pág)
      const doc1 = await PDFDocument.create();
      doc1.addPage([500, 700]);
      const bytes1 = await doc1.save();

      // Doc 2 (2 págs)
      const doc2 = await PDFDocument.create();
      doc2.addPage([600, 800]);
      doc2.addPage([600, 800]);
      const bytes2 = await doc2.save();

      const sources: MergeSourceDocument[] = [
        { name: 'doc1.pdf', bytes: bytes1 },
        { name: 'doc2.pdf', bytes: bytes2 },
      ];

      const mergedBytes = await mergePdfDocuments(sources);
      const mergedDoc = await PDFDocument.load(mergedBytes);

      expect(mergedDoc.getPageCount()).toBe(3);
      expect(mergedDoc.getPage(0).getWidth()).toBe(500);
      expect(mergedDoc.getPage(1).getWidth()).toBe(600);
      expect(mergedDoc.getPage(2).getWidth()).toBe(600);
    });

    it('combina páginas seleccionadas específicas de múltiples documentos respetando el orden', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 400]); // Pag 0
      doc.addPage([500, 500]); // Pag 1
      doc.addPage([600, 600]); // Pag 2
      const bytes = await doc.save();

      const sources: MergeSourceDocument[] = [
        { name: 'part.pdf', bytes, pageIndices: [2, 0] },
      ];

      const mergedBytes = await mergePdfDocuments(sources);
      const mergedDoc = await PDFDocument.load(mergedBytes);

      expect(mergedDoc.getPageCount()).toBe(2);
      expect(mergedDoc.getPage(0).getWidth()).toBe(600); // antigua pág 2
      expect(mergedDoc.getPage(1).getWidth()).toBe(400); // antigua pág 0
    });

    it('lanza error si la lista de documentos a combinar está vacía', async () => {
      await expect(mergePdfDocuments([])).rejects.toThrow(
        'At least one document is required to merge'
      );
    });

    it('lanza error si un índice de página solicitado está fuera de rango', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([600, 800]);
      const bytes = await doc.save();

      const sources: MergeSourceDocument[] = [
        { name: 'doc.pdf', bytes, pageIndices: [5] },
      ];

      await expect(mergePdfDocuments(sources)).rejects.toThrow(
        'Page index out of range'
      );
    });
  });
});
