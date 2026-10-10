import { describe, it, expect } from 'vitest';
import { migrateBbxDocument, BbxDocumentFile } from './markup';

describe('BbxDocumentFile Migration & Backward Compatibility (P1 / P2)', () => {
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

    expect(migrated.version).toBe('1.1.0');
    expect(migrated.pdfFileName).toBe('plano_estructural.pdf');
    expect(migrated.pdfFileSize).toBe(1048576);
    expect(migrated.lastSavedAt).toBe('2026-10-09T20:00:00.000Z');
    expect(migrated.author).toBe('Ingeniero Calculista');
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

    const m2 = migrated.markups[1];
    expect(m2.id).toBe('markup-legacy-2');
    expect(m2.type).toBe('highlight');
    expect(m2.pageIndex).toBe(1);
    expect(m2.status).toBe('pending');
  });

  it('rejects documents created by a future or incompatible version (P1/P2)', () => {
    const futureDoc = {
      version: '2.0.0',
      pdfFileName: 'futuro.pdf',
      markups: [],
    };

    expect(() => migrateBbxDocument(futureDoc)).toThrow(
      /Archivo creado por una versión más reciente o incompatible de la aplicación \(v2\.0\.0\)/
    );
  });

  it('falls back unknown markup types to rectangle (P1/P2)', () => {
    const docWithUnknownType = {
      version: '1.0.0',
      markups: [
        {
          id: 'alien-markup',
          type: 'laserBeam3D',
          points: [{ x: 0.1, y: 0.1 }],
          status: 'pending',
        },
      ],
    };

    const migrated = migrateBbxDocument(docWithUnknownType);
    expect(migrated.markups[0].type).toBe('rectangle');
  });

  it('falls back invalid or unknown status to pending (P1/P2)', () => {
    const docWithBadStatus = {
      version: '1.1.0',
      markups: [
        {
          id: 'status-test-1',
          type: 'circle',
          points: [{ x: 0.2, y: 0.2 }],
          status: 'in-review', // Desconocido
        },
        {
          id: 'status-test-2',
          type: 'line',
          points: [{ x: 0.3, y: 0.3 }],
          status: null, // Inválido
        },
      ],
    };

    const migrated = migrateBbxDocument(docWithBadStatus);
    expect(migrated.markups[0].status).toBe('pending');
    expect(migrated.markups[1].status).toBe('pending');
  });

  it('sanitizes malformed points without producing NaN (P1/P2)', () => {
    const docWithBadPoints = {
      version: '1.0.0',
      markups: [
        {
          id: 'points-test',
          type: 'polygon',
          points: [
            { x: 0.1, y: 0.2 },
            { x: 'invalid', y: 0.5 }, // string
            { x: NaN, y: 0.8 }, // NaN
            { x: 0.3, y: Infinity }, // Infinity
            null, // null
            { x: 0.4, y: 0.6 }, // válido
          ],
          status: 'pending',
        },
      ],
    };

    const migrated = migrateBbxDocument(docWithBadPoints);
    const points = migrated.markups[0].points;
    // Solo los puntos con números finitos deben quedar
    expect(points).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.4, y: 0.6 },
    ]);
    for (const pt of points) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
      expect(Number.isNaN(pt.x)).toBe(false);
      expect(Number.isNaN(pt.y)).toBe(false);
    }
  });

  it('safely handles non-array markups field (P1/P2)', () => {
    const corruptedDoc = {
      version: '1.0.0',
      pdfFileName: 'corrupto.pdf',
      markups: 'not an array',
    };

    const migrated = migrateBbxDocument(corruptedDoc);
    expect(Array.isArray(migrated.markups)).toBe(true);
    expect(migrated.markups).toHaveLength(0);
  });

  it('supports round-trip serialization and deserialization (P1/P2)', () => {
    const initialDoc: BbxDocumentFile = {
      version: '1.1.0',
      pdfFileName: 'roundtrip.pdf',
      pdfFileSize: 500000,
      lastSavedAt: '2026-10-09T22:00:00.000Z',
      author: 'Auditor QA',
      markups: [
        {
          id: 'rt-1',
          type: 'polygon',
          pageIndex: 0,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.5, y: 0.2 },
            { x: 0.4, y: 0.8 },
          ],
          style: {
            strokeColor: '#00ff00',
            fillColor: 'rgba(0, 255, 0, 0.2)',
            strokeWidth: 3,
            opacity: 0.8,
          },
          text: 'Zona A',
          author: 'Auditor QA',
          createdAt: '2026-10-09T22:00:00.000Z',
          updatedAt: '2026-10-09T22:00:00.000Z',
          status: 'completed',
        },
      ],
    };

    const serialized = JSON.stringify(initialDoc);
    const parsed = JSON.parse(serialized);
    const roundTripped = migrateBbxDocument(parsed);

    expect(roundTripped).toEqual(initialDoc);
  });
});
