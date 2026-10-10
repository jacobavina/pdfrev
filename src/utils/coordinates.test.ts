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
} from './coordinates';
import { Markup } from '../types/markup';
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
});
