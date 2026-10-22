import { describe, it, expect } from 'vitest';
import {
  SpatialIndex,
  getSpatialIndexForPage,
  DEFAULT_GRID_RESOLUTION,
} from './spatialIndex';
import { Markup, BoundingBox } from '../../types/markup';
import { generateSyntheticMarkups } from '../perf/largeBlueprintGenerator';

function createMockMarkup(id: string, bounds: BoundingBox, pageIndex = 0, groupId?: string): Markup {
  return {
    id,
    type: 'rectangle',
    pageIndex,
    points: [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ],
    style: {
      strokeColor: '#000000',
      strokeWidth: 2,
      opacity: 1,
      fillColor: '#ff0000',
    },
    author: 'Test User',
    createdAt: '2026-10-17T12:00:00.000Z',
    updatedAt: '2026-10-17T12:00:00.000Z',
    status: 'pending',
    groupId,
  };
}

describe('SpatialIndex 2D Grid (ADR-0089 / Hito D.2)', () => {
  describe('operaciones fundamentales en grilla celular', () => {
    it('maneja una grilla vacía sin errores retornando colecciones vacías', () => {
      const index = new SpatialIndex();
      expect(index.size).toBe(0);
      expect(index.queryPoint({ x: 0.5, y: 0.5 })).toEqual([]);
      expect(index.queryRect({ x: 0.2, y: 0.2, width: 0.3, height: 0.3 })).toEqual([]);
      expect(index.hitTest({ x: 0.5, y: 0.5 }, 0.015)).toBeUndefined();
      expect(index.selectInRect({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })).toEqual([]);
    });

    it('indexa e identifica marcas individuales mediante queryPoint y queryRect', () => {
      const index = new SpatialIndex({ gridResolution: 20 });
      const m1 = createMockMarkup('m1', { x: 0.1, y: 0.1, width: 0.05, height: 0.05 });
      const m2 = createMockMarkup('m2', { x: 0.8, y: 0.8, width: 0.1, height: 0.1 });

      index.build([m1, m2]);
      expect(index.size).toBe(2);

      // Consulta sobre m1
      const queryM1 = index.queryPoint({ x: 0.12, y: 0.12 }, 0.01);
      expect(queryM1.map((m) => m.id)).toContain('m1');
      expect(queryM1.map((m) => m.id)).not.toContain('m2');

      // Consulta sobre m2
      const queryM2 = index.queryPoint({ x: 0.85, y: 0.85 }, 0.01);
      expect(queryM2.map((m) => m.id)).toContain('m2');
      expect(queryM2.map((m) => m.id)).not.toContain('m1');

      // Consulta en región vacía intermedia
      const queryEmpty = index.queryPoint({ x: 0.5, y: 0.5 }, 0.01);
      expect(queryEmpty).toHaveLength(0);

      // queryRect abarcando solo m1
      const rectM1 = index.queryRect({ x: 0.05, y: 0.05, width: 0.15, height: 0.15 });
      expect(rectM1.map((m) => m.id)).toEqual(['m1']);

      // queryRect global abarcando ambas
      const rectAll = index.queryRect({ x: 0, y: 0, width: 1, height: 1 });
      expect(rectAll.map((m) => m.id)).toEqual(expect.arrayContaining(['m1', 'm2']));
    });

    it('preserva estrictamente el orden Z inverso en hitTest devolviendo la marca superior', () => {
      const index = new SpatialIndex();
      // Dos marcas superpuestas en el mismo lugar
      const bottom = createMockMarkup('bottom', { x: 0.3, y: 0.3, width: 0.2, height: 0.2 });
      const top = createMockMarkup('top', { x: 0.3, y: 0.3, width: 0.2, height: 0.2 });

      index.build([bottom, top]);

      const hit = index.hitTest({ x: 0.35, y: 0.35 }, 0.015);
      expect(hit).toBeDefined();
      expect(hit?.id).toBe('top');
    });

    it('expande automáticamente marcas con el mismo groupId en selectInRect', () => {
      const index = new SpatialIndex();
      const g1a = createMockMarkup('g1a', { x: 0.1, y: 0.1, width: 0.05, height: 0.05 }, 0, 'group-1');
      const g1b = createMockMarkup('g1b', { x: 0.7, y: 0.7, width: 0.05, height: 0.05 }, 0, 'group-1');
      const isolated = createMockMarkup('isolated', { x: 0.9, y: 0.9, width: 0.05, height: 0.05 });

      index.build([g1a, g1b, isolated]);

      // Marquee abarca únicamente a g1a
      const selected = index.selectInRect({ x: 0.08, y: 0.08, width: 0.1, height: 0.1 });
      expect(selected).toContain('g1a');
      expect(selected).toContain('g1b'); // Expandido por pertenecer a group-1
      expect(selected).not.toContain('isolated');
    });

    it('soporta inserciones, actualizaciones y eliminaciones incrementales', () => {
      const index = new SpatialIndex();
      const m1 = createMockMarkup('m1', { x: 0.2, y: 0.2, width: 0.1, height: 0.1 });
      const m2 = createMockMarkup('m2', { x: 0.6, y: 0.6, width: 0.1, height: 0.1 });

      index.build([m1]);
      expect(index.size).toBe(1);

      // Inserción incremental
      index.insert(m2);
      expect(index.size).toBe(2);
      expect(index.queryPoint({ x: 0.65, y: 0.65 }, 0.01).map((m) => m.id)).toContain('m2');

      // Actualización incremental (m2 se mueve a 0.8, 0.8)
      const m2Updated = createMockMarkup('m2', { x: 0.8, y: 0.8, width: 0.1, height: 0.1 });
      index.update(m2Updated);
      expect(index.size).toBe(2);
      expect(index.queryPoint({ x: 0.65, y: 0.65 }, 0.01)).toHaveLength(0);
      expect(index.queryPoint({ x: 0.85, y: 0.85 }, 0.01).map((m) => m.id)).toContain('m2');

      // Eliminación incremental
      index.remove('m1');
      expect(index.size).toBe(1);
      expect(index.queryPoint({ x: 0.25, y: 0.25 }, 0.01)).toHaveLength(0);
    });

    it('utiliza memoización por referencia con getSpatialIndexForPage', () => {
      const markups = [
        createMockMarkup('p0-1', { x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, 0),
        createMockMarkup('p1-1', { x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, 1),
      ];

      const indexPage0A = getSpatialIndexForPage(markups, 0);
      const indexPage0B = getSpatialIndexForPage(markups, 0);
      const indexPage1 = getSpatialIndexForPage(markups, 1);

      expect(indexPage0A).toBe(indexPage0B); // Misma instancia en caché
      expect(indexPage0A).not.toBe(indexPage1);
      expect(indexPage0A.size).toBe(1);
      expect(indexPage1.size).toBe(1);
    });

    it('filtra eficazmente marcas para culling de viewport reduciendo elementos en pantalla', () => {
      const markups = generateSyntheticMarkups(500, { seed: 42 });
      const index = new SpatialIndex();
      index.build(markups);

      // Viewport visible enfocado en una esquina (15% del ancho y alto)
      const visibleViewport: BoundingBox = { x: 0.1, y: 0.1, width: 0.15, height: 0.15 };
      const visibleMarkups = index.queryRect(visibleViewport);

      expect(visibleMarkups.length).toBeGreaterThan(0);
      expect(visibleMarkups.length).toBeLessThan(markups.length / 5);
    });
  });

  describe('Benchmark de Escalabilidad con 5 000 Marcas (Requisito PARITY.md)', () => {
    it(
      'ejecuta hit-testing y selección marquee sobre 5 000 marcas en menos de 10 ms mediante índice espacial',
      () => {
        const pageDims = { width: 3600, height: 2400 };

        // 1. Generar 5 000 marcas sintéticas deterministas
        const markups = generateSyntheticMarkups(5000, { seed: 42 });
        expect(markups).toHaveLength(5000);

        // 2. Construcción del índice espacial
        const t0Build = performance.now();
        const index = new SpatialIndex({ gridResolution: DEFAULT_GRID_RESOLUTION });
        index.build(markups, pageDims);
        const buildDurationMs = +(performance.now() - t0Build).toFixed(2);
        expect(index.size).toBe(5000);

        // 3. Preparar 20 consultas de hit-testing (10 impactos exactos + 10 en márgenes)
        const queries: { x: number; y: number }[] = [];
        for (let i = 0; i < 10; i++) {
          queries.push(markups[i * 500].points[0]);
        }
        for (let i = 0; i < 10; i++) {
          queries.push({ x: 0.01 + i * 0.001, y: 0.01 + i * 0.001 });
        }

        // Warm-up de V8 JIT para compilar los métodos antes del muestreo medido
        index.hitTest(queries[0], 0.015, pageDims);
        index.selectInRect({ x: 0.5, y: 0.5, width: 0.01, height: 0.01 }, pageDims);

        // 4. Medir ejecución de las consultas de hit-testing + 2 selecciones de marquee. Se toma la mejor de 5
        // repeticiones: el SLO es de la estructura, y con la máquina cargada (suite completa en paralelo) una sola
        // medición mezclaba el coste de la planificación del sistema (ADR-0092).
        let hitCount = 0;
        let selected10: unknown[] = [];
        let selected50: unknown[] = [];
        let queryDurationMs = Infinity;
        for (let rep = 0; rep < 5; rep++) {
          const t0Queries = performance.now();
          hitCount = 0;
          for (const q of queries) {
            const hit = index.hitTest(q, 0.015, pageDims);
            if (hit) hitCount++;
          }
          // Marquee ventana pequeña (10% de la hoja)
          selected10 = index.selectInRect({ x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, pageDims);
          // Marquee ventana mediana (50% de la hoja)
          selected50 = index.selectInRect({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, pageDims);
          queryDurationMs = Math.min(queryDurationMs, +(performance.now() - t0Queries).toFixed(3));
        }

        // Verificaciones funcionales
        expect(hitCount).toBeGreaterThanOrEqual(8);
        expect(selected10.length).toBeGreaterThan(0);
        expect(selected50.length).toBeGreaterThan(selected10.length);

        console.log(`[SpatialIndex Bench] 5 000 marcas:
          - Tiempo de construcción: ${buildDurationMs} ms
          - Tiempo 20 hit-tests + 2 marquees: ${queryDurationMs} ms (objetivo < 10 ms)
          - Promedio por consulta: ${(queryDurationMs / 22).toFixed(3)} ms`);

        // Aserción dura de SLO (< 10 ms para hit-tests + marquees combinados)
        expect(queryDurationMs).toBeLessThan(10);
      }
    );
  });
});
