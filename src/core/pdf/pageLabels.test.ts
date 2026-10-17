import { describe, it, expect, vi } from 'vitest';
import {
  toRomanNumerals,
  toAlphaNumerals,
  formatPageLabel,
  buildPageLabelsMap,
  loadPageLabels,
  extractPageLabelsFromPdfBytes,
  PageLabelRange,
} from './pageLabels';

describe('pageLabels (ADR-0086: Soporte de Etiquetas de Página /PageLabels)', () => {
  describe('toRomanNumerals', () => {
    it('convierte números a números romanos mayúsculas y minúsculas', () => {
      expect(toRomanNumerals(1)).toBe('I');
      expect(toRomanNumerals(4)).toBe('IV');
      expect(toRomanNumerals(9)).toBe('IX');
      expect(toRomanNumerals(14)).toBe('XIV');
      expect(toRomanNumerals(42)).toBe('XLII');
      expect(toRomanNumerals(1984)).toBe('MCMLXXXIV');

      expect(toRomanNumerals(1, true)).toBe('i');
      expect(toRomanNumerals(4, true)).toBe('iv');
      expect(toRomanNumerals(9, true)).toBe('ix');
      expect(toRomanNumerals(42, true)).toBe('xlii');
    });

    it('devuelve cadena segura si el número es <= 0 o no entero finito', () => {
      expect(toRomanNumerals(0)).toBe('0');
      expect(toRomanNumerals(-5)).toBe('-5');
    });
  });

  describe('toAlphaNumerals', () => {
    it('convierte números a letras según ISO 32000-1 (A..Z, AA..ZZ...)', () => {
      expect(toAlphaNumerals(1)).toBe('A');
      expect(toAlphaNumerals(2)).toBe('B');
      expect(toAlphaNumerals(26)).toBe('Z');
      expect(toAlphaNumerals(27)).toBe('AA');
      expect(toAlphaNumerals(28)).toBe('BB');
      expect(toAlphaNumerals(52)).toBe('ZZ');
      expect(toAlphaNumerals(53)).toBe('AAA');

      expect(toAlphaNumerals(1, true)).toBe('a');
      expect(toAlphaNumerals(26, true)).toBe('z');
      expect(toAlphaNumerals(27, true)).toBe('aa');
    });

    it('devuelve cadena segura si el número es <= 0', () => {
      expect(toAlphaNumerals(0)).toBe('0');
    });
  });

  describe('formatPageLabel', () => {
    it('formatea etiquetas con estilo decimal (/D)', () => {
      const range: PageLabelRange = { startPage: 0, style: 'D', startNum: 1 };
      expect(formatPageLabel(0, range)).toBe('1');
      expect(formatPageLabel(1, range)).toBe('2');
      expect(formatPageLabel(2, range)).toBe('3');
    });

    it('formatea etiquetas con prefijo técnico y estilo decimal', () => {
      const range: PageLabelRange = { startPage: 4, prefix: 'A-', style: 'D', startNum: 101 };
      expect(formatPageLabel(4, range)).toBe('A-101');
      expect(formatPageLabel(5, range)).toBe('A-102');
      expect(formatPageLabel(6, range)).toBe('A-103');
    });

    it('formatea etiquetas con números romanos minúsculas (/r)', () => {
      const range: PageLabelRange = { startPage: 1, style: 'r', startNum: 1 };
      expect(formatPageLabel(1, range)).toBe('i');
      expect(formatPageLabel(2, range)).toBe('ii');
      expect(formatPageLabel(3, range)).toBe('iii');
      expect(formatPageLabel(4, range)).toBe('iv');
    });

    it('formatea etiquetas con prefijo puro sin estilo numérico', () => {
      const range: PageLabelRange = { startPage: 0, prefix: 'Cover' };
      expect(formatPageLabel(0, range)).toBe('Cover');
    });
  });

  describe('buildPageLabelsMap', () => {
    it('construye un mapa continuo de etiquetas a través de múltiples rangos mixtos', () => {
      const ranges: PageLabelRange[] = [
        { startPage: 0, prefix: 'Cover' },
        { startPage: 1, style: 'r', startNum: 1 },
        { startPage: 4, prefix: 'A-', style: 'D', startNum: 101 },
      ];

      const map = buildPageLabelsMap(ranges, 7);

      expect(map[0]).toBe('Cover');
      expect(map[1]).toBe('i');
      expect(map[2]).toBe('ii');
      expect(map[3]).toBe('iii');
      expect(map[4]).toBe('A-101');
      expect(map[5]).toBe('A-102');
      expect(map[6]).toBe('A-103');
    });

    it('devuelve mapa vacío si numPages es <= 0 o no hay rangos', () => {
      expect(buildPageLabelsMap([], 5)).toEqual({});
      expect(buildPageLabelsMap([{ startPage: 0, style: 'D' }], 0)).toEqual({});
    });

    it('aplica numeración decimal estándar a las páginas anteriores al primer rango si no empieza en 0 (ISO 32000-1 §12.4.2)', () => {
      const ranges: PageLabelRange[] = [
        { startPage: 3, prefix: 'A-', style: 'D', startNum: 101 },
      ];
      const map = buildPageLabelsMap(ranges, 5);
      expect(map[0]).toBe('1');
      expect(map[1]).toBe('2');
      expect(map[2]).toBe('3');
      expect(map[3]).toBe('A-101');
      expect(map[4]).toBe('A-102');
    });
  });

  describe('loadPageLabels', () => {
    it('obtiene las etiquetas directamente de pdfDoc.getPageLabels() si está disponible', async () => {
      const mockPdfDoc = {
        getPageLabels: vi.fn().mockResolvedValue(['Cover', 'i', 'ii', 'A-101']),
      };

      const result = await loadPageLabels(mockPdfDoc);
      expect(result).toEqual({
        0: 'Cover',
        1: 'i',
        2: 'ii',
        3: 'A-101',
      });
    });

    it('recurre a extractPageLabelsFromPdfBytes si pdfDoc no tiene getPageLabels() o devuelve null', async () => {
      const { PDFDocument, PDFName, PDFString } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      doc.addPage([500, 500]);
      doc.addPage([500, 500]);
      doc.addPage([500, 500]);

      // Construir diccionario /PageLabels en el catálogo
      const pageLabelsDict = doc.context.obj({
        Nums: [
          0,
          doc.context.obj({ P: PDFString.of('Portadas') }),
          1,
          doc.context.obj({ S: PDFName.of('r'), St: 1 }),
        ],
      });

      doc.catalog.set(PDFName.of('PageLabels'), pageLabelsDict);
      const pdfBytes = await doc.save();

      const direct = await extractPageLabelsFromPdfBytes(pdfBytes);
      const result = await loadPageLabels(null, pdfBytes);
      expect(direct).toEqual(result);
      expect(result).not.toBeNull();
      expect(result?.[0]).toBe('Portadas');
      expect(result?.[1]).toBe('i');
      expect(result?.[2]).toBe('ii');
    });

    it('devuelve null si no hay etiquetas ni en pdfDoc ni en bytes', async () => {
      const result = await loadPageLabels(null, null);
      expect(result).toBeNull();
    });
  });
});
