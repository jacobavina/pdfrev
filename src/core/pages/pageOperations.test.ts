import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  rotatePdfPage,
  deletePdfPage,
  insertBlankPdfPage,
  extractPdfPage,
  remapMarkupsOnPageDeletion,
  remapMarkupsOnPageInsertion,
  remapCalibrationsOnPageDeletion,
  remapCalibrationsOnPageInsertion,
} from './pageOperations';
import { Markup, PageCalibration } from '../../types/markup';

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
  });

  describe('Remapeo de Calibraciones', () => {
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
  });
});
