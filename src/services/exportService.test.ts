import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import {
  sanitizeCsvCell,
  escapeCsvField,
  buildCsvContent,
  buildPdfReportContent,
  appendPdfSummaryReport,
} from './exportService';
import { Markup, BbxCustomColumn } from '../types/markup';

describe('Export Service (P2-C.4)', () => {
  describe('Mitigación de Inyección de Fórmulas y Escape RFC 4180', () => {
    it('desactiva fórmulas prefijando con comilla simple valores que inician con =, +, -, @, \\t', () => {
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvCell('+12345')).toBe("'+12345");
      expect(sanitizeCsvCell('-cmd|/C')).toBe("'-cmd|/C");
      expect(sanitizeCsvCell('@SUM(1+1)')).toBe("'@SUM(1+1)");
      expect(sanitizeCsvCell('\tTabInjected')).toBe("'\tTabInjected");
      expect(sanitizeCsvCell('Texto normal')).toBe('Texto normal');
      expect(sanitizeCsvCell('')).toBe('');
    });

    it('escapa campos con comas, saltos de línea y comillas dobles duplicándolas', () => {
      expect(escapeCsvField('Texto simple')).toBe('Texto simple');
      expect(escapeCsvField('Texto, con coma')).toBe('"Texto, con coma"');
      expect(escapeCsvField('Texto "entre comillas"')).toBe('"Texto ""entre comillas"""');
      expect(escapeCsvField('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"');
      // Inyección combinada con comas:
      expect(escapeCsvField('=cmd|"/C calc",1')).toBe('"\'=cmd|""/C calc"",1"');
    });
  });

  describe('Generación de Archivo CSV (Bytes Reales y BOM UTF-8)', () => {
    const mockMarkups: Markup[] = [
      {
        id: 'm1',
        type: 'rectangle',
        pageIndex: 0,
        text: 'Revisar cota estructural',
        author: 'Arquitecto A',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'accepted',
        style: { strokeColor: '#0055ff', strokeWidth: 2, opacity: 1 },
        points: [{ x: 10, y: 10 }],
        customFields: { col_coste: 1500 },
      },
      {
        id: 'm2',
        type: 'cloud',
        pageIndex: 1,
        text: '=DDE("calc";"A1")', // intento de fórmula
        author: 'Ingeniero B',
        createdAt: '2026-10-11T11:00:00Z',
        updatedAt: '2026-10-11T11:00:00Z',
        status: 'rejected',
        style: { strokeColor: '#ff2200', strokeWidth: 2, opacity: 1 },
        points: [{ x: 50, y: 50 }],
        customFields: { col_coste: 250 },
      },
    ];

    const mockCustomColumns: BbxCustomColumn[] = [
      {
        id: 'col_coste',
        nombre: 'Presupuesto (€)',
        tipo: 'number',
      },
      {
        id: 'col_calc',
        nombre: 'Total Estimado',
        tipo: 'formula',
        expresion: '[col_coste] * 1.21',
      },
    ];

    const evaluatedFields = {
      m1: { col_calc: 1815 },
      m2: { col_calc: 302.5 },
    };

    it('genera archivo CSV con BOM UTF-8 (\xEF\xBB\xBF) en los 3 primeros bytes', () => {
      const bytes = buildCsvContent(mockMarkups, mockCustomColumns, evaluatedFields);
      expect(bytes.length).toBeGreaterThan(3);

      // Verificación estricta de BOM
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);
    });

    it('utiliza retornos de línea CRLF (\\r\\n) en todas las filas', () => {
      const bytes = buildCsvContent(mockMarkups, mockCustomColumns, evaluatedFields);
      const text = new TextDecoder('utf-8').decode(bytes.slice(3));

      // Cada salto de línea debe ser \r\n
      const lines = text.split('\r\n');
      expect(lines.length).toBe(4); // Cabecera + 2 filas + línea final vacía
      expect(lines[0]).toContain(
        'Page,Type,Comment,Author,Date,Status,Color,Measurement,Unit,Presupuesto (€),Total Estimado'
      );
    });

    it('incluye valores calculados y sanitiza fórmulas en las filas de datos', () => {
      const bytes = buildCsvContent(mockMarkups, mockCustomColumns, evaluatedFields);
      const text = new TextDecoder('utf-8').decode(bytes.slice(3));

      // Fila 1 (sin medida)
      expect(text).toContain(
        '1,rectangle,Revisar cota estructural,Arquitecto A,2026-10-11T10:00:00Z,accepted,#0055ff,,,1500,1815'
      );

      // Fila 2: la fórmula debe estar desarmada con comilla simple
      expect(text).toContain(
        "2,cloud,\"'=DDE(\"\"calc\"\";\"\"A1\"\")\",Ingeniero B,2026-10-11T11:00:00Z,rejected,#ff2200,,,250,302.5"
      );
    });

    it('incluye columnas Medida y Unidad correctamente formateadas para marcas de takeoff', () => {
      const measureMarkup: Markup = {
        id: 'm-meas-1',
        type: 'length',
        pageIndex: 0,
        text: 'Tramo tubería',
        author: 'Topógrafo',
        createdAt: '2026-10-11T12:00:00Z',
        updatedAt: '2026-10-11T12:00:00Z',
        status: 'accepted',
        style: { strokeColor: '#00aa00', strokeWidth: 2, opacity: 1 },
        points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }],
        measurement: {
          value: 12.5,
          unit: 'm',
          formatted: '12.50 m',
        },
      };

      const bytes = buildCsvContent([measureMarkup]);
      const text = new TextDecoder('utf-8').decode(bytes.slice(3));
      expect(text).toContain('1,length,Tramo tubería,Topógrafo,2026-10-11T12:00:00Z,accepted,#00aa00,12.50 m,m');
    });
  });

  describe('Generación de Reporte Resumen en PDF (pdf-lib)', () => {
    const mockMarkups: Markup[] = Array.from({ length: 15 }, (_, i) => ({
      id: `mk-${i + 1}`,
      type: i % 2 === 0 ? 'rectangle' : 'callout',
      pageIndex: i % 3,
      text: `Nota técnica de inspección número ${i + 1}`,
      author: i % 2 === 0 ? 'Revisor Alfa' : 'Revisor Beta',
      createdAt: '2026-10-11T12:00:00Z',
      updatedAt: '2026-10-11T12:00:00Z',
      status: (i % 3 === 0 ? 'accepted' : i % 3 === 1 ? 'rejected' : 'pending') as Markup['status'],
      style: { strokeColor: '#0088cc', strokeWidth: 2, opacity: 1 },
      points: [{ x: 10, y: 10 }],
    }));

    it('construye un documento PDF válido con cabecera y conteo correcto de marcas', async () => {
      const bytes = await buildPdfReportContent('Plano-Estructural-Piso1.pdf', mockMarkups);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(100);

      // Reabrir los bytes reales con pdf-lib para validar estructura
      const pdfDoc = await PDFDocument.load(bytes);
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);

      // El encabezado PDF estándar debe estar en el prefijo
      const header = new TextDecoder('latin1').decode(bytes.slice(0, 8));
      expect(header).toMatch(/^%PDF-1\./);
    });

    it('soporta documentos con 0 marcas sin fallar ni corromper el PDF', async () => {
      const bytes = await buildPdfReportContent('Plano-Vacio.pdf', []);
      const pdfDoc = await PDFDocument.load(bytes);
      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it('genera múltiples páginas cuando el número de marcas excede la altura disponible', async () => {
      const manyMarkups: Markup[] = Array.from({ length: 80 }, (_, i) => ({
        id: `many-${i}`,
        type: 'rectangle',
        pageIndex: 0,
        text: `Detalle extenso de elemento estructural ${i}`,
        author: 'Inspector Principal',
        status: 'accepted',
        createdAt: '2026-10-11T12:00:00Z',
        updatedAt: '2026-10-11T12:00:00Z',
        style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
        points: [{ x: 0, y: 0 }],
      }));

      const bytes = await buildPdfReportContent('Plano-Denso.pdf', manyMarkups);
      const pdfDoc = await PDFDocument.load(bytes);
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(2);
    });

    it('genera hipervínculos /Link en el reporte PDF hacia la página de cada marca tanto en reporte anexo como independiente', async () => {
      const markups: Markup[] = [
        {
          id: 'mk-p0',
          type: 'area',
          subject: 'Piso Cerámico',
          pageIndex: 0,
          text: 'Zona A',
          author: 'Aparejador',
          status: 'accepted',
          createdAt: '2026-10-17T10:00:00Z',
          updatedAt: '2026-10-17T10:00:00Z',
          style: { strokeColor: '#0055ff', strokeWidth: 1, opacity: 1 },
          points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }],
          measurement: { value: 25.5, unit: 'm', formatted: '25.50 m²' },
          unitPrice: 35,
          cost: 892.5,
        },
        {
          id: 'mk-p1',
          type: 'count',
          subject: 'Puertas Cortafuegos',
          pageIndex: 1,
          text: 'Puerta EI2-60',
          author: 'Inspector',
          status: 'pending',
          createdAt: '2026-10-17T10:00:00Z',
          updatedAt: '2026-10-17T10:00:00Z',
          style: { strokeColor: '#ff2200', strokeWidth: 1, opacity: 1 },
          points: [{ x: 0.5, y: 0.5 }],
          measurement: { value: 1, unit: 'm', formatted: '1' },
          unitPrice: 450,
          cost: 450,
        },
      ];

      // 1. Reporte independiente (Standalone): enlaces con /GoToR hacia el plano y destino de página
      const standaloneBytes = await buildPdfReportContent('Plano-Estructural.pdf', markups);
      const standaloneDoc = await PDFDocument.load(standaloneBytes);
      const reportPage = standaloneDoc.getPages()[0];
      const annots = reportPage.node.Annots() as PDFArray;
      expect(annots).toBeDefined();
      expect(annots.size()).toBe(2);

      const annot0Dict = standaloneDoc.context.lookup(annots.get(0)) as PDFDict;
      expect(annot0Dict.get(PDFName.of('Subtype'))?.toString()).toBe('/Link');
      const action0 = annot0Dict.get(PDFName.of('A')) as PDFDict;
      expect(action0.get(PDFName.of('S'))?.toString()).toBe('/GoToR');
      // Conforme a ISO 32000-1 §12.6.4.3 y §7.11.2, /F debe ser un PDFString (File Specification)
      expect(action0.get(PDFName.of('F'))?.toString()).toContain('Plano-Estructural.pdf');

      // 2. Reporte anexo (Appended): páginas añadidas al final del plano con enlaces internos /GoTo /Dest a cada hoja
      const blueprintDoc = await PDFDocument.create();
      blueprintDoc.addPage([800, 600]); // Hoja 1 (índice 0)
      blueprintDoc.addPage([800, 600]); // Hoja 2 (índice 1)
      const blueprintBytes = await blueprintDoc.save();

      const combinedBytes = await appendPdfSummaryReport(blueprintBytes, 'Plano-Estructural.pdf', markups);
      const combinedDoc = await PDFDocument.load(combinedBytes);
      expect(combinedDoc.getPageCount()).toBe(3); // 2 hojas de plano + 1 hoja de informe

      const combinedReportPage = combinedDoc.getPages()[2];
      const combinedAnnots = combinedReportPage.node.Annots() as PDFArray;
      expect(combinedAnnots.size()).toBe(2);

      const combinedAnnot0 = combinedDoc.context.lookup(combinedAnnots.get(0)) as PDFDict;
      expect(combinedAnnot0.get(PDFName.of('Subtype'))?.toString()).toBe('/Link');
      const dest0 = combinedAnnot0.get(PDFName.of('Dest')) as PDFArray;
      expect(dest0.get(0).toString()).toBe(combinedDoc.getPage(0).ref.toString());

      const combinedAnnot1 = combinedDoc.context.lookup(combinedAnnots.get(1)) as PDFDict;
      const dest1 = combinedAnnot1.get(PDFName.of('Dest')) as PDFArray;
      expect(dest1.get(0).toString()).toBe(combinedDoc.getPage(1).ref.toString());

      // 3. Verificación con PDF.js: los enlaces son reconocidos como Links estándar con rectángulos válidos
      const pdf = await pdfjs.getDocument({ data: combinedBytes, disableFontFace: true }).promise;
      const pdfJsRepPage = await pdf.getPage(3);
      const pdfJsAnnots = await pdfJsRepPage.getAnnotations();
      expect(pdfJsAnnots).toHaveLength(2);
      expect(pdfJsAnnots[0].subtype).toBe('Link');
      expect(pdfJsAnnots[0].rect).toBeDefined();
      expect(pdfJsAnnots[0].rect[2] - pdfJsAnnots[0].rect[0]).toBeGreaterThan(10);
      await pdf.destroy();
    });

    it('permite desactivar la generación de enlaces si includeHyperlinks es false', async () => {
      const markups: Markup[] = [
        {
          id: 'mk-no-link',
          type: 'line',
          pageIndex: 0,
          text: 'Trazado',
          author: 'Autor',
          status: 'pending',
          createdAt: '2026-10-17T10:00:00Z',
          updatedAt: '2026-10-17T10:00:00Z',
          style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
          points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        },
      ];

      const bytes = await buildPdfReportContent('Doc.pdf', markups, { includeHyperlinks: false });
      const doc = await PDFDocument.load(bytes);
      const annots = doc.getPages()[0].node.Annots();
      expect(!annots || annots.size() === 0).toBe(true);
    });

    it('incluye resumen de Subject y costes totales en el encabezado cuando existen mediciones de takeoff', async () => {
      const takeoffMarkups: Markup[] = [
        {
          id: 't-1',
          type: 'area',
          subject: 'Pintura Epoxi',
          pageIndex: 0,
          text: 'Suelo nave',
          author: 'Medidor',
          status: 'accepted',
          createdAt: '2026-10-17T10:00:00Z',
          updatedAt: '2026-10-17T10:00:00Z',
          style: { strokeColor: '#00aa00', strokeWidth: 1, opacity: 1 },
          points: [{ x: 0, y: 0 }],
          measurement: { value: 100, unit: 'm', formatted: '100.00 m²' },
          unitPrice: 20,
          cost: 2000, // $2,000.00
        },
      ];

      const bytes = await buildPdfReportContent('Nave-Industrial.pdf', takeoffMarkups);
      const pdf = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
      const p = await pdf.getPage(1);
      const content = await p.getTextContent();
      const strings = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
      expect(strings).toContain('Takeoff & Markup Summary Report');
      expect(strings).toContain('Pintura Epoxi');
      expect(strings).toContain('Total Takeoff Cost: $2000.00');
      await pdf.destroy();
    });
  });
});
