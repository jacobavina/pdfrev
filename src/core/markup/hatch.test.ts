import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { HATCH_PATTERNS, hatchOutlineD, hatchStrokes, markupHatch, pathBox } from './hatch';
import { getMarkupSvgDescriptor } from './render';
import { emitMarkupOperators } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { Markup } from '../../types/markup';

const box = { x: 10, y: 20, width: 100, height: 60 };

describe('Hatch de formas cerradas (ADR-0057)', () => {
  it('ofrece los patrones de Revu y cada uno cubre la caja de la forma con trazos anclados a la página', () => {
    expect(HATCH_PATTERNS.map((p) => p.label)).toEqual([
      'Brick',
      'Diagonal Brick',
      'Horizontal',
      'Vertical',
      'Diagonal Down',
      'Diagonal Up',
      'Grid',
      'Weave',
      '10% Dots',
      '20% Dots',
      '30% Dots',
    ]);
    for (const { id } of HATCH_PATTERNS) {
      const [st] = hatchStrokes(box, id);
      const b = pathBox(st.d)!;
      expect(b.x).toBeLessThanOrEqual(box.x);
      expect(b.y).toBeLessThanOrEqual(box.y);
      expect(b.x + b.width).toBeGreaterThanOrEqual(box.x + box.width);
      expect(b.y + b.height).toBeGreaterThanOrEqual(box.y + box.height);
    }
    // Horizontal: líneas cada 8 pt en múltiplos de 8 (ancladas al origen, no a la forma)
    const ys = [...hatchStrokes(box, 'horizontal')[0].d.matchAll(/M [-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys).toEqual([8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88]);
    // Los puntos son filas discontinuas que cubren el 10, 20 o 30 % de la superficie
    const dots = hatchStrokes(box, 'dots20')[0];
    expect(dots.dash).toBeDefined();
    const [on, off] = dots.dash!;
    expect((on * on) / ((on + off) * (on + off))).toBeCloseTo(0.2, 6);
    // Con zoom 2 el patrón se escala con la página
    expect(hatchStrokes(box, 'horizontal', 2)[0].width).toBeCloseTo(1.5, 9);
  });

  it('solo las formas cerradas llevan hatch y su contorno sirve de recorte', () => {
    expect(markupHatch({ type: 'rectangle', style: { hatch: 'grid' } })).toBe('grid');
    expect(markupHatch({ type: 'line', style: { hatch: 'grid' } })).toBeNull();
    expect(markupHatch({ type: 'polygon', style: { hatch: 'bogus' } })).toBeNull();
    expect(hatchOutlineD('rectangle', [{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0 0 L 10 0 L 10 5 L 0 5 Z');
    expect(hatchOutlineD('circle', [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toMatch(/^M 10 5 C .* Z$/);
    expect(hatchOutlineD('cloud', [], 'M 1 1 Q 2 2 3 3 Z')).toBe('M 1 1 Q 2 2 3 3 Z');
  });

  it('la pantalla y el /AP dibujan el hatch recortado al contorno sin agrandar la caja, y el PDF lo conserva al reabrir', async () => {
    const rect: Markup = {
      id: 'h1',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }],
      style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1, hatch: 'grid' },
      author: 'Ana',
      createdAt: '2026-10-16T12:00:00Z',
      updatedAt: '2026-10-16T12:00:00Z',
      status: 'pending',
    };
    const json = JSON.stringify(getMarkupSvgDescriptor(rect, { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 }));
    expect(json).toContain('"tag":"clipPath"');
    expect(json).toContain('"data-hatch":"grid"');

    const t = { rotation: 0 as const, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
    const withHatch = emitMarkupOperators(rect, t);
    const plain = emitMarkupOperators({ ...rect, style: { ...rect.style, hatch: undefined } }, t);
    expect(withHatch.operators).toMatch(/W n\n0\.878 0\.141 0\.141 RG/);
    expect(withHatch.operators.split('\n').filter((l) => l === 'S').length).toBeGreaterThan(0);
    expect(withHatch.bbox).toEqual(plain.bbox);

    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
    const back = await importPdfAnnotations(await saveIncrementalMarkups(blueprint, [rect]));
    expect(back.markups.find((m) => m.id === 'h1')!.style.hatch).toBe('grid');
  });
});
