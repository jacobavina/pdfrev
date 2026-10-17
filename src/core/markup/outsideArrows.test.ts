import { describe, it, expect } from 'vitest';
import { outsideArrowLayout, lineEndingSize } from './lineEndings';
import { getMarkupSvgDescriptor, SvgRenderDescriptor } from './render';
import { emitMarkupOperators } from '../pdf/operators';
import { controlPointsOf, applyControlPointDrag } from './controlPoints';
import { Markup } from '../../types/markup';

const find = (d: SvgRenderDescriptor, pred: (x: SvgRenderDescriptor) => boolean): SvgRenderDescriptor[] =>
  (pred(d) ? [d] : []).concat((d.children ?? []).flatMap((c) => find(c, pred)));

const length = (x2: number): Markup => ({
  id: 'len',
  type: 'length',
  pageIndex: 0,
  points: [{ x: 0.5, y: 0.5 }, { x: x2, y: 0.5 }],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
  measurement: { value: 1, unit: 'ft', formatted: '16.74 ft' },
});

describe('Distancia corta y conteo de Revu (ADR-0063)', () => {
  it('en una distancia corta las puntas van por fuera apuntando hacia dentro, con un tramo exterior en cada extremo', () => {
    const size = lineEndingSize(1); // 9 pt
    const ends = { lineEndingStart: 'closedArrow', lineEndingEnd: 'closedArrow' };
    // 16 pt < 2.5 puntas: por fuera
    const o = outsideArrowLayout({ x: 100, y: 50 }, { x: 116, y: 50 }, size, ends)!;
    expect(o.start).toBeCloseTo(0, 9); // en el inicio apunta hacia el final
    expect(Math.abs(o.end)).toBeCloseTo(Math.PI, 9); // en el final apunta hacia el inicio
    expect(o.stubs[0][1].x).toBeLessThan(100);
    expect(o.stubs[1][1].x).toBeGreaterThan(116);
    // Con sitio, dentro; y sin flechas (círculos, barras) nunca se dan la vuelta
    expect(outsideArrowLayout({ x: 0, y: 0 }, { x: 60, y: 0 }, size, ends)).toBeNull();
    expect(outsideArrowLayout({ x: 0, y: 0 }, { x: 10, y: 0 }, size, { lineEndingStart: 'circle', lineEndingEnd: 'circle' })).toBeNull();

    // Pantalla y /AP: 16 pt en una hoja de 800 pt de ancho
    const short = length(0.52);
    const screen = getMarkupSvgDescriptor(short, { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 });
    expect(find(screen, (d) => d.attrs['data-arrows'] === 'outside')).toHaveLength(1);
    const long = getMarkupSvgDescriptor(length(0.7), { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 });
    expect(find(long, (d) => d.attrs['data-arrows'] === 'outside')).toHaveLength(0);
    const ap = emitMarkupOperators(short, { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 });
    // Los dos tramos exteriores salen más allá de los extremos (x = 400 y 416 pt)
    expect(ap.bbox[0]).toBeLessThan(400 - size);
    expect(ap.bbox[2]).toBeGreaterThan(416 + size);
  });

  it('cada símbolo del conteo tiene su tirador y se mueve solo, y el conteo sigue siendo uno', () => {
    const cnt: Markup = {
      ...length(0.6),
      id: 'cnt',
      type: 'count',
      points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }, { x: 0.5, y: 0.3 }],
      customFields: { countSymbol: 'check' },
    };
    expect(controlPointsOf(cnt)).toHaveLength(3);
    expect(controlPointsOf({ ...cnt, points: [{ x: 0.2, y: 0.2 }] })).toHaveLength(1);
    const moved = applyControlPointDrag(cnt, 1, { x: 0.35, y: 0.25 });
    expect(moved).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.35, y: 0.25 }, { x: 0.5, y: 0.3 }]);
    // Un conteo numerado anterior no cambia
    expect(controlPointsOf({ ...cnt, customFields: undefined, points: [{ x: 0.2, y: 0.2 }] })).toBeNull();
  });
});
