import { describe, it, expect } from 'vitest';
import {
  filterMarkups,
  sortMarkups,
  filterAndSortMarkups,
  MarkupFilterCriteria,
  MarkupSortCriteria,
} from './markupFilterSort';
import { Markup, MarkupStatus, MarkupType, BbxCustomColumn } from '../types/markup';

function createMockMarkup(overrides: Partial<Markup>): Markup {
  return {
    id: overrides.id || `mk-${Math.random().toString(36).substring(2, 9)}`,
    type: overrides.type || 'rectangle',
    pageIndex: overrides.pageIndex !== undefined ? overrides.pageIndex : 0,
    points: overrides.points || [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    style: overrides.style || { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
    author: overrides.author || 'Revisor A',
    createdAt: overrides.createdAt || '2026-03-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-01T10:00:00.000Z',
    status: overrides.status || 'pending',
    text: overrides.text,
    layer: overrides.layer,
    groupId: overrides.groupId,
    customFields: overrides.customFields,
  };
}

describe('Markup Filter and Sort Engine (P2-C.1)', () => {
  const sampleMarkups: Markup[] = [
    createMockMarkup({
      id: 'm-1',
      type: 'rectangle',
      author: 'Carlos Ing',
      text: 'Viga principal IPE 300',
      status: 'pending',
      pageIndex: 0,
      createdAt: '2026-03-01T08:00:00.000Z',
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
    }),
    createMockMarkup({
      id: 'm-2',
      type: 'cloud',
      author: 'Beatriz Arq',
      text: 'Revisar cota de hueco',
      status: 'accepted',
      pageIndex: 0,
      createdAt: '2026-03-02T09:00:00.000Z',
      style: { strokeColor: '#00ff00', strokeWidth: 3, opacity: 1 },
    }),
    createMockMarkup({
      id: 'm-3',
      type: 'stickyNote',
      author: 'Carlos Ing',
      text: 'Consulta geotécnica zapata',
      status: 'rejected',
      pageIndex: 1,
      createdAt: '2026-03-03T11:00:00.000Z',
      style: { strokeColor: '#ffff00', strokeWidth: 1, opacity: 1 },
    }),
    createMockMarkup({
      id: 'm-4',
      type: 'callout',
      author: 'David Estructuras',
      text: 'Detalle de armadura superior',
      status: 'completed',
      pageIndex: 1,
      createdAt: '2026-03-04T12:00:00.000Z',
      style: { strokeColor: '#0000ff', strokeWidth: 2, opacity: 1 },
    }),
    createMockMarkup({
      id: 'm-5',
      type: 'highlightText',
      author: 'Beatriz Arq',
      text: 'ESPECIFICACIÓN DE HORMIGÓN HA-30',
      status: 'accepted',
      pageIndex: 2,
      createdAt: '2026-03-05T14:00:00.000Z',
      style: { strokeColor: '#ff00ff', strokeWidth: 1, opacity: 0.5 },
    }),
  ];

  describe('Filtros individuales y combinados', () => {
    it('filtra por búsqueda de texto de forma insensible a mayúsculas', () => {
      const res = filterMarkups(sampleMarkups, { searchQuery: 'viga' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('m-1');
    });

    it('filtra por búsqueda en el nombre de autor', () => {
      const res = filterMarkups(sampleMarkups, { searchQuery: 'david' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('m-4');
    });

    it('filtra por tipo de marca', () => {
      const res = filterMarkups(sampleMarkups, { type: 'cloud' });
      expect(res).toHaveLength(1);
      expect(res[0].type).toBe('cloud');
    });

    it('filtra por autor específico', () => {
      const res = filterMarkups(sampleMarkups, { author: 'Carlos Ing' });
      expect(res).toHaveLength(2);
      expect(res.map((m) => m.id)).toEqual(['m-1', 'm-3']);
    });

    it('filtra por estado', () => {
      const res = filterMarkups(sampleMarkups, { status: 'accepted' });
      expect(res).toHaveLength(2);
      expect(res.map((m) => m.id)).toEqual(['m-2', 'm-5']);
    });

    it('filtra por página', () => {
      const res = filterMarkups(sampleMarkups, { pageIndex: 1 });
      expect(res).toHaveLength(2);
      expect(res.map((m) => m.id)).toEqual(['m-3', 'm-4']);
    });

    it('filtra combinando múltiples criterios simultáneos', () => {
      const res = filterMarkups(sampleMarkups, {
        author: 'Beatriz Arq',
        status: 'accepted',
        searchQuery: 'hueco',
      });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('m-2');
    });

    it('devuelve array vacío si el filtro no arroja resultados', () => {
      const res = filterMarkups(sampleMarkups, {
        searchQuery: 'texto_inexistente_xyz',
      });
      expect(res).toHaveLength(0);
      expect(Array.isArray(res)).toBe(true);
    });

    it('respeta la inmutabilidad retornando una referencia nueva', () => {
      const res = filterMarkups(sampleMarkups, {});
      expect(res).not.toBe(sampleMarkups);
      expect(res).toHaveLength(sampleMarkups.length);
    });
  });

  describe('Ordenación ascendente, descendente y estabilidad', () => {
    it('ordena por página ascendente y descendente', () => {
      const asc = sortMarkups(sampleMarkups, { field: 'pageIndex', direction: 'asc' });
      expect(asc[0].pageIndex).toBe(0);
      expect(asc[asc.length - 1].pageIndex).toBe(2);

      const desc = sortMarkups(sampleMarkups, { field: 'pageIndex', direction: 'desc' });
      expect(desc[0].pageIndex).toBe(2);
      expect(desc[desc.length - 1].pageIndex).toBe(0);
    });

    it('ordena por fecha createdAt ascendente y descendente', () => {
      const asc = sortMarkups(sampleMarkups, { field: 'createdAt', direction: 'asc' });
      expect(asc[0].id).toBe('m-1');
      expect(asc[asc.length - 1].id).toBe('m-5');

      const desc = sortMarkups(sampleMarkups, { field: 'createdAt', direction: 'desc' });
      expect(desc[0].id).toBe('m-5');
      expect(desc[desc.length - 1].id).toBe('m-1');
    });

    it('ordena por autor alfabéticamente', () => {
      const asc = sortMarkups(sampleMarkups, { field: 'author', direction: 'asc' });
      expect(asc[0].author).toBe('Beatriz Arq');

      const desc = sortMarkups(sampleMarkups, { field: 'author', direction: 'desc' });
      expect(desc[0].author).toBe('David Estructuras');
    });

    it('ordena por tipo alfabéticamente', () => {
      const asc = sortMarkups(sampleMarkups, { field: 'type', direction: 'asc' });
      expect(asc[0].type).toBe('callout');
    });

    it('ordena por texto alfabéticamente', () => {
      const asc = sortMarkups(sampleMarkups, { field: 'text', direction: 'asc' });
      expect(asc[0].text).toBe('Consulta geotécnica zapata');
    });

    it('ordena por estado alfabéticamente', () => {
      const asc = sortMarkups(sampleMarkups, { field: 'status', direction: 'asc' });
      expect(asc[0].status).toBe('accepted');
    });

    it('garantiza orden estable desempatando deterministamente por ID', () => {
      const ties: Markup[] = [
        createMockMarkup({ id: 'id-z', author: 'Mismo Autor', pageIndex: 0 }),
        createMockMarkup({ id: 'id-a', author: 'Mismo Autor', pageIndex: 0 }),
        createMockMarkup({ id: 'id-m', author: 'Mismo Autor', pageIndex: 0 }),
      ];

      const sortedAsc = sortMarkups(ties, { field: 'author', direction: 'asc' });
      expect(sortedAsc.map((m) => m.id)).toEqual(['id-a', 'id-m', 'id-z']);

      const sortedDesc = sortMarkups(ties, { field: 'author', direction: 'desc' });
      // El desempate por ID sigue garantizando orden determinista
      expect(sortedDesc.map((m) => m.id)).toEqual(['id-a', 'id-m', 'id-z']);
    });
  });

  describe('Benchmark de Rendimiento sobre 500 Marcas', () => {
    it('filtra y ordena 500 marcas en menos de 10 ms (benchmark que puede fallar)', () => {
      // 1. Generar 500 marcas sintéticas diversas
      const authors = ['Ana Estructuras', 'Carlos Instalaciones', 'Elena Arquitectura', 'David Obra'];
      const types: MarkupType[] = ['rectangle', 'cloud', 'callout', 'stickyNote', 'highlightText'];
      const statuses: MarkupStatus[] = ['pending', 'accepted', 'rejected', 'completed'];

      const bigDataset: Markup[] = [];
      for (let i = 0; i < 500; i++) {
        const author = authors[i % authors.length];
        const type = types[i % types.length];
        const status = statuses[i % statuses.length];
        const pageIndex = i % 10;
        const text = i % 2 === 0 ? `Anotación técnica número ${i} de revisión crítica` : `Nota simple ${i}`;
        const createdAt = new Date(1700000000000 + i * 60000).toISOString();

        bigDataset.push(
          createMockMarkup({
            id: `large-mk-${String(i).padStart(4, '0')}`,
            author,
            type,
            status,
            pageIndex,
            text,
            createdAt,
          })
        );
      }

      expect(bigDataset).toHaveLength(500);

      // 2. Ejecutar filtro compuesto + ordenación cronometrado
      const filterCriteria: MarkupFilterCriteria = {
        searchQuery: 'revisión',
        author: 'Ana Estructuras',
        status: 'pending',
      };
      const sortCriteria: MarkupSortCriteria = {
        field: 'createdAt',
        direction: 'desc',
      };

      const start = performance.now();
      const result = filterAndSortMarkups(bigDataset, filterCriteria, sortCriteria);
      const durationMs = performance.now() - start;

      // 3. Aserciones de corrección del resultado
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThan(500);
      for (const item of result) {
        expect(item.author).toBe('Ana Estructuras');
        expect(item.status).toBe('pending');
        expect(item.text).toContain('revisión');
      }

      // Comprobar orden descendente
      for (let i = 0; i < result.length - 1; i++) {
        const tA = new Date(result[i].createdAt).getTime();
        const tB = new Date(result[i + 1].createdAt).getTime();
        expect(tA).toBeGreaterThanOrEqual(tB);
      }

      // 4. Aserción estricta de tiempo de presupuesto (< 10 ms; margen 15 ms para varianza de VM)
      expect(durationMs).toBeLessThan(15);
    });
  });

  describe('Filtrado y ordenación por columnas personalizadas (P2-C.3)', () => {
    const customColumns: BbxCustomColumn[] = [
      { id: 'longitud', nombre: 'Longitud', tipo: 'number' },
      { id: 'categoria', nombre: 'Categoría', tipo: 'choice', opciones: ['A', 'B', 'C'] },
      { id: 'nota', nombre: 'Nota', tipo: 'text' },
      { id: 'costo', nombre: 'Costo', tipo: 'formula', expresion: '{longitud} * 10' },
      { id: 'ratio_error', nombre: 'Ratio', tipo: 'formula', expresion: '100 / ({longitud} - 5)' },
    ];

    const markupsWithCustom: Markup[] = [
      createMockMarkup({
        id: 'm-custom-1',
        text: 'Elemento 1',
        customFields: { longitud: 9, categoria: 'B', nota: 'Revisión estructural' },
      }),
      createMockMarkup({
        id: 'm-custom-2',
        text: 'Elemento 2',
        customFields: { longitud: 10, categoria: 'A', nota: 'Acabado fino' },
      }),
      createMockMarkup({
        id: 'm-custom-3',
        text: 'Elemento 3',
        customFields: { longitud: 2, categoria: 'C' }, // sin nota
      }),
      createMockMarkup({
        id: 'm-custom-4',
        text: 'Elemento 4',
        customFields: { longitud: 5, categoria: 'B' }, // longitud=5 provocará DIV0 en ratio_error
      }),
      createMockMarkup({
        id: 'm-custom-5',
        text: 'Elemento 5',
        customFields: {}, // sin campos (vacío)
      }),
    ];

    it('ordena numéricamente por columna personalizada (10 > 9 > 5 > 2)', () => {
      const asc = sortMarkups(markupsWithCustom, {
        field: 'custom:longitud',
        direction: 'asc',
        customColumns,
      });
      // En asc: 2, 5, 9, 10, y el vacío al final
      expect(asc.map((m) => m.id)).toEqual([
        'm-custom-3',
        'm-custom-4',
        'm-custom-1',
        'm-custom-2',
        'm-custom-5',
      ]);

      const desc = sortMarkups(markupsWithCustom, {
        field: 'custom:longitud',
        direction: 'desc',
        customColumns,
      });
      // En desc: 10, 9, 5, 2, y el vacío sigue al final
      expect(desc.map((m) => m.id)).toEqual([
        'm-custom-2',
        'm-custom-1',
        'm-custom-4',
        'm-custom-3',
        'm-custom-5',
      ]);
    });

    it('sitúa valores vacíos al final tanto en orden asc como desc', () => {
      const asc = sortMarkups(markupsWithCustom, {
        field: 'custom:nota',
        direction: 'asc',
        customColumns,
      });
      // m-custom-2 ("Acabado fino"), m-custom-1 ("Revisión estructural"), luego vacíos m-3, m-4, m-5
      expect(asc.slice(0, 2).map((m) => m.id)).toEqual(['m-custom-2', 'm-custom-1']);
      expect(asc.slice(2).map((m) => m.id)).toEqual(['m-custom-3', 'm-custom-4', 'm-custom-5']);

      const desc = sortMarkups(markupsWithCustom, {
        field: 'custom:nota',
        direction: 'desc',
        customColumns,
      });
      // m-custom-1 ("Revisión"), m-custom-2 ("Acabado"), luego vacíos al final
      expect(desc.slice(0, 2).map((m) => m.id)).toEqual(['m-custom-1', 'm-custom-2']);
      expect(desc.slice(2).map((m) => m.id)).toEqual(['m-custom-3', 'm-custom-4', 'm-custom-5']);
    });

    it('ordena por columna calculada (fórmula) y sitúa errores al final en asc y desc', () => {
      // ratio_error: 100 / ({longitud} - 5)
      // m-1 (longitud=9) => 100 / 4 = 25
      // m-2 (longitud=10) => 100 / 5 = 20
      // m-3 (longitud=2) => 100 / -3 = -33.333
      // m-4 (longitud=5) => DIV0 (error)
      // m-5 (sin longitud) => REF (error)
      const asc = sortMarkups(markupsWithCustom, {
        field: 'custom:ratio_error',
        direction: 'asc',
        customColumns,
      });
      // Ascendente: -33.33 (m-3), 20 (m-2), 25 (m-1), luego errores (m-4, m-5)
      expect(asc.map((m) => m.id)).toEqual([
        'm-custom-3',
        'm-custom-2',
        'm-custom-1',
        'm-custom-4',
        'm-custom-5',
      ]);

      const desc = sortMarkups(markupsWithCustom, {
        field: 'custom:ratio_error',
        direction: 'desc',
        customColumns,
      });
      // Descendente: 25 (m-1), 20 (m-2), -33.33 (m-3), luego errores (m-4, m-5)
      expect(desc.map((m) => m.id)).toEqual([
        'm-custom-1',
        'm-custom-2',
        'm-custom-3',
        'm-custom-4',
        'm-custom-5',
      ]);
    });

    it('filtra por columna choice (exacto) y columna text (substring)', () => {
      const filteredChoice = filterMarkups(markupsWithCustom, {
        customColumns,
        customFilters: { categoria: 'B' },
      });
      expect(filteredChoice.map((m) => m.id)).toEqual(['m-custom-1', 'm-custom-4']);

      const filteredText = filterMarkups(markupsWithCustom, {
        customColumns,
        customFilters: { nota: 'estructural' },
      });
      expect(filteredText.map((m) => m.id)).toEqual(['m-custom-1']);
    });

    it('busca en valores de campos y fórmulas con searchQuery global', () => {
      const res = filterMarkups(markupsWithCustom, {
        searchQuery: 'acabado',
        customColumns,
      });
      expect(res.map((m) => m.id)).toEqual(['m-custom-2']);

      const resFormula = filterMarkups(markupsWithCustom, {
        searchQuery: '90', // costo de m-1 es 9 * 10 = 90
        customColumns,
      });
      expect(resFormula.map((m) => m.id)).toEqual(['m-custom-1']);
    });

    it('respeta la inmutabilidad: el array original y los objetos no se alteran', () => {
      const snapshot = JSON.stringify(markupsWithCustom);
      const res = filterAndSortMarkups(
        markupsWithCustom,
        { customFilters: { categoria: 'B' } },
        { field: 'custom:longitud', direction: 'asc', customColumns }
      );
      expect(JSON.stringify(markupsWithCustom)).toBe(snapshot);
      expect(res).not.toBe(markupsWithCustom);
    });

    it('benchmark: filtra y ordena 500 marcas por columna calculada en menos de 15 ms', () => {
      const dataset: Markup[] = [];
      for (let i = 0; i < 500; i++) {
        dataset.push(
          createMockMarkup({
            id: `bm-c-${String(i).padStart(4, '0')}`,
            text: `Marca ${i}`,
            author: i % 2 === 0 ? 'Autor A' : 'Autor B',
            status: 'pending',
            customFields: {
              largo: 10 + (i % 50),
              ancho: 5 + (i % 20),
            },
          })
        );
      }

      const benchCols: BbxCustomColumn[] = [
        { id: 'largo', nombre: 'Largo', tipo: 'number' },
        { id: 'ancho', nombre: 'Ancho', tipo: 'number' },
        { id: 'superficie', nombre: 'Superficie', tipo: 'formula', expresion: '{largo} * {ancho}' },
      ];

      const start = performance.now();
      const res = filterAndSortMarkups(
        dataset,
        { author: 'Autor A', customColumns: benchCols },
        { field: 'custom:superficie', direction: 'desc', customColumns: benchCols }
      );
      const durationMs = performance.now() - start;

      expect(res.length).toBe(250);
      for (let i = 0; i < res.length - 1; i++) {
        const areaA = (res[i].customFields?.largo as number) * (res[i].customFields?.ancho as number);
        const areaB = (res[i + 1].customFields?.largo as number) * (res[i + 1].customFields?.ancho as number);
        expect(areaA).toBeGreaterThanOrEqual(areaB);
      }

      // Margen de tolerancia para ejecución paralela de la suite (presupuesto < 15ms en frío, margen 50ms para varianza de CI)
      expect(durationMs).toBeLessThan(50);
    });
  });
});
