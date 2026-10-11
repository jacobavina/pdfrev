import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  IncrementalWriter,
  saveIncrementalMarkups,
  formatPdfDate,
  escapePdfString,
} from './incrementalWriter';
import { Markup } from '../../types/markup';

describe('Incremental Writer (P3-B.1 / ISO 32000-1 §7.5.6)', () => {
  const blueprintPath = path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf');
  const originalBytes = new Uint8Array(fs.readFileSync(blueprintPath));

  describe('Utilidades de formato PDF', () => {
    it('formatea fechas ISO a formato estándar PDF (D:YYYYMMDDHHmmSSZ)', () => {
      const formatted = formatPdfDate('2026-10-11T14:30:45Z');
      expect(formatted).toBe('(D:20261011143045Z)');
    });

    it('escapa paréntesis y barras invertidas en cadenas literales', () => {
      expect(escapePdfString('Texto normal')).toBe('(Texto normal)');
      expect(escapePdfString('Texto con (paréntesis)')).toBe('(Texto con \\(paréntesis\\))');
      expect(escapePdfString('Ruta C:\\archivos\\')).toBe('(Ruta C:\\\\archivos\\\\)');
    });
  });

  describe('IncrementalWriter de bajo nivel', () => {
    it('conserva el 100% de los bytes originales como prefijo inmutable (invariante dura)', () => {
      const writer = new IncrementalWriter(originalBytes);
      const objNum = writer.allocateObjectNumber();
      writer.addObject(objNum, '<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] >>');

      const updated = writer.build();
      expect(updated.length).toBeGreaterThan(originalBytes.length);

      // Comprobación de prefijo byte a byte
      const prefix = updated.subarray(0, originalBytes.length);
      for (let i = 0; i < originalBytes.length; i++) {
        expect(prefix[i]).toBe(originalBytes[i]);
      }
    });

    it('incluye sección xref, trailer con /Prev y %%EOF al final del documento', () => {
      const writer = new IncrementalWriter(originalBytes);
      const obj1 = writer.allocateObjectNumber();
      writer.addObject(obj1, '<< /Prueba 1 >>');

      const updated = writer.build();
      const text = new TextDecoder('latin1').decode(updated);

      expect(text).toContain('xref\n');
      expect(text).toContain('trailer\n<<');
      expect(text).toContain(`/Prev ${writer.prevStartXref}`);
      expect(text).toMatch(/startxref\s+\d+\s+%%EOF/);
    });
  });

  describe('saveIncrementalMarkups con marcas reales', () => {
    const testMarkups: Markup[] = [
      {
        id: 'mk-rect-test',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
        style: { strokeColor: '#0055ff', fillColor: '#e0edff', strokeWidth: 2, opacity: 1 },
        text: 'Caja de inspección estructural',
        author: 'Ing. Estructural Alfa',
        createdAt: '2026-10-11T12:00:00Z',
        updatedAt: '2026-10-11T12:00:00Z',
        status: 'accepted',
      },
      {
        id: 'mk-cloud-test',
        type: 'cloud',
        pageIndex: 0,
        points: [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.4 },
          { x: 0.6, y: 0.6 },
          { x: 0.4, y: 0.6 },
        ],
        style: { strokeColor: '#ff2200', strokeWidth: 1.5, opacity: 1 },
        author: 'Ing. Estructural Alfa',
        createdAt: '2026-10-11T12:00:00Z',
        updatedAt: '2026-10-11T12:00:00Z',
        customFields: { arcStep: 25 },
        status: 'pending',
      },
      {
        id: 'mk-sticky-test',
        type: 'stickyNote',
        pageIndex: 0,
        points: [{ x: 0.7, y: 0.7 }],
        style: { strokeColor: '#16a34a', fillColor: '#bbf7d0', strokeWidth: 1, opacity: 1 },
        text: 'Revisar anclajes en obra',
        author: 'Revisor Beta',
        createdAt: '2026-10-11T12:00:00Z',
        updatedAt: '2026-10-11T12:00:00Z',
        status: 'rejected',
      },
      {
        id: 'mk-hl-test',
        type: 'highlightVector',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.8 }, { x: 0.5, y: 0.85 }],
        style: { strokeColor: '#ffff00', strokeWidth: 1, opacity: 0.5 },
        author: 'Inspector Gama',
        createdAt: '2026-10-11T12:00:00Z',
        updatedAt: '2026-10-11T12:00:00Z',
        status: 'completed',
      },
    ];

    it('genera archivo con bytes originales intactos y reapertura limpia en pdf-lib y PDF.js', async () => {
      const updatedBytes = await saveIncrementalMarkups(originalBytes, testMarkups, {});

      // Invariante dura
      expect(updatedBytes.length).toBeGreaterThan(originalBytes.length);
      const prefix = updatedBytes.subarray(0, originalBytes.length);
      expect(Buffer.from(prefix).equals(Buffer.from(originalBytes))).toBe(true);

      // Reabrir con pdf-lib para asegurar validez estructural
      const pdfDoc = await PDFDocument.load(updatedBytes);
      expect(pdfDoc.getPageCount()).toBe(3);

      // Reabrir con PDF.js para verificar que las anotaciones son reconocidas
      const loadingTask = pdfjs.getDocument({
        data: updatedBytes,
        disableFontFace: true,
      });
      const docPdfJs = await loadingTask.promise;
      expect(docPdfJs.numPages).toBe(3);

      const page1 = await docPdfJs.getPage(1);
      const annots = await page1.getAnnotations();
      expect(annots.length).toBeGreaterThanOrEqual(4);

      await docPdfJs.destroy();
    });

    it('contiene anotaciones con claves /NM, /Contents, /REA y apariencia /AP', async () => {
      const updatedBytes = await saveIncrementalMarkups(originalBytes, testMarkups, {});
      const text = new TextDecoder('utf-8').decode(updatedBytes);

      // Claves canónicas presentes en el cuerpo agregado
      expect(text).toContain('/NM (mk-rect-test)');
      expect(text).toContain('/Contents (Caja de inspección estructural)');
      expect(text).toContain('/REA << /v 1 /tool (rectangle)');
      expect(text).toContain('/arcStep 25');
      expect(text).toContain('/AP << /N');
      expect(text).toContain('/Subtype /Square');
      expect(text).toContain('/Subtype /Polygon');
      expect(text).toContain('/Subtype /Text');
      expect(text).toContain('/Subtype /Highlight');

      // Anotaciones de estado de revisión estándar (/StateModel Review)
      expect(text).toContain('/StateModel (Review)');
      expect(text).toContain('/State (Accepted)');
      expect(text).toContain('/State (Rejected)');
      expect(text).toContain('/State (Completed)');
    });

    it('emite /LE, /Locked, /QuadPoints y subtipos para polyLine, underline y strikeOut', async () => {
      const p3Markups: Markup[] = [
        {
          id: 'mk-line-le',
          type: 'line',
          pageIndex: 0,
          points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
          style: {
            strokeColor: '#0284c7',
            strokeWidth: 2,
            opacity: 1,
            lineEndingStart: 'circle',
            lineEndingEnd: 'closedArrow',
          },
          locked: true,
          author: 'Tester',
          createdAt: '2026-10-11T12:00:00Z',
          updatedAt: '2026-10-11T12:00:00Z',
          status: 'pending',
        },
        {
          id: 'mk-polyline-annot',
          type: 'polyLine',
          pageIndex: 0,
          points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.4 }, { x: 0.6, y: 0.2 }],
          style: { strokeColor: '#0284c7', strokeWidth: 2, opacity: 1 },
          author: 'Tester',
          createdAt: '2026-10-11T12:00:00Z',
          updatedAt: '2026-10-11T12:00:00Z',
          status: 'pending',
        },
        {
          id: 'mk-underline-annot',
          type: 'underline',
          pageIndex: 0,
          points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.15 }],
          style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
          author: 'Tester',
          createdAt: '2026-10-11T12:00:00Z',
          updatedAt: '2026-10-11T12:00:00Z',
          status: 'pending',
        },
        {
          id: 'mk-strike-annot',
          type: 'strikeOut',
          pageIndex: 0,
          points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.25 }],
          style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
          author: 'Tester',
          createdAt: '2026-10-11T12:00:00Z',
          updatedAt: '2026-10-11T12:00:00Z',
          status: 'pending',
        },
      ];

      const updatedBytes = await saveIncrementalMarkups(originalBytes, p3Markups, {});
      const text = new TextDecoder('utf-8').decode(updatedBytes);

      // Verificación de /LE (Line Endings)
      expect(text).toContain('/LE [/Circle /ClosedArrow]');
      // Verificación de marca bloqueada (/F con bit 128 o /Locked)
      expect(text).toMatch(/\/F\s+132|\/Locked\s+true/);
      // Verificación de Subtypes
      expect(text).toContain('/Subtype /PolyLine');
      expect(text).toContain('/Subtype /Underline');
      expect(text).toContain('/Subtype /StrikeOut');
      // Verificación de QuadPoints para Underline y StrikeOut
      expect(text).toContain('/QuadPoints [');
    });
  });
});
