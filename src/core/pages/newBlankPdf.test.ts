// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  toPoints,
  fromPoints,
  convertUnit,
  NEW_PDF_TEMPLATES,
  createNewBlankPdf,
  loadDefaultNewPdfSettings,
  saveDefaultNewPdfSettings,
  type NewPdfOptions,
} from './newBlankPdf';

describe('newBlankPdf - Motor de Creación de PDFs en Blanco', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Conversiones de Unidades de Página', () => {
    it('convierte pulgadas a puntos de forma exacta (1 in = 72 pt)', () => {
      expect(toPoints(1, 'in')).toBe(72);
      expect(toPoints(8.5, 'in')).toBeCloseTo(612);
      expect(toPoints(11, 'in')).toBeCloseTo(792);
    });

    it('convierte milímetros y centímetros a puntos', () => {
      // 25.4 mm = 1 in = 72 pt
      expect(toPoints(25.4, 'mm')).toBeCloseTo(72, 2);
      // 2.54 cm = 1 in = 72 pt
      expect(toPoints(2.54, 'cm')).toBeCloseTo(72, 2);
    });

    it('convierte de puntos a unidades seleccionadas', () => {
      expect(fromPoints(72, 'in')).toBe(1);
      expect(fromPoints(72, 'pt')).toBe(72);
      expect(fromPoints(72, 'cm')).toBeCloseTo(2.54, 2);
    });

    it('convertUnit transforma entre dos unidades cualesquiera', () => {
      expect(convertUnit(1, 'in', 'pt')).toBe(72);
      expect(convertUnit(2.54, 'cm', 'in')).toBeCloseTo(1, 2);
      expect(convertUnit(10, 'mm', 'cm')).toBeCloseTo(1, 1);
    });
  });

  describe('Catálogo de Plantillas Estándar', () => {
    it('incluye plantillas comunes de arquitectura e ingeniería', () => {
      const ids = NEW_PDF_TEMPLATES.map((t) => t.id);
      expect(ids).toContain('custom');
      expect(ids).toContain('iso-a4');
      expect(ids).toContain('iso-a3');
      expect(ids).toContain('ansi-a');
      expect(ids).toContain('ansi-d');
      expect(ids).toContain('arch-d');
      expect(ids).toContain('arch-e');
    });
  });

  describe('Generación de Documentos PDF con pdf-lib', () => {
    it('genera un PDF en blanco con las dimensiones correctas en orientación vertical (Portrait)', async () => {
      const options: NewPdfOptions = {
        width: 8.5,
        height: 11,
        widthUnit: 'in',
        heightUnit: 'in',
        orientation: 'portrait',
        style: 'blank',
        pageCount: 1,
      };

      const bytes = await createNewBlankPdf(options);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);

      const page = doc.getPage(0);
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(612, 1);
      expect(height).toBeCloseTo(792, 1);
    });

    it('intercambia dimensiones al seleccionar orientación horizontal (Landscape)', async () => {
      const options: NewPdfOptions = {
        width: 21.0,
        height: 29.7,
        widthUnit: 'cm',
        heightUnit: 'cm',
        orientation: 'landscape',
        style: 'blank',
        pageCount: 2,
      };

      const bytes = await createNewBlankPdf(options);
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(2);

      const page = doc.getPage(0);
      const { width, height } = page.getSize();
      // En horizontal, width debe ser mayor que height
      expect(width).toBeGreaterThan(height);
      expect(width).toBeCloseTo(841.89, 1); // 29.7 cm en pt
      expect(height).toBeCloseTo(595.28, 1); // 21.0 cm en pt
    });

    it('soporta estilos vectoriales: grid, lined, y dotted', async () => {
      for (const style of ['grid', 'lined', 'dotted'] as const) {
        const bytes = await createNewBlankPdf({
          width: 8.5,
          height: 11,
          widthUnit: 'in',
          heightUnit: 'in',
          orientation: 'portrait',
          style,
          pageCount: 1,
        });

        const doc = await PDFDocument.load(bytes);
        expect(doc.getPageCount()).toBe(1);
        expect(bytes.length).toBeGreaterThan(600); // Contiene operadores vectoriales
      }
    });
  });

  describe('Persistencia de Preferencias por Defecto (Set as Default)', () => {
    it('devuelve A4 vertical en blanco si no hay valor guardado en localStorage', () => {
      const def = loadDefaultNewPdfSettings();
      expect(def.templateId).toBe('iso-a4');
      expect(def.orientation).toBe('portrait');
      expect(def.style).toBe('blank');
      expect(def.pageCount).toBe(1);
    });

    it('guarda y recupera la configuración de usuario seleccionada', () => {
      saveDefaultNewPdfSettings({
        templateId: 'arch-d',
        width: 24,
        height: 36,
        widthUnit: 'in',
        heightUnit: 'in',
        orientation: 'landscape',
        style: 'grid',
        pageCount: 3,
      });

      const loaded = loadDefaultNewPdfSettings();
      expect(loaded.templateId).toBe('arch-d');
      expect(loaded.width).toBe(24);
      expect(loaded.height).toBe(36);
      expect(loaded.orientation).toBe('landscape');
      expect(loaded.style).toBe('grid');
      expect(loaded.pageCount).toBe(3);
    });
  });
});
