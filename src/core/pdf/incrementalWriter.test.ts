import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRef, PDFString } from 'pdf-lib';
import {
  IncrementalWriter,
  saveIncrementalMarkups,
  formatPdfDate,
  escapePdfString,
  toPdfName,
} from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { validateSavedPdf } from '../../services/pdfPersistenceService';
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
      expect(escapePdfString('Texto con (parentesis)')).toBe('(Texto con \\(parentesis\\))');
      expect(escapePdfString('Ruta C:\\archivos\\')).toBe('(Ruta C:\\\\archivos\\\\)');
    });

    it('serializa texto no ASCII (acentos, ñ) como UTF-16BE con BOM, legible en Acrobat y Revu', () => {
      expect(escapePdfString('Técnico')).toBe('<FEFF005400E90063006E00690063006F>');
      expect(escapePdfString('ñ')).toBe('<FEFF00F1>');
    });

    it('codifica claves arbitrarias como nombres PDF válidos (#xx)', () => {
      expect(toPdfName('Coste')).toBe('/Coste');
      expect(toPdfName('Coste unitario (€)')).toBe('/Coste#20unitario#20#28#E2#82#AC#29');
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
      // Texto con acentos: UTF-16BE con BOM (un literal UTF-8 se vería como "inspecciÃ³n" en Acrobat/Revu)
      expect(text).toContain(`/Contents ${escapePdfString('Caja de inspección estructural')}`);
      expect(escapePdfString('Caja de inspección estructural').startsWith('<FEFF')).toBe(true);
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
        {
          id: 'mk-squiggly-annot',
          type: 'squiggly',
          pageIndex: 0,
          points: [{ x: 0.1, y: 0.3 }, { x: 0.4, y: 0.35 }],
          style: { strokeColor: '#e02424', strokeWidth: 1.5, opacity: 1 },
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
      expect(text).toContain('/Subtype /Squiggly');
      // Verificación de QuadPoints para Underline, StrikeOut y Squiggly
      expect(text).toContain('/QuadPoints [');
    });
  });

  describe('Guardados repetidos, borrados y anotaciones ajenas (auditoría 2026-10-11)', () => {
    const baseMarkup: Markup = {
      id: 'mk-repetida',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      author: 'Revisor Técnico',
      createdAt: '2026-10-11T12:00:00Z',
      updatedAt: '2026-10-11T12:00:00Z',
      status: 'accepted',
    };

    /** Cuenta las anotaciones listadas en /Annots de la página 1, separando las de REA y los estados. */
    async function annotSummary(bytes: Uint8Array) {
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      const annots = doc.getPages()[0].node.Annots();
      const out = { total: 0, rea: 0, states: 0, foreign: 0 };
      if (!(annots instanceof PDFArray)) return out;
      for (let i = 0; i < annots.size(); i++) {
        const d = doc.context.lookup(annots.get(i));
        if (!(d instanceof PDFDict)) continue;
        out.total++;
        if (d.get(PDFName.of('REA')) instanceof PDFDict) out.rea++;
        else if (d.get(PDFName.of('StateModel')) !== undefined) out.states++;
        else out.foreign++;
      }
      return out;
    }

    /** PDF con una anotación ajena (sin /REA ni /NM), como la que dejaría otro visor. */
    async function withForeignSquare(): Promise<Uint8Array> {
      const doc = await PDFDocument.load(originalBytes);
      const page = doc.getPages()[0];
      const annot = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Square',
        Rect: [50, 50, 150, 150],
        C: [0, 0, 1],
        Contents: PDFString.of('Marca de otro visor'),
      });
      page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));
      return doc.save({ useObjectStreams: false });
    }

    it('guardar tres veces la misma marca deja UNA anotación y UN estado (sin duplicados)', async () => {
      let bytes: Uint8Array = originalBytes;
      for (let i = 0; i < 3; i++) {
        bytes = await saveIncrementalMarkups(bytes, [baseMarkup]);
      }
      const s = await annotSummary(bytes);
      expect(s.rea).toBe(1);
      expect(s.states).toBe(1);
      await expect(validateSavedPdf(originalBytes, bytes, [baseMarkup])).resolves.toBeUndefined();
    });

    it('una marca borrada desaparece del PDF al guardar', async () => {
      const once = await saveIncrementalMarkups(originalBytes, [baseMarkup]);
      const afterDelete = await saveIncrementalMarkups(once, []);
      const s = await annotSummary(afterDelete);
      expect(s.rea).toBe(0);
      expect(s.states).toBe(0);
    });

    it('conserva intacta una anotación ajena que no se importó', async () => {
      const foreignPdf = await withForeignSquare();
      const saved = await saveIncrementalMarkups(foreignPdf, [baseMarkup]);
      const s = await annotSummary(saved);
      expect(s.foreign).toBe(1);
      expect(s.rea).toBe(1);
    });

    it('una anotación ajena importada se reescribe una sola vez y, si el usuario la borra, se retira', async () => {
      const foreignPdf = await withForeignSquare();
      const imported = await importPdfAnnotations(foreignPdf);
      expect(imported.markups).toHaveLength(1);
      const importedIds = imported.markups.map((m) => m.id);

      // Guardar con la marca importada en el modelo: no queda duplicada (ajena original + copia de REA)
      const kept = await saveIncrementalMarkups(foreignPdf, imported.markups, {}, { importedIds });
      const s1 = await annotSummary(kept);
      expect(s1.foreign).toBe(0);
      expect(s1.rea).toBe(1);

      // Guardar tras borrarla del modelo: se retira del PDF
      const removed = await saveIncrementalMarkups(foreignPdf, [], {}, { importedIds });
      const s2 = await annotSummary(removed);
      expect(s2.foreign + s2.rea).toBe(0);
    });

    it('ida y vuelta de campos personalizados con espacios, paréntesis, acentos y números', async () => {
      const m: Markup = {
        ...baseMarkup,
        id: 'mk-campos',
        text: 'Revisión (ver detalle) \\ ñandú',
        customFields: { 'Coste unitario (€)': 12.5, Nota: 'Ver plano (A-101) \\ revisión' },
      };
      const saved = await saveIncrementalMarkups(originalBytes, [m]);
      const back = await importPdfAnnotations(saved);
      const r = back.markups.find((x) => x.id === 'mk-campos');
      expect(r).toBeDefined();
      expect(r!.author).toBe('Revisor Técnico');
      expect(r!.text).toBe('Revisión (ver detalle) \\ ñandú');
      expect(r!.customFields?.['Coste unitario (€)']).toBe(12.5);
      expect(r!.customFields?.Nota).toBe('Ver plano (A-101) \\ revisión');
    });

    it('la validación rechaza un PDF con una marca duplicada', async () => {
      const once = await saveIncrementalMarkups(originalBytes, [baseMarkup]);
      // Simula el escritor antiguo: añade otra copia sin retirar la primera
      const writer = new IncrementalWriter(once);
      const doc = await PDFDocument.load(once);
      const page = doc.getPages()[0];
      const existing = page.node.Annots() as PDFArray;
      const dupNum = writer.allocateObjectNumber();
      writer.addObject(
        dupNum,
        `<< /Type /Annot /Subtype /Square /Rect [0 0 10 10] /NM (mk-repetida) /REA << /v 1 >> >>`
      );
      page.node.set(PDFName.of('Annots'), doc.context.obj([...existing.asArray(), PDFRef.of(dupNum, 0)]));
      writer.addObject(page.ref.objectNumber, page.node.toString());
      const duplicated = writer.build();
      await expect(validateSavedPdf(originalBytes, duplicated, [baseMarkup])).rejects.toThrow(/2 times/);
    });
  });
});
