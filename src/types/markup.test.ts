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

    const { document: migrated, warnings } = migrateBbxDocument(legacyV1Document);

    expect(migrated.version).toBe('1.1.0');
    expect(migrated.pdfFileName).toBe('plano_estructural.pdf');
    expect(migrated.pdfFileSize).toBe(1048576);
    expect(migrated.lastSavedAt).toBe('2026-10-09T20:00:00.000Z');
    expect(migrated.author).toBe('Ingeniero Calculista');
    expect(migrated.markups).toHaveLength(2);
    expect(warnings).toHaveLength(0);

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

  it('falls back unknown markup types to rectangle with explicit warning (P1/P2/Z.2)', () => {
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

    const { document: migrated, warnings } = migrateBbxDocument(docWithUnknownType);
    expect(migrated.markups[0].type).toBe('rectangle');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('laserBeam3D');
    expect(warnings[0]).toContain('rectangle');
  });

  it('falls back invalid or unknown status to pending with warning and preserves cancelled (P1/P2/Z.2)', () => {
    const docWithBadStatus = {
      version: '1.1.0',
      markups: [
        {
          id: 'status-test-1',
          type: 'circle',
          points: [{ x: 0.2, y: 0.2 }],
          status: 'in-review', // Desconocido -> pending con warning
        },
        {
          id: 'status-test-2',
          type: 'line',
          points: [{ x: 0.3, y: 0.3 }],
          status: null, // Inválido -> pending con warning
        },
        {
          id: 'status-test-3',
          type: 'rectangle',
          points: [{ x: 0.4, y: 0.4 }],
          status: 'cancelled', // Oficial ISO 32000 -> debe conservarse sin warning
        },
      ],
    };

    const { document: migrated, warnings } = migrateBbxDocument(docWithBadStatus);
    expect(migrated.markups[0].status).toBe('pending');
    expect(migrated.markups[1].status).toBe('pending');
    expect(migrated.markups[2].status).toBe('cancelled');

    // Debe advertir sobre status-test-1 y status-test-2, pero NO sobre cancelled
    expect(warnings.some((w) => w.includes('in-review'))).toBe(true);
    expect(warnings.some((w) => w.includes('cancelled'))).toBe(false);
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

    const { document: migrated } = migrateBbxDocument(docWithBadPoints);
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

  it('safely handles non-array markups field with warning (P1/P2/Z.2)', () => {
    const corruptedDoc = {
      version: '1.0.0',
      pdfFileName: 'corrupto.pdf',
      markups: 'not an array',
    };

    const { document: migrated, warnings } = migrateBbxDocument(corruptedDoc);
    expect(Array.isArray(migrated.markups)).toBe(true);
    expect(migrated.markups).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('markups'))).toBe(true);
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
    const { document: roundTripped, warnings } = migrateBbxDocument(parsed);

    expect(roundTripped).toEqual(initialDoc);
    expect(warnings).toHaveLength(0);
  });

  describe('Sub-entregable Z.2: Preservación y Endurecimiento de customColumns y customFields', () => {
    it('preserva customColumns válidas en migrateBbxDocument y durante roundtrip', () => {
      const docWithColumns: BbxDocumentFile = {
        version: '1.1.0',
        pdfFileName: 'columnas.pdf',
        lastSavedAt: '2026-10-10T20:00:00.000Z',
        author: 'Estructural',
        customColumns: [
          { id: 'col-peso', nombre: 'Peso (kg)', tipo: 'number' },
          { id: 'col-estado', nombre: 'Estado Obra', tipo: 'choice', opciones: ['Pediente', 'Montado'] },
          { id: 'col-calc', nombre: 'Subtotal', tipo: 'formula', expresion: 'col-peso * 1.21' },
          { id: 'col-txt', nombre: 'Comentario', tipo: 'texto' },
        ],
        markups: [],
      };

      const serialized = JSON.stringify(docWithColumns);
      const parsed = JSON.parse(serialized);
      const { document: migrated, warnings } = migrateBbxDocument(parsed);

      expect(warnings).toHaveLength(0);
      expect(migrated.customColumns).toEqual(docWithColumns.customColumns);
    });

    it('descarta elementos inválidos en customColumns con advertencias explicativas', () => {
      const hostileColumnsDoc = {
        version: '1.1.0',
        pdfFileName: 'columnas_hostiles.pdf',
        customColumns: [
          { id: 'col-ok', nombre: 'Válida', tipo: 'text' },
          { id: '__proto__', nombre: 'Peligrosa', tipo: 'text' }, // id reservado
          { id: '', nombre: 'Sin ID', tipo: 'text' }, // id vacío
          { id: 'col-bad-tipo', nombre: 'Tipo Raro', tipo: 'executableCode' }, // tipo no admitido
          { id: 'col-sin-nombre', tipo: 'number' }, // sin nombre
          null, // null
          'no un objeto', // no objeto
        ],
        markups: [],
      };

      const { document: migrated, warnings } = migrateBbxDocument(hostileColumnsDoc);

      expect(migrated.customColumns).toHaveLength(1);
      expect(migrated.customColumns![0].id).toBe('col-ok');
      expect(warnings.length).toBeGreaterThanOrEqual(5);
    });

    it('descarta customColumns si no es un arreglo con aviso', () => {
      const invalidColDoc = {
        version: '1.1.0',
        pdfFileName: 'col_no_array.pdf',
        customColumns: 'no-es-un-array',
        markups: [],
      };

      const { document: migrated, warnings } = migrateBbxDocument(invalidColDoc);
      expect(migrated.customColumns).toBeUndefined();
      expect(warnings.some((w) => w.includes('customColumns'))).toBe(true);
    });

    it('sanea y protege customFields contra entradas hostiles (__proto__, NaN/Infinity, cadenas gigantes)', () => {
      const giantString = 'A'.repeat(5000);
      const hostileFields: Record<string, unknown> = {
        campoValidoTexto: 'Texto seguro',
        campoValidoNumero: 1234.56,
        constructor: 'peligro',
        prototype: 'peligro',
        nanVal: NaN,
        infVal: Infinity,
        negInfVal: -Infinity,
        giantVal: giantString,
        arrayVal: [1, 2, 3],
        nestedObj: { a: 1 },
        boolVal: true,
      };
      Object.defineProperty(hostileFields, '__proto__', {
        value: { polluted: true },
        enumerable: true,
        configurable: true,
      });

      const hostileFieldsDoc = {
        version: '1.1.0',
        pdfFileName: 'hostil.pdf',
        markups: [
          {
            id: 'm-hostil-1',
            type: 'rectangle',
            points: [{ x: 0.1, y: 0.1 }],
            status: 'pending',
            customFields: hostileFields,
          },
        ],
      };

      const { document: migrated, warnings } = migrateBbxDocument(hostileFieldsDoc);

      const fields = migrated.markups[0].customFields;
      expect(fields).toBeDefined();
      expect(fields?.campoValidoTexto).toBe('Texto seguro');
      expect(fields?.campoValidoNumero).toBe(1234.56);

      // Verificación de no polución de prototipo
      expect((Object.prototype as unknown as { polluted?: boolean }).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(fields!, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(fields!, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(fields!, 'prototype')).toBe(false);

      // Descarte de valores hostiles
      expect(fields?.nanVal).toBeUndefined();
      expect(fields?.infVal).toBeUndefined();
      expect(fields?.negInfVal).toBeUndefined();
      expect(fields?.giantVal).toBeUndefined();
      expect(fields?.arrayVal).toBeUndefined();
      expect(fields?.nestedObj).toBeUndefined();
      expect(fields?.boolVal).toBeUndefined();

      // Debe haber generado advertencias para cada entrada descartada
      expect(warnings.length).toBeGreaterThanOrEqual(8);
      expect(warnings.some((w) => w.includes('__proto__'))).toBe(true);
      expect(warnings.some((w) => w.includes('constructor'))).toBe(true);
      expect(warnings.some((w) => w.includes('no finito'))).toBe(true);
      expect(warnings.some((w) => w.includes('longitud permitida'))).toBe(true);
    });

    it('descarta customFields no objeto con aviso', () => {
      const invalidFieldsDoc = {
        version: '1.1.0',
        markups: [
          {
            id: 'm-bad-fields',
            type: 'circle',
            points: [{ x: 0.2, y: 0.2 }],
            status: 'pending',
            customFields: 'string-invalido',
          },
        ],
      };

      const { document: migrated, warnings } = migrateBbxDocument(invalidFieldsDoc);
      expect(migrated.markups[0].customFields).toBeUndefined();
      expect(warnings.some((w) => w.includes('customFields'))).toBe(true);
    });
  });
});
