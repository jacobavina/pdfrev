import { describe, it, expect } from 'vitest';
import {
  normalizedToPdfCoordinates,
  pdfToNormalizedCoordinates,
  parseCssColorRgb,
  emitMarkupOperators,
  PageTransformInfo,
} from './operators';
import { Markup } from '../../types/markup';

describe('Pure PDF Operator Emitter (P3-B.1 / ISO 32000-1)', () => {
  const baseTransform: PageTransformInfo = {
    rotation: 0,
    widthPt: 600,
    heightPt: 800,
    originX: 0,
    originY: 0,
  };

  describe('Inversibilidad de Coordenadas (normalizedToPdf <-> pdfToNormalized)', () => {
    const testPoints = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.25, y: 0.75 },
      { x: 0.5, y: 0.5 },
      { x: 0.125, y: 0.4167 },
    ];

    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];

    rotations.forEach((rot) => {
      it(`garantiza identidad matemática ida y vuelta con rotación ${rot}°`, () => {
        const transform: PageTransformInfo = {
          ...baseTransform,
          rotation: rot,
          originX: 36, // MediaBox / CropBox con margen
          originY: 54,
        };

        for (const pt of testPoints) {
          const pdfPt = normalizedToPdfCoordinates(pt, transform);
          const restored = pdfToNormalizedCoordinates(pdfPt, transform);

          expect(restored.x).toBeCloseTo(pt.x, 5);
          expect(restored.y).toBeCloseTo(pt.y, 5);
        }
      });
    });
  });

  describe('Parser de Colores CSS a RGB Normalizado', () => {
    it('parsea hex 3, hex 6, rgb y rgba con precisión', () => {
      expect(parseCssColorRgb('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
      expect(parseCssColorRgb('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
      expect(parseCssColorRgb('rgb(0, 255, 0)')).toEqual({ r: 0, g: 1, b: 0, a: 1 });
      expect(parseCssColorRgb('rgba(0, 0, 255, 0.5)')).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
      expect(parseCssColorRgb('transparent')).toBeNull();
      expect(parseCssColorRgb(undefined)).toBeNull();
    });
  });

  describe('Emisión de Operadores por Tipo de Marca', () => {
    const baseMarkup: Omit<Markup, 'id' | 'type' | 'points' | 'style' | 'pageIndex'> = {
      author: 'Tester',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
      status: 'pending',
    };

    it('emite operadores válidos para Rectángulo con trazo y relleno', () => {
      const mk: Markup = {
        ...baseMarkup,
        id: 'mk-rect',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }],
        style: { strokeColor: '#ff0000', fillColor: '#00ff00', strokeWidth: 2, opacity: 1 },
      };

      const result = emitMarkupOperators(mk, baseTransform);
      expect(result.operators).toContain('q');
      expect(result.operators).toContain('Q');
      expect(result.operators).toContain('2.00 w');
      expect(result.operators).toContain('1.000 0.000 0.000 RG'); // Borde rojo
      expect(result.operators).toContain('0.000 1.000 0.000 rg'); // Relleno verde
      expect(result.operators).toContain('re');
      expect(result.operators).toContain('B'); // Fill and stroke
      expect(result.bbox[2]).toBeGreaterThan(result.bbox[0]);
      expect(result.bbox[3]).toBeGreaterThan(result.bbox[1]);
    });

    it('emite aproximación cúbica Bézier para Círculo/Elipse con kappa=0.55228', () => {
      const mk: Markup = {
        ...baseMarkup,
        id: 'mk-circ',
        type: 'circle',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }],
        style: { strokeColor: '#0000ff', strokeWidth: 1.5, opacity: 1 },
      };

      const result = emitMarkupOperators(mk, baseTransform);
      expect(result.operators).toContain('1.50 w');
      expect(result.operators).toContain('m');
      // Debe contener 4 comandos de curva cúbica 'c'
      const cCount = (result.operators.match(/\sc\n/g) || []).length;
      expect(cCount).toBe(4);
      expect(result.operators).toContain('S'); // Stroke only
    });

    it('emite camino m/l para Línea simple', () => {
      const mk: Markup = {
        ...baseMarkup,
        id: 'mk-line',
        type: 'line',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }],
        style: { strokeColor: '#111111', strokeWidth: 1, opacity: 1 },
      };

      const result = emitMarkupOperators(mk, baseTransform);
      expect(result.operators).toContain('m');
      expect(result.operators).toContain('l');
      expect(result.operators).toContain('S');
    });

    it('emite cierre de camino h para Polígono y camino m/l para Línea', () => {
      const poly: Markup = {
        ...baseMarkup,
        id: 'mk-poly',
        type: 'polygon',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.2 }, { x: 0.3, y: 0.8 }],
        style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      };

      const line: Markup = {
        ...baseMarkup,
        id: 'mk-line2',
        type: 'line',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.2 }],
        style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      };

      const resPoly = emitMarkupOperators(poly, baseTransform);
      const resLine = emitMarkupOperators(line, baseTransform);

      expect(resPoly.operators).toContain('h'); // Cerrado
      expect(resLine.operators).not.toContain('h'); // Abierto
    });

    it('emite ExtGState Multiply y amarillo para Resaltador vectorial', () => {
      const mk: Markup = {
        ...baseMarkup,
        id: 'mk-hl',
        type: 'highlightVector',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.2 }],
        style: { strokeColor: '#ffff00', fillColor: '#ffff00', strokeWidth: 1, opacity: 0.5 },
      };

      const result = emitMarkupOperators(mk, baseTransform);
      expect(result.extGState?.bm).toBe('/Multiply');
      expect(result.extGState?.ca).toBe(0.5);
      expect(result.operators).toContain('/GS_HL gs');
      expect(result.operators).toContain('1 1 0 rg');
    });

    it('emite caja cuadrada de 24x24 pt para Nota Adhesiva', () => {
      const mk: Markup = {
        ...baseMarkup,
        id: 'mk-sticky',
        type: 'stickyNote',
        pageIndex: 0,
        points: [{ x: 0.3, y: 0.3 }],
        style: { strokeColor: '#16a34a', fillColor: '#bbf7d0', strokeWidth: 1, opacity: 1 },
      };

      const result = emitMarkupOperators(mk, baseTransform);
      expect(result.operators).toContain('24 24 re');
      expect(result.operators).toContain('B');
    });

    it('configura parámetros de transparencia en extGState si opacity < 1', () => {
      const mk: Markup = {
        ...baseMarkup,
        id: 'mk-trans',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
        style: { strokeColor: '#000000', fillColor: '#ffffff', strokeWidth: 1, opacity: 0.7 },
      };

      const result = emitMarkupOperators(mk, baseTransform);
      expect(result.extGState?.CA).toBeCloseTo(0.7, 2);
      expect(result.extGState?.ca).toBeCloseTo(0.7, 2);
    });

    it('emite camino m/l sin cierre h para polyLine (polilínea abierta)', () => {
      const mk: Markup = {
        ...baseMarkup,
        id: 'mk-polyline',
        type: 'polyLine',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.4 },
          { x: 0.6, y: 0.2 },
        ],
        style: { strokeColor: '#0284c7', strokeWidth: 2, opacity: 1 },
      };

      const result = emitMarkupOperators(mk, baseTransform);
      expect(result.operators).toContain('m');
      expect(result.operators).toContain('l');
      expect(result.operators).not.toContain('h'); // Polilínea abierta: NO se cierra
      expect(result.operators).toContain('S');
    });

    it('emite trazo de línea en la base para underline y en el centro para strikeOut', () => {
      const mkUnderline: Markup = {
        ...baseMarkup,
        id: 'mk-und',
        type: 'underline',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.2 },
        ],
        style: { strokeColor: '#e02424', strokeWidth: 1.5, opacity: 1 },
      };

      const mkStrike: Markup = {
        ...baseMarkup,
        id: 'mk-strk',
        type: 'strikeOut',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.2 },
        ],
        style: { strokeColor: '#e02424', strokeWidth: 1.5, opacity: 1 },
      };

      const resUnd = emitMarkupOperators(mkUnderline, baseTransform);
      const resStrk = emitMarkupOperators(mkStrike, baseTransform);

      expect(resUnd.operators).toContain('m');
      expect(resUnd.operators).toContain('l');
      expect(resUnd.operators).toContain('S');

      expect(resStrk.operators).toContain('m');
      expect(resStrk.operators).toContain('l');
      expect(resStrk.operators).toContain('S');
    });

    it('emite camino en zigzag en la base para squiggly (ADR-0072)', () => {
      const mkSquiggly: Markup = {
        ...baseMarkup,
        id: 'mk-sqg',
        type: 'squiggly',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.2 },
        ],
        style: { strokeColor: '#e02424', strokeWidth: 1.5, opacity: 1 },
      };

      const resSqg = emitMarkupOperators(mkSquiggly, baseTransform);
      expect(resSqg.operators).toContain('m');
      expect((resSqg.operators.match(/\sl\n/g) || []).length).toBeGreaterThan(5);
      expect(resSqg.operators).toContain('S');
      expect(resSqg.bbox[2]).toBeGreaterThan(resSqg.bbox[0]);
      expect(resSqg.bbox[3]).toBeGreaterThan(resSqg.bbox[1]);
    });

    it('emite curva Bézier cúbica y calcula bbox real para arc (ADR-0081)', () => {
      const mkArc: Markup = {
        ...baseMarkup,
        id: 'mk-arc',
        type: 'arc',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.25, y: 0.35 },
          { x: 0.5, y: 0.1 },
        ],
        style: { strokeColor: '#0284c7', strokeWidth: 2, opacity: 1 },
      };

      const resArc = emitMarkupOperators(mkArc, baseTransform);
      expect(resArc.operators).toContain('m');
      expect(resArc.operators).toContain('c');
      expect(resArc.operators).toContain('S');
      expect(resArc.bbox[2]).toBeGreaterThan(resArc.bbox[0]);
      expect(resArc.bbox[3]).toBeGreaterThan(resArc.bbox[1]);
    });
  });
});
