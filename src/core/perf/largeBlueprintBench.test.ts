import { describe, it, expect } from 'vitest';
import {
  generateLargeBlueprintPdf,
  generateSyntheticMarkups,
  calculateCanvasDimensions,
  E_SIZE_WIDTH_PT,
  E_SIZE_HEIGHT_PT,
  CHROMIUM_MAX_CANVAS_DIMENSION,
} from './largeBlueprintGenerator';
import { hitTestMarkup, selectMarkupsInRect } from '../../utils/coordinates';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { Markup, MarkupPoint } from '../../types/markup';

describe('largeBlueprintBench (ADR-0088 / Hito D.1)', () => {
  it(
    'mide tiempo de primer render, hit-testing con 5000 marcas y memoria de guardado sobre plano E-size sintético',
    async () => {
      const pageDims = { width: E_SIZE_WIDTH_PT, height: E_SIZE_HEIGHT_PT };

      // 1. Carga y verificación de geometría de plano E-Size (3600 x 2400 pt)
      const t0Parse = performance.now();
      const pdfBytes = await generateLargeBlueprintPdf({
        width: E_SIZE_WIDTH_PT,
        height: E_SIZE_HEIGHT_PT,
      });
      const tParseMs = +(performance.now() - t0Parse).toFixed(2);

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(5000);

      const { PDFDocument } = await import('pdf-lib');
      const loadedDoc = await PDFDocument.load(pdfBytes);
      const page = loadedDoc.getPage(0);
      expect(page.getWidth()).toBe(E_SIZE_WIDTH_PT);
      expect(page.getHeight()).toBe(E_SIZE_HEIGHT_PT);

      // 2. Generación de 5 000 marcas sintéticas
      const t0Markups = performance.now();
      const markups = generateSyntheticMarkups(5000, { seed: 42 });
      const tGenMarkupsMs = +(performance.now() - t0Markups).toFixed(2);
      expect(markups).toHaveLength(5000);

      // 3. Benchmark de Hit-Testing Lineal (O(N) sobre 5 000 marcas)
      // Se ejecutan 50 consultas de puntero (25 aciertos sobre vértices reales y 25 fallos en márgenes)
      const sampleQueries: MarkupPoint[] = [];
      for (let i = 0; i < 25; i++) {
        sampleQueries.push(markups[i * 200].points[0]);
      }
      for (let i = 0; i < 25; i++) {
        sampleQueries.push({ x: 0.01 + (i * 0.001), y: 0.01 + (i * 0.001) }); // márgenes vacíos
      }

      const hitTestDurations: number[] = [];
      let totalHits = 0;

      for (const query of sampleQueries) {
        const qStart = performance.now();
        let hit: Markup | undefined;
        // Búsqueda lineal inversa estándar (de la marca superior a la inferior)
        for (let j = markups.length - 1; j >= 0; j--) {
          if (hitTestMarkup(query, markups[j], 0.015, pageDims)) {
            hit = markups[j];
            break;
          }
        }
        const qDur = performance.now() - qStart;
        hitTestDurations.push(qDur);
        if (hit) totalHits++;
      }

      const avgHitTestMs = +(hitTestDurations.reduce((a, b) => a + b, 0) / hitTestDurations.length).toFixed(3);
      const worstHitTestMs = +(Math.max(...hitTestDurations)).toFixed(3);

      expect(totalHits).toBeGreaterThanOrEqual(20);
      expect(hitTestDurations).toHaveLength(50);

      // 4. Benchmark de Selección por Ventana Marquee (selectMarkupsInRect)
      // Ventana pequeña (10% de la hoja)
      const t0Marquee10 = performance.now();
      const selected10 = selectMarkupsInRect(
        markups,
        { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
        pageDims
      );
      const marquee10Ms = +(performance.now() - t0Marquee10).toFixed(2);
      expect(selected10.length).toBeGreaterThan(0);

      // Ventana grande (50% de la hoja)
      const t0Marquee50 = performance.now();
      const selected50 = selectMarkupsInRect(
        markups,
        { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        pageDims
      );
      const marquee50Ms = +(performance.now() - t0Marquee50).toFixed(2);
      expect(selected50.length).toBeGreaterThan(selected10.length);

      // 5. Benchmark de Guardado Incremental ISO 32000-1 con 5 000 marcas
      const t0Save = performance.now();
      const savedBytes = await saveIncrementalMarkups(
        pdfBytes,
        markups,
        {
          0: {
            rotation: 0,
            widthPt: E_SIZE_WIDTH_PT,
            heightPt: E_SIZE_HEIGHT_PT,
            originX: 0,
            originY: 0,
          },
        }
      );
      const incrementalSaveMs = +(performance.now() - t0Save).toFixed(2);

      // Invariante dura: el PDF original se conserva intacto como prefijo exacto de bytes (100% byte-for-byte)
      expect(savedBytes.length).toBeGreaterThan(pdfBytes.length);
      expect(savedBytes.subarray(0, pdfBytes.length)).toEqual(pdfBytes);

      const addedBytes = savedBytes.length - pdfBytes.length;

      // 6. Análisis del Acantilado de Canvas en Chromium (16 384 px)
      const limits100 = calculateCanvasDimensions(1.0, 1.0);
      const limits200 = calculateCanvasDimensions(2.0, 1.0);
      const limits400 = calculateCanvasDimensions(4.0, 1.0);
      const limits456 = calculateCanvasDimensions(4.56, 1.0);
      const limits600 = calculateCanvasDimensions(6.0, 1.0);
      const limits250Dpr2 = calculateCanvasDimensions(2.5, 2.0);

      expect(limits100.isSafeForUntiledCanvas).toBe(true);
      expect(limits200.isSafeForUntiledCanvas).toBe(true);
      expect(limits400.isSafeForUntiledCanvas).toBe(true);
      expect(limits456.exceedsMaxDimension).toBe(true);
      expect(limits456.isSafeForUntiledCanvas).toBe(false);
      expect(limits600.exceedsMaxDimension).toBe(true);
      expect(limits250Dpr2.exceedsMaxDimension).toBe(true);

      // Resumen estructurado registrado en consola para BASELINE.md
      const resultsSummary = {
        sheetSizePt: `${E_SIZE_WIDTH_PT} x ${E_SIZE_HEIGHT_PT}`,
        sheetInitMs: tParseMs,
        markupsCount: markups.length,
        markupsGenerationMs: tGenMarkupsMs,
        hitTest: {
          queriesRun: 50,
          avgLatencyMs: avgHitTestMs,
          worstLatencyMs: worstHitTestMs,
        },
        marquee: {
          window10PercentMs: marquee10Ms,
          window50PercentMs: marquee50Ms,
        },
        incrementalSave: {
          serializationMs: incrementalSaveMs,
          originalSizeBytes: pdfBytes.length,
          savedSizeBytes: savedBytes.length,
          addedSizeBytes: addedBytes,
        },
        canvasCliff: {
          safeUntiledMaxZoomDpr1: '455%',
          safeUntiledMaxZoomDpr2: '227%',
          chromiumMaxDimensionPx: CHROMIUM_MAX_CANVAS_DIMENSION,
        },
      };

      console.log('[BASELINE_RESULTS]', JSON.stringify(resultsSummary, null, 2));

      // Comprobación de integridad global
      expect(resultsSummary.markupsCount).toBe(5000);
      expect(resultsSummary.incrementalSave.addedSizeBytes).toBeGreaterThan(100_000);
    },
    60_000
  );
});
