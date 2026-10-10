import { describe, it, expect } from 'vitest';
import {
  getEllipseGeometry,
  getRectGeometry,
  pointsToSvgPointsString,
  pointsToFreehandPathD,
  generateCloudPath,
  getMarkupSvgDescriptor,
  normalizeSvgAttrs,
  renderSvgDescriptor,
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

  it('C1: returns valid text descriptor with tag text (not path) and textNode', () => {
    const textMarkup: Markup = {
      id: 'text-1',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.3, y: 0.2 },
      ],
      style: {
        strokeColor: '#333333',
        strokeWidth: 1,
        opacity: 1,
      },
      text: 'Nota técnica de control',
      author: 'Revisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const desc = getMarkupSvgDescriptor(textMarkup, transform);
    expect(desc.tag).toBe('g');
    expect(desc.children).toBeDefined();
    expect(desc.children).toHaveLength(2);
    expect(desc.children![0].tag).toBe('rect');
    expect(desc.children![1].tag).toBe('text');
    expect(desc.children![1].textNode).toBe('Nota técnica de control');
  });

  it('C2 & Criterio 4: highlightVector uses HIGHLIGHT_STYLE #ffff00, opacity 0.5 and mixBlendMode multiply', () => {
    const hlMarkup: Markup = {
      id: 'hl-1',
      type: 'highlightVector',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.4, y: 0.3 },
      ],
      style: {
        strokeColor: '#000000',
        strokeWidth: 1,
        opacity: 1,
      },
      author: 'Revisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const desc = getMarkupSvgDescriptor(hlMarkup, transform);
    expect(desc.tag).toBe('rect');
    expect(desc.attrs.fill).toBe('#ffff00');
    expect(desc.attrs.opacity).toBe(0.5);
    expect(desc.style?.mixBlendMode).toBe('multiply');
  });

  it('C2: generateCloudPath operates in page space independently of zoom', () => {
    const p1 = { x: 0.1, y: 0.2 };
    const p2 = { x: 0.6, y: 0.7 };
    const pageSize = { width: 800, height: 600 };

    const path1 = generateCloudPath(p1, p2, pageSize, 20);
    expect(path1).toContain('M 80.00 120.00');
    expect(path1).toContain('Q');
    expect(path1).toContain('Z');
  });

  it('C1: normalizeSvgAttrs mapea claves kebab-case a camelCase para React.createElement', () => {
    const rawAttrs = {
      'stroke-width': 2,
      'stroke-dasharray': '4 4',
      'font-size': 14,
      'text-anchor': 'middle',
      'data-testid': 'markup-item',
      'aria-label': 'Anotación',
    };

    const normalized = normalizeSvgAttrs(rawAttrs);
    expect(normalized.strokeWidth).toBe(2);
    expect(normalized.strokeDasharray).toBe('4 4');
    expect(normalized.fontSize).toBe(14);
    expect(normalized.textAnchor).toBe('middle');
    // data-* y aria-* preservados
    expect(normalized['data-testid']).toBe('markup-item');
    expect(normalized['aria-label']).toBe('Anotación');
    // Las claves con guion fueron eliminadas de las propiedades directas
    expect(normalized['stroke-width']).toBeUndefined();
    expect(normalized['font-size']).toBeUndefined();
  });

  it('C1: renderSvgDescriptor produce React.createElement con props camelCase y sin warnings', () => {
    const desc = {
      tag: 'text' as const,
      attrs: {
        x: 10,
        y: 20,
        'font-size': 16,
        'stroke-width': 1.5,
        'text-anchor': 'start',
      },
      textNode: 'Texto de prueba',
    };

    const el = renderSvgDescriptor(desc, 'test-key');
    expect(el.props.fontSize).toBe(16);
    expect(el.props.strokeWidth).toBe(1.5);
    expect(el.props.textAnchor).toBe('start');
    expect(el.props['font-size']).toBeUndefined();
    expect(el.props['stroke-width']).toBeUndefined();
    expect(el.props['text-anchor']).toBeUndefined();
  });
});
