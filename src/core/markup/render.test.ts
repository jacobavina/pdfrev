import { describe, it, expect } from 'vitest';
import {
  getEllipseGeometry,
  getRectGeometry,
  pointsToSvgPointsString,
  pointsToFreehandPathD,
  getMarkupSvgDescriptor,
} from './render';
import { Markup } from '../../types/markup';

describe('Pure Markup Rendering (src/core/markup/render.ts - Criterio 1)', () => {
  const transform = {
    width: 800,
    height: 600,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  it('computes correct ellipse geometry from 2 points', () => {
    const ell = getEllipseGeometry({ x: 100, y: 150 }, { x: 500, y: 350 });
    expect(ell.cx).toBe(300);
    expect(ell.cy).toBe(250);
    expect(ell.rx).toBe(200);
    expect(ell.ry).toBe(100);
  });

  it('computes correct rectangle geometry from 2 points', () => {
    const rect = getRectGeometry({ x: 300, y: 200 }, { x: 100, y: 50 });
    expect(rect.x).toBe(100);
    expect(rect.y).toBe(50);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(150);
  });

  it('generates polygon points string in screen coordinates', () => {
    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.3, y: 0.5 },
    ];
    const str = pointsToSvgPointsString(points, transform);
    // 0.1*800=80, 0.1*600=60, 0.5*800=400, 0.3*800=240, 0.5*600=300
    expect(str).toBe('80.00,60.00 400.00,60.00 240.00,300.00');
  });

  it('generates freehand path D string in screen coordinates', () => {
    const points = [
      { x: 0.1, y: 0.2 },
      { x: 0.2, y: 0.3 },
    ];
    const pathD = pointsToFreehandPathD(points, transform);
    expect(pathD).toBe('M 80.00 120.00 L 160.00 180.00');
  });

  it('returns valid SVG descriptors for polygon and circle without DOM', () => {
    const polyMarkup: Markup = {
      id: 'poly-1',
      type: 'polygon',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.1 },
        { x: 0.2, y: 0.4 },
      ],
      style: {
        strokeColor: '#00ff00',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const polyDesc = getMarkupSvgDescriptor(polyMarkup, transform);
    expect(polyDesc.tag).toBe('polygon');
    expect(polyDesc.attrs.stroke).toBe('#00ff00');
    expect(polyDesc.attrs.points).toBe('80.00,60.00 320.00,60.00 160.00,240.00');

    const circleMarkup: Markup = {
      id: 'circle-1',
      type: 'circle',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
      ],
      style: {
        strokeColor: '#ff0000',
        strokeWidth: 2,
        opacity: 1,
      },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const circleDesc = getMarkupSvgDescriptor(circleMarkup, transform);
    expect(circleDesc.tag).toBe('ellipse');
    expect(circleDesc.attrs.cx).toBe(240); // (80 + 400) / 2
    expect(circleDesc.attrs.cy).toBe(180); // (60 + 300) / 2
    expect(circleDesc.attrs.rx).toBe(160);
    expect(circleDesc.attrs.ry).toBe(120);
  });
});
