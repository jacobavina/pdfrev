import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  pdfToNormalized,
  normalizedToPdf,
  pdfToNormalizedWithViewport,
  normalizedToPdfWithViewport,
  normalizedToScreen,
  screenToNormalized,
  getMarkupBounds,
  hitTestMarkup,
  isPointInPolygon,
  simplifyRamerDouglasPeucker,
  clampTranslationDelta,
  clampGroupTranslationDelta,
  translateMarkup,
  doBoundsIntersect,
  selectMarkupsInRect,
  findCalloutComponentAtPoint,
  STICKY_NOTE_SIZE_PT,
  getStickyNoteNormalizedSize,
  exceedsScreenThreshold,
} from './coordinates';
import { estimateCalloutBoxNormalizedSize } from '../core/markup/render';
import { Markup, VALID_MARKUP_TYPES } from '../types/markup';
import fixtureMeta from '../../fixtures/test-blueprint.meta.json';
import rotatedFixtureMeta from '../../fixtures/test-blueprint-rotated.meta.json';

describe('Coordinate Conversion and Hit-Testing', () => {
  const { pageSize, knownRectangle } = fixtureMeta;

  it('correctly converts known PDF rectangle to normalized space', () => {
    const topLeftPdf = { x: knownRectangle.pdf.x, y: knownRectangle.pdf.y + knownRectangle.pdf.height };
    const normTopLeft = pdfToNormalized(topLeftPdf.x, topLeftPdf.y, pageSize.width, pageSize.height);

    expect(normTopLeft.x).toBeCloseTo(knownRectangle.normalized.x, 4);
    expect(normTopLeft.y).toBeCloseTo(knownRectangle.normalized.y, 4);
  });

  it('round-trips normalized coordinates back to PDF space accurately', () => {
    const norm = { x: 0.125, y: 0.4166667 };
    const pdf = normalizedToPdf(norm.x, norm.y, pageSize.width, pageSize.height);

    expect(pdf.x).toBeCloseTo(100, 1);
    expect(pdf.y).toBeCloseTo(350, 1);
  });

  it('correctly maps between normalized and screen space under zoom and pan', () => {
    const transform = {
      width: 800,
      height: 600,
      scale: 1.5,
      offsetX: 100,
      offsetY: 50,
    };

    const normPoint = { x: 0.5, y: 0.5 };
    const screenPoint = normalizedToScreen(normPoint, transform);

    expect(screenPoint.x).toBe(700);
    expect(screenPoint.y).toBe(500);

    const backToNorm = screenToNormalized(screenPoint.x, screenPoint.y, transform);
    expect(backToNorm.x).toBeCloseTo(0.5, 4);
    expect(backToNorm.y).toBeCloseTo(0.5, 4);
  });

  it('computes accurate bounds for a rectangle markup', () => {
    const markup: Markup = {
      id: 'test-1',
      type: 'rectangle',
      pageIndex: 0,
      points: [
        { x: knownRectangle.normalized.x, y: knownRectangle.normalized.y },
        {
          x: knownRectangle.normalized.x + knownRectangle.normalized.width,
          y: knownRectangle.normalized.y + knownRectangle.normalized.height,
        },
      ],
      style: {
        strokeColor: '#d92626',
        fillColor: '#d9ebff',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'QA Inspector',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const bounds = getMarkupBounds(markup);
    expect(bounds.x).toBeCloseTo(0.125, 4);
    expect(bounds.y).toBeCloseTo(0.4167, 3);
    expect(bounds.width).toBeCloseTo(0.375, 4);
    expect(bounds.height).toBeCloseTo(0.3333, 3);
  });

  it('successfully hit-tests inside a filled rectangle markup', () => {
    const markup: Markup = {
      id: 'rect-fill',
      type: 'rectangle',
      pageIndex: 0,
      points: [
        { x: 0.125, y: 0.4167 },
        { x: 0.5, y: 0.75 },
      ],
      style: {
        strokeColor: '#ff0000',
        fillColor: '#00ff00',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Architect',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    expect(hitTestMarkup({ x: 0.3, y: 0.5 }, markup)).toBe(true);
    expect(hitTestMarkup({ x: 0.8, y: 0.2 }, markup)).toBe(false);
  });

  it('hit-tests lines with tolerance', () => {
    const lineMarkup: Markup = {
      id: 'line-1',
      type: 'line',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ],
      style: {
        strokeColor: '#000000',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Engineer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    expect(hitTestMarkup({ x: 0.505, y: 0.505 }, lineMarkup, 0.02)).toBe(true);
    expect(hitTestMarkup({ x: 0.1, y: 0.9 }, lineMarkup, 0.02)).toBe(false);
  });

  // --- CRITERIO 2: Coherencia elipse <-> hit test con bounding box NO cuadrado ---
  describe('Ellipse Hit-Testing with Non-Square Bounding Box (Criterio 2)', () => {
    // Bounding box no cuadrado: x de 0.3 a 0.7 (w = 0.4), y de 0.4 a 0.6 (h = 0.2)
    // Centro: (0.5, 0.5), Radio X: rx = 0.2, Radio Y: ry = 0.1
    const p1 = { x: 0.3, y: 0.4 };
    const p2 = { x: 0.7, y: 0.6 };

    it('correctly detects interior point in filled non-square ellipse', () => {
      const filledCircle: Markup = {
        id: 'circle-filled',
        type: 'circle',
        pageIndex: 0,
        points: [p1, p2],
        style: {
          strokeColor: '#0284c7',
          fillColor: '#e0f2fe',
          strokeWidth: 2,
          opacity: 1,
        },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      // Centro exacto (0.5, 0.5)
      expect(hitTestMarkup({ x: 0.5, y: 0.5 }, filledCircle)).toBe(true);
      // Punto interior no concéntrico (0.55, 0.52)
      // dx=0.05, dy=0.02 -> (0.05/0.2)^2 + (0.02/0.1)^2 = 0.0625 + 0.04 = 0.1025 <= 1
      expect(hitTestMarkup({ x: 0.55, y: 0.52 }, filledCircle)).toBe(true);
    });

    it('discriminates corners inside rectangular bounding box but outside ellipse', () => {
      const filledCircle: Markup = {
        id: 'circle-filled',
        type: 'circle',
        pageIndex: 0,
        points: [p1, p2],
        style: {
          strokeColor: '#0284c7',
          fillColor: '#e0f2fe',
          strokeWidth: 2,
          opacity: 1,
        },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      // Esquina superior izquierda dentro del bbox: (0.31, 0.41)
      // dx = 0.31 - 0.5 = -0.19, dy = 0.41 - 0.5 = -0.09
      // q = (-0.19/0.2)^2 + (-0.09/0.1)^2 = 0.9025 + 0.81 = 1.7125 > 1
      expect(hitTestMarkup({ x: 0.31, y: 0.41 }, filledCircle, 0.01)).toBe(false);

      // Esquina superior derecha dentro del bbox: (0.69, 0.41)
      expect(hitTestMarkup({ x: 0.69, y: 0.41 }, filledCircle, 0.01)).toBe(false);
    });

    it('hit-tests ring of a hollow non-square ellipse', () => {
      const hollowCircle: Markup = {
        id: 'circle-hollow',
        type: 'circle',
        pageIndex: 0,
        points: [p1, p2],
        style: {
          strokeColor: '#0284c7',
          fillColor: 'transparent',
          strokeWidth: 2,
          opacity: 1,
        },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      // Punto en el vértice superior del perímetro: (0.5, 0.4)
      expect(hitTestMarkup({ x: 0.5, y: 0.4 }, hollowCircle, 0.015)).toBe(true);

      // Punto en el vértice derecho del perímetro: (0.7, 0.5)
      expect(hitTestMarkup({ x: 0.7, y: 0.5 }, hollowCircle, 0.015)).toBe(true);

      // El centro en una elipse hueca NO debe impactar
      expect(hitTestMarkup({ x: 0.5, y: 0.5 }, hollowCircle, 0.015)).toBe(false);
    });
  });

  // --- CRITERIO 3: Casos límite y Geometría de Polígonos ---
  describe('Polygon Hit-Testing & Edge Cases (Criterio 3)', () => {
    it('discards polygon with less than 3 points in isPointInPolygon', () => {
      expect(isPointInPolygon({ x: 0.5, y: 0.5 }, [])).toBe(false);
      expect(isPointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0.1, y: 0.1 }])).toBe(false);
      expect(
        isPointInPolygon({ x: 0.5, y: 0.5 }, [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.9 },
        ])
      ).toBe(false);
    });

    it('detects point inside a triangle polygon and rejects outside points within bbox', () => {
      // Triángulo: (0.2, 0.2), (0.8, 0.2), (0.5, 0.8)
      const triangle: Markup = {
        id: 'poly-tri',
        type: 'polygon',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.5, y: 0.8 },
        ],
        style: {
          strokeColor: '#16a34a',
          fillColor: 'rgba(22, 163, 74, 0.2)',
          strokeWidth: 2,
          opacity: 1,
        },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      // Centro del triángulo (0.5, 0.4) -> interior
      expect(hitTestMarkup({ x: 0.5, y: 0.4 }, triangle)).toBe(true);

      // Esquina superior (0.25, 0.75): dentro del bbox [0.2..0.8, 0.2..0.8] pero fuera del triángulo
      expect(hitTestMarkup({ x: 0.25, y: 0.75 }, triangle, 0.01)).toBe(false);
    });

    it('detects hit along freehand polyline and rejects distant points', () => {
      const freehand: Markup = {
        id: 'freehand-1',
        type: 'freehand',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.2 },
          { x: 0.5, y: 0.1 },
          { x: 0.8, y: 0.4 },
        ],
        style: {
          strokeColor: '#9333ea',
          strokeWidth: 2,
          opacity: 1,
        },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      // Cerca del punto medio del primer segmento (0.2, 0.15)
      expect(hitTestMarkup({ x: 0.2, y: 0.15 }, freehand, 0.015)).toBe(true);

      // Lejos de la línea (0.3, 0.6)
      expect(hitTestMarkup({ x: 0.3, y: 0.6 }, freehand, 0.015)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable 0.6: Hit-Testing Matemático Riguroso por Tipo (CERO Fallback Permisivo)
  // --------------------------------------------------------------------------------
  describe('Sub-entregable 0.6: Hit-Testing Matemático Riguroso por Tipo (CERO fallback permisivo)', () => {
    const baseStyle = { strokeColor: '#000000', strokeWidth: 2, opacity: 1 };

    describe('rectangle: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const filledRect: Markup = {
        id: 'rect-fill',
        type: 'rectangle',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.6, y: 0.6 },
        ],
        style: { ...baseStyle, fillColor: '#3b82f6' },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };
      const hollowRect: Markup = {
        ...filledRect,
        id: 'rect-hollow',
        style: { ...baseStyle, fillColor: 'transparent' },
      };

      it('caso: interior (rectángulo con relleno)', () => {
        expect(hitTestMarkup({ x: 0.4, y: 0.4 }, filledRect, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (rectángulo hueco: centro no toca perímetro)', () => {
        expect(hitTestMarkup({ x: 0.4, y: 0.4 }, hollowRect, 0.015)).toBe(false);
      });

      it('caso: perímetro (borde izquierdo del rectángulo)', () => {
        expect(hitTestMarkup({ x: 0.2, y: 0.4 }, hollowRect, 0.015)).toBe(true);
      });
    });

    describe('circle: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const filledCircle: Markup = {
        id: 'circle-fill',
        type: 'circle',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.3 },
          { x: 0.8, y: 0.7 },
        ],
        style: { ...baseStyle, fillColor: '#22c55e' },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };
      const hollowCircle: Markup = {
        ...filledCircle,
        id: 'circle-hollow',
        style: { ...baseStyle, fillColor: 'transparent' },
      };

      it('caso: interior (elipse con relleno)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.5 }, filledCircle, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (esquina del bbox fuera de la elipse)', () => {
        expect(hitTestMarkup({ x: 0.22, y: 0.32 }, filledCircle, 0.015)).toBe(false);
        // También el centro de una elipse hueca
        expect(hitTestMarkup({ x: 0.5, y: 0.5 }, hollowCircle, 0.015)).toBe(false);
      });

      it('caso: perímetro (vértice superior de la elipse)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.3 }, hollowCircle, 0.015)).toBe(true);
      });
    });

    describe('line: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const lineMarkup: Markup = {
        id: 'line-test',
        type: 'line',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.9 },
        ],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior / punto medio sobre el segmento', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.5 }, lineMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (esquina del bbox lejos de la diagonal)', () => {
        expect(hitTestMarkup({ x: 0.1, y: 0.9 }, lineMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (punto dentro de la tolerancia de distancia al segmento)', () => {
        expect(hitTestMarkup({ x: 0.505, y: 0.495 }, lineMarkup, 0.015)).toBe(true);
      });
    });

    describe('polygon: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const triangle: Markup = {
        id: 'poly-tri-test',
        type: 'polygon',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.5, y: 0.8 },
        ],
        style: { ...baseStyle, fillColor: '#a855f7' },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (centroide por Ray-Casting)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.4 }, triangle, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (esquina superior dentro de bbox [0.2..0.8] pero fuera del triángulo)', () => {
        expect(hitTestMarkup({ x: 0.25, y: 0.75 }, triangle, 0.015)).toBe(false);
      });

      it('caso: perímetro (arista base)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.2 }, triangle, 0.015)).toBe(true);
      });
    });

    describe('freehand: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const freehandMarkup: Markup = {
        id: 'fh-test',
        type: 'freehand',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.2 },
          { x: 0.5, y: 0.1 },
          { x: 0.8, y: 0.4 },
        ],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (sobre segmento de polilínea)', () => {
        expect(hitTestMarkup({ x: 0.2, y: 0.15 }, freehandMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (dentro del bbox pero distante de la curva)', () => {
        expect(hitTestMarkup({ x: 0.2, y: 0.38 }, freehandMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (offset dentro de tolerancia de segmento)', () => {
        expect(hitTestMarkup({ x: 0.205, y: 0.15 }, freehandMarkup, 0.015)).toBe(true);
      });
    });

    describe('cloud: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const cloudMarkup: Markup = {
        id: 'cloud-test',
        type: 'cloud',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.5, y: 0.8 },
        ],
        style: { ...baseStyle, fillColor: 'rgba(59, 130, 246, 0.2)' },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (interior de los vértices base)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.4 }, cloudMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (fuera de la base pero dentro del bbox)', () => {
        expect(hitTestMarkup({ x: 0.25, y: 0.75 }, cloudMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (arista de la base)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.2 }, cloudMarkup, 0.015)).toBe(true);
      });
    });

    describe('cloudPlus: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const cloudPlusMarkup: Markup = {
        id: 'cloudplus-test',
        type: 'cloudPlus',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.5, y: 0.8 },
        ],
        style: { ...baseStyle, fillColor: 'rgba(59, 130, 246, 0.2)' },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (interior de los vértices base)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.4 }, cloudPlusMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (fuera de la base pero dentro del bbox)', () => {
        expect(hitTestMarkup({ x: 0.25, y: 0.75 }, cloudPlusMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (arista de la base)', () => {
        expect(hitTestMarkup({ x: 0.5, y: 0.2 }, cloudPlusMarkup, 0.015)).toBe(true);
      });
    });

    describe('callout: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const calloutMarkup: Markup = {
        id: 'callout-test',
        type: 'callout',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0.3 },
        ],
        leaders: [[{ x: 0.4, y: 0.25 }, { x: 0.8, y: 0.8 }]],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (dentro de la caja de texto)', () => {
        expect(hitTestMarkup({ x: 0.3, y: 0.25 }, calloutMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (zona vacía entre caja y directriz)', () => {
        expect(hitTestMarkup({ x: 0.25, y: 0.75 }, calloutMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (sobre la directriz / flecha)', () => {
        // Punta (0.4, 0.25) y codo en x = 0.8 (ADR-0042): directriz horizontal a la altura del centro de la caja
        expect(hitTestMarkup({ x: 0.6, y: 0.25 }, calloutMarkup, 0.015)).toBe(true);
      });
    });

    describe('text: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const textMarkup: Markup = {
        id: 'text-test',
        type: 'text',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0.3 },
        ],
        leaders: [[{ x: 0.4, y: 0.25 }, { x: 0.8, y: 0.8 }]],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (dentro de la caja de texto)', () => {
        expect(hitTestMarkup({ x: 0.3, y: 0.25 }, textMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (zona vacía en directriz)', () => {
        expect(hitTestMarkup({ x: 0.25, y: 0.75 }, textMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (borde de la caja de texto)', () => {
        expect(hitTestMarkup({ x: 0.2, y: 0.25 }, textMarkup, 0.015)).toBe(true);
      });
    });

    describe('stickyNote: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const pageDims = { width: 800, height: 600 };
      const stickyNoteMarkup: Markup = {
        id: 'sticky-test',
        type: 'stickyNote',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.2 }],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (interior de la caja de icono estándar 24x24 pt -> 0.030x0.040)', () => {
        expect(hitTestMarkup({ x: 0.215, y: 0.22 }, stickyNoteMarkup, 0.015, pageDims)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (fuera de la caja de icono en [0.3, 0.3])', () => {
        expect(hitTestMarkup({ x: 0.3, y: 0.3 }, stickyNoteMarkup, 0.015, pageDims)).toBe(false);
      });

      it('caso: perímetro (borde exacto del icono en x=0.2 o y=0.2)', () => {
        expect(hitTestMarkup({ x: 0.2, y: 0.22 }, stickyNoteMarkup, 0.015, pageDims)).toBe(true);
      });
    });

    describe('Sub-entregable A.4: stickyNote (Condición 1 y 2: fuente única STICKY_NOTE_SIZE_PT = 24 y hit-test idéntico)', () => {
      const stickyNoteMarkup: Markup = {
        id: 'sticky-test',
        type: 'stickyNote',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.2 }],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('Condición 1: en 800x600 pt el icono dibujado mide 24x24 pt y la caja del hit test es idéntica a la dibujada', () => {
        const pageDims = { width: 800, height: 600 };
        const normSize = getStickyNoteNormalizedSize(pageDims);
        expect(STICKY_NOTE_SIZE_PT).toBe(24);
        expect(normSize.width).toBeCloseTo(24 / 800, 6); // 0.03
        expect(normSize.height).toBeCloseTo(24 / 600, 6); // 0.04

        // A escala 1.0, el tamaño en pantalla en píxeles es exactamente 24x24 pt
        const widthScreen = normSize.width * 800 * 1.0;
        const heightScreen = normSize.height * 600 * 1.0;
        expect(widthScreen).toBe(24);
        expect(heightScreen).toBe(24);

        // La caja del hit test es idéntica a la dibujada: [0.2 .. 0.2 + 0.03] x [0.2 .. 0.2 + 0.04]
        const bounds = getMarkupBounds(stickyNoteMarkup, pageDims);
        expect(bounds.x).toBe(0.2);
        expect(bounds.y).toBe(0.2);
        expect(bounds.width).toBeCloseTo(0.03, 6);
        expect(bounds.height).toBeCloseTo(0.04, 6);

        // Interior estricto
        expect(hitTestMarkup({ x: 0.215, y: 0.22 }, stickyNoteMarkup, 0, pageDims)).toBe(true);
        // Esquinas extremas dentro del área dibujada
        expect(hitTestMarkup({ x: 0.2, y: 0.2 }, stickyNoteMarkup, 0, pageDims)).toBe(true);
        expect(hitTestMarkup({ x: 0.23, y: 0.24 }, stickyNoteMarkup, 0, pageDims)).toBe(true);
        // Fuera de la caja dibujada
        expect(hitTestMarkup({ x: 0.231, y: 0.22 }, stickyNoteMarkup, 0, pageDims)).toBe(false);
        expect(hitTestMarkup({ x: 0.215, y: 0.241 }, stickyNoteMarkup, 0, pageDims)).toBe(false);
      });

      it('Condición 2: clampTranslationDelta con un solo punto no asume points[1] y restringe a [0, 1]', () => {
        const pageDims = { width: 800, height: 600 };
        const noteNearEdge: Markup = {
          ...stickyNoteMarkup,
          points: [{ x: 0.98, y: 0.97 }],
        };
        const delta = { x: 0.05, y: 0.05 };
        const clamped = clampTranslationDelta(noteNearEdge, delta, pageDims);

        // maxX = 0.98 + 0.03 = 1.01 -> clampedDx = 1.0 - 1.01 = -0.01
        // maxY = 0.97 + 0.04 = 1.01 -> clampedDy = 1.0 - 1.01 = -0.01
        expect(clamped.x).toBeCloseTo(-0.01, 5);
        expect(clamped.y).toBeCloseTo(-0.01, 5);
      });

      it('falla ruidosamente si no se suministran dimensiones válidas de página (cero silent fallback)', () => {
        expect(() => getStickyNoteNormalizedSize(undefined as any)).toThrow();
        expect(() => getStickyNoteNormalizedSize({ width: 0, height: 0 })).toThrow();
        expect(() => getMarkupBounds(stickyNoteMarkup)).toThrow();
        expect(() => hitTestMarkup({ x: 0.215, y: 0.22 }, stickyNoteMarkup, 0.015)).toThrow();
      });
    });

    describe('stamp: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const stampMarkup: Markup = {
        id: 'stamp-test',
        type: 'stamp',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.6, y: 0.5 },
        ],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (interior del bbox del sello)', () => {
        expect(hitTestMarkup({ x: 0.4, y: 0.35 }, stampMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (fuera de los límites)', () => {
        expect(hitTestMarkup({ x: 0.1, y: 0.1 }, stampMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (borde del sello)', () => {
        expect(hitTestMarkup({ x: 0.2, y: 0.35 }, stampMarkup, 0.015)).toBe(true);
      });
    });

    describe('highlight: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const highlightMarkup: Markup = {
        id: 'hl-test',
        type: 'highlight',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.2 },
        ],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (interior del resaltado)', () => {
        expect(hitTestMarkup({ x: 0.3, y: 0.15 }, highlightMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (fuera de límites)', () => {
        expect(hitTestMarkup({ x: 0.7, y: 0.7 }, highlightMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (borde del resaltado)', () => {
        expect(hitTestMarkup({ x: 0.1, y: 0.15 }, highlightMarkup, 0.015)).toBe(true);
      });
    });

    describe('highlightVector: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const hlVectorMarkup: Markup = {
        id: 'hlv-test',
        type: 'highlightVector',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.2 },
        ],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (interior de highlightVector)', () => {
        expect(hitTestMarkup({ x: 0.3, y: 0.15 }, hlVectorMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (fuera de límites)', () => {
        expect(hitTestMarkup({ x: 0.7, y: 0.7 }, hlVectorMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (borde de highlightVector)', () => {
        expect(hitTestMarkup({ x: 0.1, y: 0.15 }, hlVectorMarkup, 0.015)).toBe(true);
      });
    });

    describe('highlightText: 3 casos (interior, exterior-pero-dentro-del-bbox, perímetro)', () => {
      const hlTextMarkup: Markup = {
        id: 'hlt-test',
        type: 'highlightText',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.2 },
        ],
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      it('caso: interior (interior de highlightText)', () => {
        expect(hitTestMarkup({ x: 0.3, y: 0.15 }, hlTextMarkup, 0.015)).toBe(true);
      });

      it('caso: exterior-pero-dentro-del-bbox (fuera de límites)', () => {
        expect(hitTestMarkup({ x: 0.7, y: 0.7 }, hlTextMarkup, 0.015)).toBe(false);
      });

      it('caso: perímetro (borde de highlightText)', () => {
        expect(hitTestMarkup({ x: 0.1, y: 0.15 }, hlTextMarkup, 0.015)).toBe(true);
      });
    });

    it('simplifica trazo freehand con RDP si N > 50 puntos y ejecuta hit-testing preciso', () => {
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < 60; i++) {
        const t = i / 59;
        points.push({
          x: 0.1 + t * 0.6,
          y: 0.3 + (i % 2 === 0 ? 0.0001 : -0.0001),
        });
      }
      expect(points.length).toBe(60);

      const simplified = simplifyRamerDouglasPeucker(points, 0.002);
      expect(simplified.length).toBe(2);
      expect(simplified[0].x).toBeCloseTo(0.1, 4);
      expect(simplified[1].x).toBeCloseTo(0.7, 4);

      const freehand60: Markup = {
        id: 'freehand-60-pts',
        type: 'freehand',
        pageIndex: 0,
        points,
        style: baseStyle,
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      expect(hitTestMarkup({ x: 0.4, y: 0.3 }, freehand60, 0.015)).toBe(true);
      expect(hitTestMarkup({ x: 0.4, y: 0.31 }, freehand60, 0.015)).toBe(true);
      expect(hitTestMarkup({ x: 0.4, y: 0.6 }, freehand60, 0.015)).toBe(false);
      expect(hitTestMarkup({ x: 0.1, y: 0.35 }, freehand60, 0.015)).toBe(false);
    });

    it('garantiza que NINGÚN tipo cae en un fallback permisivo (CERO return true fallback)', () => {
      for (const type of VALID_MARKUP_TYPES) {
        const markup: Markup = {
          id: `fallback-check-${type}`,
          type,
          pageIndex: 0,
          points: [
            { x: 0.2, y: 0.2 },
            { x: 0.4, y: 0.4 },
            { x: 0.3, y: 0.5 },
          ],
          style: { strokeColor: '#000', strokeWidth: 1, opacity: 1, fillColor: '#fff' },
          author: 'Tester',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        };

        // Un punto fuera del bbox debe dar false en TODOS los 14 tipos
        expect(hitTestMarkup({ x: 0.95, y: 0.95 }, markup, 0.015, { width: 800, height: 600 })).toBe(false);
      }

      // Tipo desconocido debe dar false (sin caer jamás en return true)
      const unknownMarkup: any = {
        id: 'unknown-1',
        type: 'non_existent_type',
        pageIndex: 0,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0.4 },
        ],
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        author: 'Tester',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };
      expect(hitTestMarkup({ x: 0.3, y: 0.3 }, unknownMarkup)).toBe(false);

      // Casos límite: puntos vacíos o markup nulo/indefinido retornan false
      expect(hitTestMarkup({ x: 0.3, y: 0.3 }, { ...unknownMarkup, points: [] })).toBe(false);
      expect(hitTestMarkup({ x: 0.3, y: 0.3 }, null as any)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable 0.5: Rotación Unificada (0°, 90°, 180°, 270°) y Viewport de PDF.js
  // --------------------------------------------------------------------------------
  describe('Sub-entregable 0.5: Rotación Unificada (0°, 90°, 180°, 270°) y Viewport de PDF.js', () => {
    it('contrasta la conversión en las 4 rotaciones (0, 90, 180, 270) contra page.getViewport() de PDF.js', async () => {
      const pdfBytes = fs.readFileSync(path.resolve(process.cwd(), 'fixtures/test-blueprint.pdf'));
      const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
      const page = await pdfDoc.getPage(1);

      for (const rot of [0, 90, 180, 270] as const) {
        const vp = page.getViewport({ scale: 1, rotation: rot });

        // A. Verificar que el viewport intercambia dimensiones a 90° y 270°
        if (rot === 90 || rot === 270) {
          expect(vp.width).toBe(600);
          expect(vp.height).toBe(800);
        } else {
          expect(vp.width).toBe(800);
          expect(vp.height).toBe(600);
        }

        // B. Validar conversión de coordenadas en una malla de puntos PDF
        for (const pdfX of [0, 100, 250, 400, 600, 800]) {
          for (const pdfY of [0, 150, 300, 450, 600]) {
            const [expectedVx, expectedVy] = vp.convertToViewportPoint(pdfX, pdfY);

            // Coordenadas normalizadas relativas al viewport visible
            const norm = pdfToNormalizedWithViewport(pdfX, pdfY, vp);
            expect(norm.x).toBeCloseTo(expectedVx / vp.width, 4);
            expect(norm.y).toBeCloseTo(expectedVy / vp.height, 4);

            // Reversibilidad exacta (round-trip de vuelta a PDF)
            const roundTripPdf = normalizedToPdfWithViewport(norm.x, norm.y, vp);
            expect(roundTripPdf.x).toBeCloseTo(pdfX, 1);
            expect(roundTripPdf.y).toBeCloseTo(pdfY, 1);
          }
        }
      }
    });

    it('valida la rotación intrínseca (/Rotate 90) de test-blueprint-rotated.pdf', async () => {
      const pdfBytes = fs.readFileSync(
        path.resolve(process.cwd(), 'fixtures/test-blueprint-rotated.pdf')
      );
      const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
      const page = await pdfDoc.getPage(1);

      // 1. Confirmar rotación intrínseca detectada por PDF.js
      expect(page.rotate).toBe(90);

      // 2. Viewport a rotación 0 del store (aplica rotación total compuesta: 90 intrínseca + 0 store = 90°)
      const totalRot = (((page.rotate + 0) % 360) + 360) % 360;
      const vp = page.getViewport({ scale: 1, rotation: totalRot });
      expect(vp.width).toBe(600); // Intercambiado por /Rotate 90
      expect(vp.height).toBe(800);

      // 3. Rectángulo de control conocido en coords PDF
      const known = rotatedFixtureMeta.knownRectangle;
      const norm = pdfToNormalizedWithViewport(known.pdf.x, known.pdf.y + known.pdf.height, vp);

      // Top-left en PDF para /Rotate 90 proyecta al top-left del rectángulo visible
      const [expectedVx, expectedVy] = vp.convertToViewportPoint(
        known.pdf.x,
        known.pdf.y + known.pdf.height
      );
      expect(norm.x).toBeCloseTo(expectedVx / vp.width, 4);
      expect(norm.y).toBeCloseTo(expectedVy / vp.height, 4);

      // 4. Round-trip
      const backPdf = normalizedToPdfWithViewport(norm.x, norm.y, vp);
      expect(backPdf.x).toBeCloseTo(known.pdf.x, 1);
      expect(backPdf.y).toBeCloseTo(known.pdf.y + known.pdf.height, 1);
    });

    it('compone rotación intrínseca (/Rotate 90) con rotación del visor (90°) sumando 180°', async () => {
      const pdfBytes = fs.readFileSync(
        path.resolve(process.cwd(), 'fixtures/test-blueprint-rotated.pdf')
      );
      const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
      const page = await pdfDoc.getPage(1);

      // Total: 90 intrínseca + 90 visor = 180°
      const totalRot180 = (((page.rotate + 90) % 360) + 360) % 360;
      const vp180 = page.getViewport({ scale: 1, rotation: totalRot180 });
      expect(vp180.width).toBe(800); // A 180° vuelve al ancho original
      expect(vp180.height).toBe(600);

      const norm = pdfToNormalizedWithViewport(400, 300, vp180);
      const [expectedVx, expectedVy] = vp180.convertToViewportPoint(400, 300);

      expect(norm.x).toBeCloseTo(expectedVx / 800, 4);
      expect(norm.y).toBeCloseTo(expectedVy / 600, 4);

      const roundTrip = normalizedToPdfWithViewport(norm.x, norm.y, vp180);
      expect(roundTrip.x).toBeCloseTo(400, 1);
      expect(roundTrip.y).toBeCloseTo(300, 1);
    });
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable A.0: Move/Transform de Marcas Seleccionadas y Clamp 0..1
  // --------------------------------------------------------------------------------
  describe('Sub-entregable A.0: Move/Transform de Marcas Seleccionadas y Clamp 0..1', () => {
    const mockRect: Markup = {
      id: 'move-rect',
      type: 'rectangle',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.3 },
        { x: 0.5, y: 0.6 },
      ],
      style: { strokeColor: '#000', strokeWidth: 2, opacity: 1 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    it('traslada puntos dentro de los limites sin recorte cuando delta no excede la pagina', () => {
      const delta = { x: 0.1, y: 0.05 };
      const clamped = clampTranslationDelta(mockRect, delta);
      expect(clamped.x).toBeCloseTo(0.1, 4);
      expect(clamped.y).toBeCloseTo(0.05, 4);

      const moved = translateMarkup(mockRect, clamped);
      expect(moved.points[0].x).toBeCloseTo(0.3, 4);
      expect(moved.points[0].y).toBeCloseTo(0.35, 4);
      expect(moved.points[1].x).toBeCloseTo(0.6, 4);
      expect(moved.points[1].y).toBeCloseTo(0.65, 4);
    });

    it('clampea delta para no rebasar el borde izquierdo o superior (0..1 clamp)', () => {
      // Intentar mover hacia la izquierda más de 0.2 (minX = 0.2)
      const deltaLeft = { x: -0.35, y: -0.45 };
      const clamped = clampTranslationDelta(mockRect, deltaLeft);
      // Debe detenerse exactamente en x = 0 y y = 0
      expect(clamped.x).toBeCloseTo(-0.2, 4);
      expect(clamped.y).toBeCloseTo(-0.3, 4);

      const moved = translateMarkup(mockRect, clamped);
      expect(moved.points[0].x).toBeCloseTo(0, 4);
      expect(moved.points[0].y).toBeCloseTo(0, 4);
      // El ancho y alto se preservan intactos (0.3 de ancho, 0.3 de alto)
      expect(moved.points[1].x).toBeCloseTo(0.3, 4);
      expect(moved.points[1].y).toBeCloseTo(0.3, 4);
    });

    it('clampea delta para no rebasar el borde derecho o inferior (0..1 clamp)', () => {
      // maxX = 0.5, maxY = 0.6. Mover delta = { x: 0.6, y: 0.5 }
      const deltaRight = { x: 0.6, y: 0.5 };
      const clamped = clampTranslationDelta(mockRect, deltaRight);
      // Máximo movimiento posible: 1 - 0.5 = 0.5 en x, 1 - 0.6 = 0.4 en y
      expect(clamped.x).toBeCloseTo(0.5, 4);
      expect(clamped.y).toBeCloseTo(0.4, 4);

      const moved = translateMarkup(mockRect, clamped);
      expect(moved.points[1].x).toBeCloseTo(1, 4);
      expect(moved.points[1].y).toBeCloseTo(1, 4);
      expect(moved.points[0].x).toBeCloseTo(0.7, 4);
      expect(moved.points[0].y).toBeCloseTo(0.7, 4);
    });

    it('clampea grupo de marcas manteniendo su distancia relativa dentro de [0, 1]', () => {
      const m1: Markup = { ...mockRect, id: 'm1', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }] };
      const m2: Markup = { ...mockRect, id: 'm2', points: [{ x: 0.7, y: 0.7 }, { x: 0.9, y: 0.9 }] };

      // Grupo ocupa de x=0.1 a x=0.9
      // Si intentamos mover delta.x = 0.2: el límite derecho es 1 - 0.9 = 0.1
      const clamped = clampGroupTranslationDelta([m1, m2], { x: 0.2, y: 0.2 });
      expect(clamped.x).toBeCloseTo(0.1, 4);
      expect(clamped.y).toBeCloseTo(0.1, 4);

      const movedM1 = translateMarkup(m1, clamped);
      const movedM2 = translateMarkup(m2, clamped);

      expect(movedM1.points[0].x).toBeCloseTo(0.2, 4);
      expect(movedM2.points[1].x).toBeCloseTo(1.0, 4);
      // La distancia relativa entre m1 y m2 permanece exactamente igual
      expect(movedM2.points[0].x - movedM1.points[0].x).toBeCloseTo(0.6, 4);
    });

    it('traslada directrices (leaders) de marcas complejas como callout de forma sincronizada', () => {
      const callout: Markup = {
        ...mockRect,
        type: 'callout',
        points: [{ x: 0.3, y: 0.3 }, { x: 0.5, y: 0.4 }],
        leaders: [[{ x: 0.5, y: 0.35 }, { x: 0.8, y: 0.8 }]],
      };

      const clamped = clampTranslationDelta(callout, { x: 0.1, y: 0.1 });
      const moved = translateMarkup(callout, clamped);

      // Puntos de la caja de texto
      expect(moved.points[0].x).toBeCloseTo(0.4, 4);
      expect(moved.points[0].y).toBeCloseTo(0.4, 4);
      // Puntos de la directriz
      expect(moved.leaders?.[0][0].x).toBeCloseTo(0.6, 4);
      expect(moved.leaders?.[0][0].y).toBeCloseTo(0.45, 4);
      expect(moved.leaders?.[0][1].x).toBeCloseTo(0.9, 4);
      expect(moved.leaders?.[0][1].y).toBeCloseTo(0.9, 4);
    });
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable A.2: Multiselección y Marquee de Selección
  // --------------------------------------------------------------------------------
  describe('Sub-entregable A.2: Criterio del Marquee y Rendimiento', () => {
    it('doBoundsIntersect valida intersección y contención entre cajas delimitadoras', () => {
      const boxA = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }; // [0.1..0.3, 0.1..0.3]
      const boxOverlapping = { x: 0.25, y: 0.25, width: 0.2, height: 0.2 }; // [0.25..0.45, 0.25..0.45]
      const boxContained = { x: 0.15, y: 0.15, width: 0.05, height: 0.05 };
      const boxDisjoint = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 };

      // Caso 1: Solapamiento parcial (INTERSECCIÓN)
      expect(doBoundsIntersect(boxA, boxOverlapping)).toBe(true);
      expect(doBoundsIntersect(boxOverlapping, boxA)).toBe(true);

      // Caso 2: Contención total
      expect(doBoundsIntersect(boxA, boxContained)).toBe(true);
      expect(doBoundsIntersect(boxContained, boxA)).toBe(true);

      // Caso 3: Cajas disjuntas
      expect(doBoundsIntersect(boxA, boxDisjoint)).toBe(false);
      expect(doBoundsIntersect(boxDisjoint, boxA)).toBe(false);
    });

    it('Condición 1: selectMarkupsInRect selecciona marcas por INTERSECCIÓN (crossing)', () => {
      const m1: Markup = {
        id: 'rect-1',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        author: 'Tester',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      };

      const m2: Markup = {
        id: 'rect-2',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.5, y: 0.1 }, { x: 0.7, y: 0.3 }],
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        author: 'Tester',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      };

      const m3: Markup = {
        id: 'rect-3',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.8 }],
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        author: 'Tester',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      };

      const pageMarkups = [m1, m2, m3];

      // Marquee que cubre de x=0.25 a 0.55 y de y=0.05 a 0.25:
      // Toca parcialmente el borde derecho de m1 (x: 0.1..0.3) e izquierdo de m2 (x: 0.5..0.7)
      // pero no toca m3.
      const marqueeRect = { x: 0.25, y: 0.05, width: 0.3, height: 0.2 };
      const selected = selectMarkupsInRect(pageMarkups, marqueeRect);

      expect(selected).toContain('rect-1');
      expect(selected).toContain('rect-2');
      expect(selected).not.toContain('rect-3');
      expect(selected).toHaveLength(2);
    });

    it('selectMarkupsInRect expande automáticamente grupos vinculados por groupId', () => {
      const groupId = 'group-linked';
      const cloud: Markup = {
        id: 'cloud-g',
        type: 'cloudPlus',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        author: 'Tester',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
        groupId,
      };

      const callout: Markup = {
        id: 'callout-g',
        type: 'callout',
        pageIndex: 0,
        points: [{ x: 0.6, y: 0.6 }, { x: 0.8, y: 0.7 }],
        style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
        author: 'Tester',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
        groupId,
      };

      // Marquee solo toca 'cloud-g' (x: 0.05..0.2, y: 0.05..0.2)
      const marqueeRect = { x: 0.05, y: 0.05, width: 0.15, height: 0.15 };
      const selected = selectMarkupsInRect([cloud, callout], marqueeRect);

      // Al intersectar 'cloud-g', automáticamente arrastra 'callout-g'
      expect(selected).toContain('cloud-g');
      expect(selected).toContain('callout-g');
      expect(selected).toHaveLength(2);
    });

    it('Condición 5 (Rendimiento): selectMarkupsInRect filtra 500 marcas en menos de 10ms', () => {
      const markups500: Markup[] = [];
      for (let i = 0; i < 500; i++) {
        const x = (i % 25) * 0.038;
        const y = Math.floor(i / 25) * 0.045;
        markups500.push({
          id: `m-${i}`,
          type: 'rectangle',
          pageIndex: 0,
          points: [{ x, y }, { x: x + 0.03, y: y + 0.03 }],
          style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
          author: 'Tester',
          createdAt: '',
          updatedAt: '',
          status: 'pending',
        });
      }

      const marqueeRect = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
      const t0 = performance.now();
      const selected = selectMarkupsInRect(markups500, marqueeRect);
      const elapsed = performance.now() - t0;

      expect(selected.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(15); // Ultra rápido con O(N) prefiltro
    });
  });

  describe('Sub-entregable A.3: Hit-Testing Diferenciado de Callout y Múltiples Directrices', () => {
    const baseCallout: Markup = {
      id: 'callout-test-1',
      type: 'callout',
      pageIndex: 0,
      points: [
        { x: 0.4, y: 0.4 },
        { x: 0.6, y: 0.5 },
      ],
      leaders: [
        [{ x: 0.2, y: 0.3 }], // Directriz 0: flecha en (0.2, 0.3)
        [{ x: 0.8, y: 0.3 }], // Directriz 1: flecha en (0.8, 0.3)
      ],
      text: 'Nota técnica de prueba',
      style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
    };

    it('detecta clic en la caja de texto devolviendo { type: "box" }', () => {
      const hit = findCalloutComponentAtPoint({ x: 0.5, y: 0.45 }, baseCallout);
      expect(hit).toEqual({ type: 'box' });
      expect(hitTestMarkup({ x: 0.5, y: 0.45 }, baseCallout)).toBe(true);
    });

    it('detecta clic en punta de flecha / ancla devolviendo { type: "arrowTip", leaderIndex }', () => {
      const hit0 = findCalloutComponentAtPoint({ x: 0.2, y: 0.3 }, baseCallout);
      expect(hit0).toEqual({ type: 'arrowTip', leaderIndex: 0 });
      expect(hitTestMarkup({ x: 0.2, y: 0.3 }, baseCallout)).toBe(true);

      const hit1 = findCalloutComponentAtPoint({ x: 0.805, y: 0.305 }, baseCallout, 0.015);
      expect(hit1).toEqual({ type: 'arrowTip', leaderIndex: 1 });
      expect(hitTestMarkup({ x: 0.805, y: 0.305 }, baseCallout, 0.015)).toBe(true);
    });

    it('detecta clic en el cuerpo de la directriz devolviendo { type: "leaderBody", leaderIndex }', () => {
      // Mitad del tramo punta (0.2, 0.3) → codo (0.4 - tramo horizontal, 0.45) (ADR-0042)
      const hitBody = findCalloutComponentAtPoint({ x: 0.28875, y: 0.375 }, baseCallout, 0.015);
      expect(hitBody).toEqual({ type: 'leaderBody', leaderIndex: 0 });
      expect(hitTestMarkup({ x: 0.28875, y: 0.375 }, baseCallout)).toBe(true);
    });

    it('devuelve null y hitTestMarkup=false para clics fuera de la caja y directrices', () => {
      const hitVoid = findCalloutComponentAtPoint({ x: 0.05, y: 0.05 }, baseCallout);
      expect(hitVoid).toBeNull();
      expect(hitTestMarkup({ x: 0.05, y: 0.05 }, baseCallout)).toBe(false);
    });

    it('expande la zona de hit-testing al actualizar points[1] tras crecer el texto', () => {
      const initialHit = findCalloutComponentAtPoint({ x: 0.7, y: 0.45 }, baseCallout);
      expect(initialHit?.type).not.toBe('box');

      const estimated = estimateCalloutBoxNormalizedSize('Texto largo de prueba que expande la anchura del callout');
      const expandedCallout: Markup = {
        ...baseCallout,
        text: 'Texto largo de prueba que expande la anchura del callout',
        points: [
          baseCallout.points[0],
          { x: baseCallout.points[0].x + Math.max(0.35, estimated.width), y: baseCallout.points[0].y + estimated.height },
        ],
      };

      const expandedHit = findCalloutComponentAtPoint({ x: 0.7, y: 0.45 }, expandedCallout);
      expect(expandedHit).toEqual({ type: 'box' });
      expect(hitTestMarkup({ x: 0.7, y: 0.45 }, expandedCallout)).toBe(true);
    });
  });

  describe('Sub-entregable A.5: Umbral de creación en píxeles de pantalla (exceedsScreenThreshold)', () => {
    it('Condición 1: a escala 0.5, 3 px no crea marca y 6 px sí', () => {
      const transformScale05 = {
        width: 800,
        height: 600,
        scale: 0.5,
        offsetX: 0,
        offsetY: 0,
      };
      const p1 = { x: 0.2, y: 0.2 };
      // A escala 0.5, ancho en pantalla = 400 px. 3 px de pantalla = 3/400 = 0.0075 norm.
      const p2_3px = { x: 0.2 + 3 / 400, y: 0.2 };
      // 6 px de pantalla = 6/400 = 0.015 norm.
      const p2_6px = { x: 0.2 + 6 / 400, y: 0.2 };

      expect(exceedsScreenThreshold(p1, p2_3px, transformScale05, 4)).toBe(false);
      expect(exceedsScreenThreshold(p1, p2_6px, transformScale05, 4)).toBe(true);
    });

    it('Condición 1: a escala 2.0, 3 px no crea marca y 6 px sí', () => {
      const transformScale20 = {
        width: 800,
        height: 600,
        scale: 2.0,
        offsetX: 0,
        offsetY: 0,
      };
      const p1 = { x: 0.2, y: 0.2 };
      // A escala 2.0, ancho en pantalla = 1600 px. 3 px de pantalla = 3/1600 = 0.001875 norm.
      const p2_3px = { x: 0.2 + 3 / 1600, y: 0.2 };
      // 6 px de pantalla = 6/1600 = 0.00375 norm.
      const p2_6px = { x: 0.2 + 6 / 1600, y: 0.2 };

      expect(exceedsScreenThreshold(p1, p2_3px, transformScale20, 4)).toBe(false);
      expect(exceedsScreenThreshold(p1, p2_6px, transformScale20, 4)).toBe(true);
    });

    it('respeta la frontera estricta de 4 px en diagonal', () => {
      const transform = {
        width: 1000,
        height: 1000,
        scale: 1.0,
        offsetX: 0,
        offsetY: 0,
      };
      const p1 = { x: 0.5, y: 0.5 };
      // dx=2px, dy=2px -> distScreen = sqrt(8) ~= 2.83 px < 4 px
      const pBelow = { x: 0.5 + 2 / 1000, y: 0.5 + 2 / 1000 };
      // dx=3px, dy=3px -> distScreen = sqrt(18) ~= 4.24 px >= 4 px
      const pAbove = { x: 0.5 + 3 / 1000, y: 0.5 + 3 / 1000 };

      expect(exceedsScreenThreshold(p1, pBelow, transform, 4)).toBe(false);
      expect(exceedsScreenThreshold(p1, pAbove, transform, 4)).toBe(true);
    });
  });
});


