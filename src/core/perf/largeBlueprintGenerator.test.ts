import { describe, it, expect } from 'vitest';
import {
  createPrng,
  generateLargeBlueprintPdf,
  generateSyntheticMarkups,
  calculateCanvasDimensions,
  E_SIZE_WIDTH_PT,
  E_SIZE_HEIGHT_PT,
  CHROMIUM_MAX_CANVAS_DIMENSION,
} from './largeBlueprintGenerator';

describe('largeBlueprintGenerator (ADR-0088 / Hito D.1)', () => {
  describe('createPrng (Mulberry32)', () => {
    it('es 100% determinista con la misma semilla', () => {
      const prngA = createPrng(42);
      const prngB = createPrng(42);

      const seqA = [prngA(), prngA(), prngA(), prngA(), prngA()];
      const seqB = [prngB(), prngB(), prngB(), prngB(), prngB()];

      expect(seqA).toEqual(seqB);
      seqA.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      });
    });

    it('produce secuencias distintas con semillas diferentes', () => {
      const prng1 = createPrng(42);
      const prng2 = createPrng(99);

      expect(prng1()).not.toEqual(prng2());
    });
  });

  describe('generateLargeBlueprintPdf', () => {
    it('genera un PDF binario E-Size válido con dimensiones 3600 x 2400 pt', async () => {
      const bytes = await generateLargeBlueprintPdf({ width: 3600, height: 2400 });
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);

      // Cabecera mágica de PDF
      const header = new TextDecoder().decode(bytes.slice(0, 5));
      expect(header).toBe('%PDF-');

      // Validar dimensiones con pdf-lib
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);

      const page = doc.getPage(0);
      expect(page.getWidth()).toBe(E_SIZE_WIDTH_PT);
      expect(page.getHeight()).toBe(E_SIZE_HEIGHT_PT);
    });
  });

  describe('generateSyntheticMarkups', () => {
    it('genera exactamente 5 000 marcas sintéticas deterministas', () => {
      const markups = generateSyntheticMarkups(5000, { seed: 42 });
      expect(markups).toHaveLength(5000);

      // Todas las marcas tienen campos mandatorios y coordenadas válidas en [0.0, 1.0]
      for (let i = 0; i < markups.length; i++) {
        const m = markups[i];
        expect(m.id).toBe(`synth-markup-${i + 1}`);
        expect(m.pageIndex).toBe(0);
        expect(m.points.length).toBeGreaterThanOrEqual(1);
        expect(m.status).toBe('pending');
        expect(m.author).toBeDefined();

        for (const pt of m.points) {
          expect(pt.x).toBeGreaterThanOrEqual(0);
          expect(pt.x).toBeLessThanOrEqual(1);
          expect(pt.y).toBeGreaterThanOrEqual(0);
          expect(pt.y).toBeLessThanOrEqual(1);
        }
      }

      // Distribución cubre mediciones, rectángulos, nubes y llamadas
      const types = new Set(markups.map((m) => m.type));
      expect(types.has('length')).toBe(true);
      expect(types.has('area')).toBe(true);
      expect(types.has('rectangle')).toBe(true);
      expect(types.has('cloud')).toBe(true);
      expect(types.has('callout')).toBe(true);
      expect(types.has('text')).toBe(true);
      expect(types.has('count')).toBe(true);

      // Grupos vinculados
      const grouped = markups.filter((m) => m.groupId !== undefined);
      expect(grouped.length).toBeGreaterThan(100);
    });
  });

  describe('calculateCanvasDimensions (Límite Chromium 16 384 px)', () => {
    it('calcula dimensiones seguras para zoom estándar (100% y 200% con DPR=1)', () => {
      const z100 = calculateCanvasDimensions(1.0, 1.0);
      expect(z100.widthPx).toBe(3600);
      expect(z100.heightPx).toBe(2400);
      expect(z100.totalMegaPixels).toBe(8.64);
      expect(z100.exceedsMaxDimension).toBe(false);
      expect(z100.isSafeForUntiledCanvas).toBe(true);

      const z200 = calculateCanvasDimensions(2.0, 1.0);
      expect(z200.widthPx).toBe(7200);
      expect(z200.heightPx).toBe(4800);
      expect(z200.totalMegaPixels).toBe(34.56);
      expect(z200.exceedsMaxDimension).toBe(false);
      expect(z200.isSafeForUntiledCanvas).toBe(true);
    });

    it('detecta superación del límite máximo de Chromium (> 16 384 px)', () => {
      // A 456% de zoom (DPR=1), 3600 * 4.56 = 16 416 px > 16 384 px
      const z456 = calculateCanvasDimensions(4.56, 1.0);
      expect(z456.widthPx).toBeGreaterThan(CHROMIUM_MAX_CANVAS_DIMENSION);
      expect(z456.exceedsMaxDimension).toBe(true);
      expect(z456.isSafeForUntiledCanvas).toBe(false);

      // En pantallas de alta densidad (Retina DPR=2), el límite se supera a partir de 228% de zoom
      const z250Dpr2 = calculateCanvasDimensions(2.5, 2.0);
      expect(z250Dpr2.widthPx).toBe(18000);
      expect(z250Dpr2.exceedsMaxDimension).toBe(true);
      expect(z250Dpr2.isSafeForUntiledCanvas).toBe(false);
    });
  });
});
