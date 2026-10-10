import { describe, it, expect } from 'vitest';
import { migrateBbxDocument } from './markup';

describe('BbxDocumentFile Migration & Backward Compatibility', () => {
  it('correctly migrates a legacy v1.0.0 document to v1.1.0 without data loss', () => {
    const legacyV1Document = {
      version: '1.0.0',
      pdfFileName: 'plano_estructural.pdf',
      pdfFileSize: 1048576,
      lastSavedAt: '2026-10-09T20:00:00.000Z',
      author: 'Ingeniero Calculista',
      markups: [
        {
          id: 'markup-legacy-1',
          type: 'rectangle',
          pageIndex: 0,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.4, y: 0.5 },
          ],
          style: {
            strokeColor: '#e02424',
            strokeWidth: 2,
            opacity: 0.9,
          },
          text: 'Refuerzo de zapata',
          author: 'Ingeniero Calculista',
          createdAt: '2026-10-09T19:50:00.000Z',
          updatedAt: '2026-10-09T19:55:00.000Z',
          status: 'accepted',
          layer: 'Estructuras',
          customFields: {
            codigoCimentacion: 'Z-04',
          },
        },
        {
          id: 'markup-legacy-2',
          type: 'highlight', // Legacy type
          pageIndex: 1,
          points: [
            { x: 0.05, y: 0.05 },
            { x: 0.8, y: 0.1 },
          ],
          style: {
            strokeColor: '#ffff00',
            strokeWidth: 1,
            opacity: 0.5,
          },
          author: 'Revisor',
          createdAt: '2026-10-09T19:58:00.000Z',
          updatedAt: '2026-10-09T19:58:00.000Z',
          status: 'pending',
        },
      ],
    };

    const migrated = migrateBbxDocument(legacyV1Document);

    // 1. Validar promoción de versión
    expect(migrated.version).toBe('1.1.0');

    // 2. Validar metadatos del documento
    expect(migrated.pdfFileName).toBe('plano_estructural.pdf');
    expect(migrated.pdfFileSize).toBe(1048576);
    expect(migrated.lastSavedAt).toBe('2026-10-09T20:00:00.000Z');
    expect(migrated.author).toBe('Ingeniero Calculista');

    // 3. Validar preservación de marcas
    expect(migrated.markups).toHaveLength(2);

    const m1 = migrated.markups[0];
    expect(m1.id).toBe('markup-legacy-1');
    expect(m1.type).toBe('rectangle');
    expect(m1.points).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.4, y: 0.5 },
    ]);
    expect(m1.text).toBe('Refuerzo de zapata');
    expect(m1.status).toBe('accepted');
    expect(m1.layer).toBe('Estructuras');
    expect(m1.customFields).toEqual({ codigoCimentacion: 'Z-04' });
    // Campos Fase 2 deben ser undefined pero accesibles
    expect(m1.groupId).toBeUndefined();
    expect(m1.leaders).toBeUndefined();
    expect(m1.textFormat).toBeUndefined();

    const m2 = migrated.markups[1];
    expect(m2.id).toBe('markup-legacy-2');
    expect(m2.type).toBe('highlight'); // Preservado como tipo legacy
    expect(m2.pageIndex).toBe(1);
    expect(m2.status).toBe('pending');
  });

  it('accepts an already v1.1.0 document with Phase 2 fields intact', () => {
    const v11Doc = {
      version: '1.1.0',
      pdfFileName: 'instalaciones.pdf',
      lastSavedAt: '2026-10-09T21:00:00.000Z',
      author: 'Ing. MEP',
      markups: [
        {
          id: 'callout-1',
          type: 'callout',
          pageIndex: 0,
          points: [{ x: 0.2, y: 0.3 }],
          leaders: [
            [
              { x: 0.2, y: 0.3 },
              { x: 0.1, y: 0.1 },
            ],
          ],
          groupId: 'grp-cloudplus-1',
          textFormat: { bold: true, align: 'center' },
          style: {
            strokeColor: '#007acc',
            strokeWidth: 2,
            opacity: 1,
          },
          text: 'Válvula de alivio DN50',
          author: 'Ing. MEP',
          createdAt: '2026-10-09T21:00:00.000Z',
          updatedAt: '2026-10-09T21:00:00.000Z',
          status: 'completed',
        },
      ],
    };

    const migrated = migrateBbxDocument(v11Doc);
    expect(migrated.version).toBe('1.1.0');
    expect(migrated.markups[0].groupId).toBe('grp-cloudplus-1');
    expect(migrated.markups[0].leaders).toHaveLength(1);
    expect(migrated.markups[0].textFormat).toEqual({ bold: true, align: 'center' });
  });

  it('throws an error if input is not an object', () => {
    expect(() => migrateBbxDocument(null)).toThrow();
    expect(() => migrateBbxDocument('string')).toThrow();
  });
});
