import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
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

    // Anotación 2: Link no soportado para marcado gráfico (/Widget o /Link)
    const linkDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, 50, 80, 80],
    });
    const linkRef = doc.context.register(linkDict);

    const annotsArray = doc.context.obj([squareRef, linkRef]);
    page.node.set(PDFName.of('Annots'), annotsArray);

    const pdfBytes = await doc.save();
    const result = await importPdfAnnotations(pdfBytes);

    expect(result.foreignUnsupportedCount).toBe(1); // El Link no está en los tipos gráficos soportados
    expect(result.markups.length).toBe(1);

    const imported = result.markups[0];
    expect(imported.id).toBe('ext-annot-123');
    expect(imported.type).toBe('rectangle');
    expect(imported.author).toBe('Usuario Externo');
    expect(imported.text).toBe('Cuadro foráneo de Bluebeam');
    expect(imported.style.strokeColor.toLowerCase()).toBe('#ff0000');
  });
});
