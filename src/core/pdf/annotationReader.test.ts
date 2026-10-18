import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations, parsePdfDateToIso } from './annotationReader';
import { Markup } from '../../types/markup';

describe('PDF Annotation Reader (P3-B.4 / Interoperabilidad e Importación)', () => {
  const blueprintPath = path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf');
  const originalBytes = new Uint8Array(fs.readFileSync(blueprintPath));

  it('retorna lista vacía en un PDF sin anotaciones', async () => {
    const result = await importPdfAnnotations(originalBytes);
    expect(result.markups).toEqual([]);
    expect(result.foreignUnsupportedCount).toBe(0);
  });

  it('recupera marcas REA guardadas incrementalmente (round-trip de persistencia)', async () => {
    const testMarkups: Markup[] = [
      {
        id: 'mk-rect-1',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
        style: { strokeColor: '#0055ff', fillColor: '#e0edff', strokeWidth: 2, opacity: 1 },
        text: 'Viga principal V-101',
        author: 'Calculista Principal',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'accepted',
        customFields: { Disciplina: 'Estructuras', Prioridad: 'Alta' },
      },
      {
        id: 'mk-cloud-1',
        type: 'cloud',
        pageIndex: 0,
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.7, y: 0.5 },
          { x: 0.7, y: 0.7 },
          { x: 0.5, y: 0.7 },
        ],
        style: { strokeColor: '#ff0000', strokeWidth: 1.5, opacity: 1 },
        author: 'Arquitecto Coordinador',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'rejected',
        customFields: { arcStep: 28 },
      },
      {
        id: 'mk-line-1',
        type: 'line',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.8 }, { x: 0.6, y: 0.9 }],
        style: { strokeColor: '#00aa00', strokeWidth: 3, opacity: 1 },
        author: 'Topógrafo',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'completed',
      },
    ];

    const pdfUpdated = await saveIncrementalMarkups(originalBytes, testMarkups);
    const result = await importPdfAnnotations(pdfUpdated);

    expect(result.foreignUnsupportedCount).toBe(0);
    expect(result.markups.length).toBe(3);

    // Verificar rectángulo
    const rect = result.markups.find((m) => m.id === 'mk-rect-1');
    expect(rect).toBeDefined();
    expect(rect?.type).toBe('rectangle');
    expect(rect?.text).toBe('Viga principal V-101');
    expect(rect?.author).toBe('Calculista Principal');
    expect(rect?.status).toBe('accepted');
    expect(rect?.createdAt).toBe('2026-10-11T10:00:00.000Z');
    expect(rect?.updatedAt).toBe('2026-10-11T10:00:00.000Z');
    expect(rect?.style.strokeColor.toLowerCase()).toBe('#0055ff');
    expect(rect?.style.fillColor?.toLowerCase()).toBe('#e0edff');
    expect(rect?.customFields?.Disciplina).toBe('Estructuras');
    expect(rect?.customFields?.Prioridad).toBe('Alta');

    // Verificar nube con arcStep
    const cloud = result.markups.find((m) => m.id === 'mk-cloud-1');
    expect(cloud).toBeDefined();
    expect(cloud?.type).toBe('cloud');
    expect(cloud?.status).toBe('rejected');
    expect(cloud?.customFields?.arcStep).toBe(28);

    // Verificar línea y estado completed
    const line = result.markups.find((m) => m.id === 'mk-line-1');
    expect(line).toBeDefined();
    expect(line?.type).toBe('line');
    expect(line?.status).toBe('completed');
    expect(line?.points.length).toBe(2);
    expect(line?.points[0].x).toBeCloseTo(0.2, 2);
    expect(line?.points[0].y).toBeCloseTo(0.8, 2);
    expect(line?.points[1].x).toBeCloseTo(0.6, 2);
    expect(line?.points[1].y).toBeCloseTo(0.9, 2);
  });

  it('importa anotaciones foráneas estándar (sin metadatos REA) y cuenta no soportadas', async () => {
    // Creamos un PDF con pdf-lib con anotaciones estándar directamente en el diccionario de la página
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);

    // Anotación 1: Square nativo sin /REA
    const squareDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Square',
      Rect: [100, 100, 200, 200],
      C: [1, 0, 0], // Rojo
      Contents: PDFString.of('Cuadro foráneo de Bluebeam'),
      T: PDFString.of('Usuario Externo'),
      NM: PDFString.of('ext-annot-123'),
    });
    const squareRef = doc.context.register(squareDict);

    // Anotación 2: /Caret, sin equivalente en REA (se conserva en el PDF y se cuenta como no editable)
    const caretDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Caret',
      Rect: [50, 50, 80, 80],
    });
    const caretRef = doc.context.register(caretDict);

    // Anotación 3: /Link ajeno: se conserva y se puede seguir en el visor, no cuenta como no editable (ADR-0027)
    const linkRef = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [90, 90, 120, 120] }));

    const annotsArray = doc.context.obj([squareRef, caretRef, linkRef]);
    page.node.set(PDFName.of('Annots'), annotsArray);

    const pdfBytes = await doc.save();
    const result = await importPdfAnnotations(pdfBytes);

    expect(result.foreignUnsupportedCount).toBe(1); // Solo el /Caret
    expect(result.markups.length).toBe(1);

    const imported = result.markups[0];
    expect(imported.id).toBe('ext-annot-123');
    expect(imported.type).toBe('rectangle');
    expect(imported.author).toBe('Usuario Externo');
    expect(imported.text).toBe('Cuadro foráneo de Bluebeam');
    expect(imported.style.strokeColor.toLowerCase()).toBe('#ff0000');
  });

  it('importa correctamente anotaciones con /LE, /Locked, polyLine, underline y strikeOut', async () => {
    const p3Markups: Markup[] = [
      {
        id: 'mk-line-arrows',
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
        author: 'Revisor P3',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'pending',
      },
      {
        id: 'mk-poly-roundtrip',
        type: 'polyLine',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.5 }, { x: 0.7, y: 0.3 }],
        style: { strokeColor: '#10b981', strokeWidth: 3, opacity: 1 },
        author: 'Revisor P3',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'pending',
      },
      {
        id: 'mk-und-roundtrip',
        type: 'underline',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.15 }],
        style: { strokeColor: '#e02424', strokeWidth: 1.5, opacity: 1 },
        author: 'Revisor P3',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'pending',
      },
      {
        id: 'mk-strk-roundtrip',
        type: 'strikeOut',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.25 }],
        style: { strokeColor: '#e02424', strokeWidth: 1.5, opacity: 1 },
        author: 'Revisor P3',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'pending',
      },
      {
        id: 'mk-sqg-roundtrip',
        type: 'squiggly',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.3 }, { x: 0.35, y: 0.34 }],
        style: { strokeColor: '#e02424', strokeWidth: 1.5, opacity: 1 },
        author: 'Revisor P3',
        createdAt: '2026-10-11T10:00:00Z',
        updatedAt: '2026-10-11T10:00:00Z',
        status: 'pending',
      },
    ];

    const pdfUpdated = await saveIncrementalMarkups(originalBytes, p3Markups);
    const result = await importPdfAnnotations(pdfUpdated);

    expect(result.foreignUnsupportedCount).toBe(0);
    expect(result.markups.length).toBe(5);

    const line = result.markups.find((m) => m.id === 'mk-line-arrows')!;
    expect(line).toBeDefined();
    expect(line.style.lineEndingStart).toBe('circle');
    expect(line.style.lineEndingEnd).toBe('closedArrow');
    expect(line.locked).toBe(true);

    const poly = result.markups.find((m) => m.id === 'mk-poly-roundtrip')!;
    expect(poly).toBeDefined();
    expect(poly.type).toBe('polyLine');
    expect(poly.points.length).toBe(3);

    const und = result.markups.find((m) => m.id === 'mk-und-roundtrip')!;
    expect(und).toBeDefined();
    expect(und.type).toBe('underline');

    const strk = result.markups.find((m) => m.id === 'mk-strk-roundtrip')!;
    expect(strk).toBeDefined();
    expect(strk.type).toBe('strikeOut');

    const sqg = result.markups.find((m) => m.id === 'mk-sqg-roundtrip')!;
    expect(sqg).toBeDefined();
    expect(sqg.type).toBe('squiggly');
  });

  it('importa anotación ajena /Subtype /Squiggly con /QuadPoints como marca squiggly (ADR-0072)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);

    const sqgDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Squiggly',
      Rect: [120, 280, 300, 300],
      QuadPoints: [120, 300, 300, 300, 120, 280, 300, 280],
      C: [0.88, 0.14, 0.14],
      Contents: PDFString.of('Término dudoso'),
      T: PDFString.of('Ing. Revisor'),
      NM: PDFString.of('ext-squiggly-1'),
    });
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(sqgDict)]));

    const pdfBytes = await doc.save();
    const result = await importPdfAnnotations(pdfBytes);

    expect(result.foreignUnsupportedCount).toBe(0);
    expect(result.markups).toHaveLength(1);
    expect(result.markups[0].type).toBe('squiggly');
    expect(result.markups[0].id).toBe('ext-squiggly-1');
    expect(result.markups[0].text).toBe('Término dudoso');
    expect(result.markups[0].points[0].x).toBeCloseTo(120 / 600, 3);
    expect(result.markups[0].points[1].x).toBeCloseTo(300 / 600, 3);
  });

  it('preserva la opacidad translúcida del relleno (/ca y /fillColor) en marcas de área en round-trip', async () => {
    const areaMarkup: Markup = {
      id: 'mk-area-opacity',
      type: 'area',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.2 },
        { x: 0.6, y: 0.6 },
        { x: 0.2, y: 0.6 },
      ],
      style: {
        strokeColor: '#dc2626',
        fillColor: 'rgba(220, 38, 38, 0.2)',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Revisor Medición',
      createdAt: '2026-10-17T12:00:00Z',
      updatedAt: '2026-10-17T12:00:00Z',
      status: 'pending',
      measurement: {
        value: 12.5,
        unit: 'm',
        formatted: '12.50 m²',
      },
    };

    const pdfUpdated = await saveIncrementalMarkups(originalBytes, [areaMarkup]);
    const pdfText = new TextDecoder('latin1').decode(pdfUpdated);
    expect(pdfText).toContain('/ca 0.200');

    const result = await importPdfAnnotations(pdfUpdated);
    expect(result.markups).toHaveLength(1);
    const importedArea = result.markups[0];
    expect(importedArea.type).toBe('area');
    expect(importedArea.style.fillColor).toBe('rgba(220, 38, 38, 0.2)');
  });

  it('importa medición de área de Revu con /ca 0.3 reconstruyendo relleno translúcido', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);

    const annotDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Polygon',
      IT: 'PolygonDimension',
      Rect: [100, 100, 300, 300],
      Vertices: [100, 100, 300, 100, 300, 300, 100, 300],
      C: [1, 0, 0],
      IC: [1, 0, 0],
      CA: 1,
      ca: 0.3,
      Contents: PDFString.of('15.00 m²'),
      T: PDFString.of('Bluebeam Revu User'),
      NM: PDFString.of('revu-area-1'),
    });
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annotDict)]));

    const pdfBytes = await doc.save();
    const result = await importPdfAnnotations(pdfBytes);

    expect(result.markups).toHaveLength(1);
    expect(result.markups[0].type).toBe('area');
    expect(result.markups[0].style.fillColor).toBe('rgba(255, 0, 0, 0.3)');
  });

  it('auto-sana áreas antiguas guardadas sin /ca explícito para no tapar el plano con rojo sólido', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);

    const annotDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Polygon',
      IT: 'PolygonDimension',
      Rect: [100, 100, 300, 300],
      Vertices: [100, 100, 300, 100, 300, 300, 100, 300],
      C: [0.86, 0.15, 0.15],
      IC: [0.86, 0.15, 0.15],
      Contents: PDFString.of('12.50 m²'),
      T: PDFString.of('Old Version'),
      NM: PDFString.of('legacy-area-1'),
    });
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annotDict)]));

    const pdfBytes = await doc.save();
    const result = await importPdfAnnotations(pdfBytes);

    expect(result.markups).toHaveLength(1);
    expect(result.markups[0].type).toBe('area');
    expect(result.markups[0].style.fillColor).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.25\)$/);
  });

  it('no degrada ni multiplica el alpha de relleno cuando la marca tiene opacidad global < 1', async () => {
    const areaMarkup: Markup = {
      id: 'mk-area-half-opacity',
      type: 'area',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      style: {
        strokeColor: '#dc2626',
        fillColor: 'rgba(220, 38, 38, 0.2)',
        strokeWidth: 2,
        opacity: 0.5,
      },
      author: 'Revisor Medición',
      createdAt: '2026-10-17T12:00:00Z',
      updatedAt: '2026-10-17T12:00:00Z',
      status: 'pending',
      measurement: {
        value: 16.0,
        unit: 'm',
        formatted: '16.00 m²',
      },
    };

    const pdfUpdated = await saveIncrementalMarkups(originalBytes, [areaMarkup]);
    const pdfText = new TextDecoder('latin1').decode(pdfUpdated);
    // En PDF se escribe strokeAlpha (0.500) y fillAlpha (0.2 * 0.5 = 0.100) para visores ajenos
    expect(pdfText).toContain('/CA 0.500');
    expect(pdfText).toContain('/ca 0.100');

    const result = await importPdfAnnotations(pdfUpdated);
    expect(result.markups).toHaveLength(1);
    const importedArea = result.markups[0];
    // En REA, fillColor conserva su valor exacto y la opacidad global se aplica por separado en el <g> SVG
    expect(importedArea.style.fillColor).toBe('rgba(220, 38, 38, 0.2)');
    expect(importedArea.style.opacity).toBe(0.5);
  });

  it('convierte fechas PDF nativas (D:...) e ISO a cadenas ISO 8601 estándar sin Invalid Date', () => {
    const fallback = '2026-01-01T00:00:00.000Z';
    // Cadena nativa con prefijo D:
    expect(parsePdfDateToIso('D:20261018141530Z', fallback)).toBe('2026-10-18T14:15:30.000Z');
    // Cadena con paréntesis literales de PDF
    expect(parsePdfDateToIso('(D:20261018141530Z)', fallback)).toBe('2026-10-18T14:15:30.000Z');
    // Cadena sólo fecha YYYYMMDD
    expect(parsePdfDateToIso('D:20261018', fallback)).toBe('2026-10-18T00:00:00.000Z');
    // Cadena ISO estándar
    expect(parsePdfDateToIso('2026-10-18T14:15:30.000Z', fallback)).toBe('2026-10-18T14:15:30.000Z');
    // Cadenas vacías o nulas devuelven fallback
    expect(parsePdfDateToIso('', fallback)).toBe(fallback);
    expect(parsePdfDateToIso(null, fallback)).toBe(fallback);
    // Cadena corrupta no parseable devuelve fallback en vez de invalid string
    expect(parsePdfDateToIso('gibberish_date', fallback)).toBe(fallback);
  });

  it('preserva las fechas createdAt y updatedAt en guardado y re-apertura de mediciones de área sin Invalid Date', async () => {
    const areaMarkup: Markup = {
      id: 'mk-area-date-test',
      type: 'area',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.2 },
        { x: 0.6, y: 0.6 },
        { x: 0.2, y: 0.6 },
      ],
      style: {
        strokeColor: '#dc2626',
        fillColor: 'rgba(220, 38, 38, 0.25)',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Medidor de Obra',
      createdAt: '2026-10-18T08:30:00.000Z',
      updatedAt: '2026-10-18T08:45:00.000Z',
      status: 'pending',
      measurement: {
        value: 24.5,
        unit: 'm',
        formatted: '24.50 m²',
      },
    };

    const pdfUpdated = await saveIncrementalMarkups(originalBytes, [areaMarkup]);
    const result = await importPdfAnnotations(pdfUpdated);

    expect(result.markups).toHaveLength(1);
    const imported = result.markups[0];
    expect(imported.id).toBe('mk-area-date-test');
    expect(imported.type).toBe('area');
    expect(imported.createdAt).toBe('2026-10-18T08:30:00.000Z');
    expect(imported.updatedAt).toBe('2026-10-18T08:45:00.000Z');

    // Comprobar que new Date(imported.createdAt) produce una fecha JavaScript válida
    const dCreated = new Date(imported.createdAt);
    expect(Number.isNaN(dCreated.getTime())).toBe(false);
    expect(dCreated.getUTCFullYear()).toBe(2026);
    expect(dCreated.getUTCMonth()).toBe(9); // 0-indexed: 9 = October
    expect(dCreated.getUTCDate()).toBe(18);

    const dUpdated = new Date(imported.updatedAt);
    expect(Number.isNaN(dUpdated.getTime())).toBe(false);
    expect(dUpdated.getUTCMinutes()).toBe(45);
  });
});
