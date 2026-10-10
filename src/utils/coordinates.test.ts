import { describe, it, expect } from 'vitest';
import {
  pdfToNormalized,
  normalizedToPdf,
  normalizedToScreen,
  screenToNormalized,
  getMarkupBounds,
  hitTestMarkup,
} from './coordinates';
import { Markup } from '../types/markup';
import fixtureMeta from '../../fixtures/test-blueprint.meta.json';

describe('Coordinate Conversion and Hit-Testing', () => {
  const { pageSize, knownRectangle } = fixtureMeta;

  it('correctly converts known PDF rectangle to normalized space', () => {
    // Top-left of the rectangle in PDF is at y = 150 + 200 = 350
    const topLeftPdf = { x: knownRectangle.pdf.x, y: knownRectangle.pdf.y + knownRectangle.pdf.height };
    const normTopLeft = pdfToNormalized(topLeftPdf.x, topLeftPdf.y, pageSize.width, pageSize.height);

    expect(normTopLeft.x).toBeCloseTo(knownRectangle.normalized.x, 4);
    expect(normTopLeft.y).toBeCloseTo(knownRectangle.normalized.y, 4);
  });

  it('round-trips normalized coordinates back to PDF space accurately', () => {
    const norm = { x: 0.125, y: 0.4166667 };
    const pdf = normalizedToPdf(norm.x, norm.y, pageSize.width, pageSize.height);

    expect(pdf.x).toBeCloseTo(100, 1);
    expect(pdf.y).toBeCloseTo(350, 1); // 600 - 250 = 350
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

    // screenX = 0.5 * 800 * 1.5 + 100 = 600 + 100 = 700
    // screenY = 0.5 * 600 * 1.5 + 50 = 450 + 50 = 500
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
        { x: 0.500, y: 0.7500 },
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

    // Point in the middle
    expect(hitTestMarkup({ x: 0.3, y: 0.5 }, markup)).toBe(true);

    // Point outside
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

    // Near midpoint (0.5, 0.5)
    expect(hitTestMarkup({ x: 0.505, y: 0.505 }, lineMarkup, 0.02)).toBe(true);
    // Far from line
    expect(hitTestMarkup({ x: 0.1, y: 0.9 }, lineMarkup, 0.02)).toBe(false);
  });
});
