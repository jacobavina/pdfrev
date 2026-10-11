import { describe, it, expect } from 'vitest';
import {
  evaluateColumnForMarkup,
  evaluateDocumentCustomColumns,
} from './evaluate';
import { Markup, BbxCustomColumn } from '../../types/markup';

describe('P2-C.3: evaluador de columnas calculadas, dependencias y ciclos', () => {
  const baseMarkup: Markup = {
    id: 'm-1',
    type: 'rectangle',
    pageIndex: 2,
    points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
    style: {
      strokeColor: '#ff0000',
      strokeWidth: 4,
      opacity: 0.8,
    },
    author: 'Arquitecto',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    status: 'pending',
    customFields: {
      largo: 12.5,
      ancho: 4,
    },
  };

  const columns: BbxCustomColumn[] = [
    { id: 'largo', nombre: 'Largo', tipo: 'number' },
    { id: 'ancho', nombre: 'Ancho', tipo: 'number' },
    { id: 'observaciones', nombre: 'Observaciones', tipo: 'text' },
    {
      id: 'area',
      nombre: 'Área',
      tipo: 'formula',
      expresion: '{largo} * {ancho}',
    },
    {
      id: 'peso_estimado',
      nombre: 'Peso',
      tipo: 'formula',
      expresion: 'round({area} * strokeWidth * 2.5, 2)',
    },
  ];

  it('evalúa campos nativos de la marca de la lista blanca', () => {
    const col: BbxCustomColumn = {
      id: 'test_fields',
      nombre: 'Campos',
      tipo: 'formula',
      expresion: 'strokeWidth * 10 + opacity + pageIndex',
    };
    const res = evaluateColumnForMarkup(col, baseMarkup, [col]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      // 4 * 10 + 0.8 + 2 = 42.8
      expect(res.value).toBeCloseTo(42.8);
    }
  });

  it('evalúa referencias a columnas numéricas y funciones matemáticas', () => {
    const areaCol = columns.find((c) => c.id === 'area')!;
    const areaRes = evaluateColumnForMarkup(areaCol, baseMarkup, columns);
    expect(areaRes.ok).toBe(true);
    if (areaRes.ok) {
      // 12.5 * 4 = 50
      expect(areaRes.value).toBe(50);
    }

    const pesoCol = columns.find((c) => c.id === 'peso_estimado')!;
    const pesoRes = evaluateColumnForMarkup(pesoCol, baseMarkup, columns);
    expect(pesoRes.ok).toBe(true);
    if (pesoRes.ok) {
      // round(50 * 4 * 2.5, 2) = round(500, 2) = 500
      expect(pesoRes.value).toBe(500);
    }
  });

  it('devuelve error REF si una columna numérica referenciada no tiene valor en la marca', () => {
    const emptyMarkup: Markup = {
      ...baseMarkup,
      customFields: {}, // sin largo ni ancho
    };
    const areaCol = columns.find((c) => c.id === 'area')!;
    const res = evaluateColumnForMarkup(areaCol, emptyMarkup, columns);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('REF');
      expect(res.message).toContain('Valor faltante');
    }
  });

  it('devuelve error REF si se referencia una columna que no existe', () => {
    const invalidCol: BbxCustomColumn = {
      id: 'missing_ref',
      nombre: 'Missing',
      tipo: 'formula',
      expresion: '{columna_fantasma} + 10',
    };
    const res = evaluateColumnForMarkup(invalidCol, baseMarkup, [invalidCol]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('REF');
      expect(res.message).toContain('no existe');
    }
  });

  it('devuelve error REF si se referencia una columna no numérica (tipo text)', () => {
    const textRefCol: BbxCustomColumn = {
      id: 'calc_text',
      nombre: 'CalcText',
      tipo: 'formula',
      expresion: '{observaciones} + 10',
    };
    const res = evaluateColumnForMarkup(textRefCol, baseMarkup, [...columns, textRefCol]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('REF');
      expect(res.message).toContain('no es de tipo numérico o fórmula');
    }
  });

  it('detecta auto-referencia cíclica ({A} -> {A}) y retorna error CYCLE', () => {
    const selfCycleCol: BbxCustomColumn = {
      id: 'self_cycle',
      nombre: 'SelfCycle',
      tipo: 'formula',
      expresion: '{self_cycle} + 1',
    };
    const res = evaluateColumnForMarkup(selfCycleCol, baseMarkup, [selfCycleCol]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('CYCLE');
      expect(res.message).toContain('Dependencia circular');
    }
  });

  it('detecta ciclos mutuos directos ({A} <-> {B}) y retorna error CYCLE', () => {
    const colA: BbxCustomColumn = {
      id: 'col_a',
      nombre: 'A',
      tipo: 'formula',
      expresion: '{col_b} * 2',
    };
    const colB: BbxCustomColumn = {
      id: 'col_b',
      nombre: 'B',
      tipo: 'formula',
      expresion: '{col_a} + 5',
    };
    const cols = [colA, colB];

    const resA = evaluateColumnForMarkup(colA, baseMarkup, cols);
    expect(resA.ok).toBe(false);
    if (!resA.ok) {
      expect(resA.error).toBe('CYCLE');
    }

    const resB = evaluateColumnForMarkup(colB, baseMarkup, cols);
    expect(resB.ok).toBe(false);
    if (!resB.ok) {
      expect(resB.error).toBe('CYCLE');
    }
  });

  it('detecta ciclos indirectos triangulares (A -> B -> C -> A) y retorna CYCLE', () => {
    const colA: BbxCustomColumn = { id: 'cA', nombre: 'A', tipo: 'formula', expresion: '{cB} + 1' };
    const colB: BbxCustomColumn = { id: 'cB', nombre: 'B', tipo: 'formula', expresion: '{cC} * 2' };
    const colC: BbxCustomColumn = { id: 'cC', nombre: 'C', tipo: 'formula', expresion: '{cA} - 3' };
    const cols = [colA, colB, colC];

    const res = evaluateColumnForMarkup(colA, baseMarkup, cols);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('CYCLE');
    }
  });

  it('maneja división por cero devolviendo error DIV0 de manera controlada', () => {
    const divZeroCol: BbxCustomColumn = {
      id: 'div_zero',
      nombre: 'DivZero',
      tipo: 'formula',
      expresion: '100 / (4 - 4)',
    };
    const res = evaluateColumnForMarkup(divZeroCol, baseMarkup, [divZeroCol]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('DIV0');
      expect(res.message).toBe('División por cero');
    }
  });

  it('detecta desbordamiento por magnitud numérica excesiva devolviendo OVERFLOW', () => {
    const overflowCol: BbxCustomColumn = {
      id: 'overflow_col',
      nombre: 'Overflow',
      tipo: 'formula',
      expresion: '1000000000 * 1000000000', // 10^18 > 10^15
    };
    const res = evaluateColumnForMarkup(overflowCol, baseMarkup, [overflowCol]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('OVERFLOW');
    }
  });

  describe('Benchmark de rendimiento: 500 marcas x 3 columnas calculadas < 50ms', () => {
    it('evalúa matriz de 500 marcas x 3 fórmulas en menos de 50 milisegundos', () => {
      const benchmarkMarkups: Markup[] = [];
      for (let i = 0; i < 500; i++) {
        benchmarkMarkups.push({
          id: `bm-${i}`,
          type: i % 2 === 0 ? 'rectangle' : 'cloud',
          pageIndex: i % 10,
          points: [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.8 }],
          style: {
            strokeColor: '#0000ff',
            strokeWidth: 2 + (i % 5),
            opacity: 0.5 + ((i % 50) / 100),
          },
          author: `Usuario ${i % 5}`,
          createdAt: '2026-10-10T00:00:00.000Z',
          updatedAt: '2026-10-10T00:00:00.000Z',
          status: 'pending',
          customFields: {
            ancho: 10 + (i % 20),
            alto: 5 + (i % 15),
          },
        });
      }

      const benchColumns: BbxCustomColumn[] = [
        { id: 'ancho', nombre: 'Ancho', tipo: 'number' },
        { id: 'alto', nombre: 'Alto', tipo: 'number' },
        {
          id: 'superficie',
          nombre: 'Superficie',
          tipo: 'formula',
          expresion: '{ancho} * {alto}',
        },
        {
          id: 'perimetro',
          nombre: 'Perímetro',
          tipo: 'formula',
          expresion: '2 * ({ancho} + {alto})',
        },
        {
          id: 'factor_complejo',
          nombre: 'Factor Complejo',
          tipo: 'formula',
          expresion: 'round({superficie} / {perimetro} * strokeWidth, 3)',
        },
      ];

      const start = performance.now();
      const matrix = evaluateDocumentCustomColumns(benchmarkMarkups, benchColumns);
      const duration = performance.now() - start;

      expect(matrix.size).toBe(500);
      const firstRow = matrix.get('bm-0')!;
      expect(firstRow).toBeDefined();
      expect(firstRow.get('superficie')?.ok).toBe(true);
      expect(firstRow.get('perimetro')?.ok).toBe(true);
      expect(firstRow.get('factor_complejo')?.ok).toBe(true);

      // Criterio de aceptación estricto: < 50 ms
      expect(duration).toBeLessThan(50);
    });
  });
});
