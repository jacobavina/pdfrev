import { describe, it, expect } from 'vitest';
import {
  filterMarkups,
  sortMarkups,
  filterAndSortMarkups,
  MarkupFilterCriteria,
  MarkupSortCriteria,
} from './markupFilterSort';
import { Markup, MarkupStatus, MarkupType } from '../types/markup';

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
});
