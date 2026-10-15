import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { cloudCenters, cloudOutline, cloudPathFromOutline, cloudRadius, revisionCloudPath, CLOUD_TAIL } from './revisionCloud';
import {
  linePatternPrimitives,
  markupLinePattern,
  offsetPolyline,
  patternOutlineOf,
  PATTERN_LINE_STYLES,
} from './linePatterns';
import { dashArrayFor, lineStyleOf, lineStyleOfMarkup, LINE_STYLE_LABELS, DashStyleId } from './lineStyles';
import { emitMarkupOperators, PageTransformInfo } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { getMarkupSvgDescriptor } from './render';
import { Markup, MarkupType } from '../../types/markup';

/** Puntos finales de cada curva y recta de un trazado SVG (M/L/C). */
const ends = (d: string) => {
  const out: { x: number; y: number }[] = [];
  const re = /([MLC])((?:\s*-?[\d.]+){2,6})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const n = m[2].trim().split(/\s+/).map(Number);
    out.push({ x: n[n.length - 2], y: n[n.length - 1] });
  }
  return out;
};

const mk = (id: string, type: MarkupType, points: { x: number; y: number }[], style: Partial<Markup['style']> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1, ...style },
  author: 'Revisor',
  createdAt: '2026-10-15T12:00:00Z',
  updatedAt: '2026-10-15T12:00:00Z',
  status: 'pending',
});

describe('Nube como la de Revu (ADR-0041)', () => {
  const rect = cloudOutline([{ x: 0, y: 0 }, { x: 200, y: 120 }]);

  it('cada lóbulo es un arco del mismo radio centrado en un vértice o un punto del contorno', () => {
    const R = cloudRadius(20);
    const centers = cloudCenters(rect, true, 20);
    // Un lóbulo en cada esquina
    for (const c of rect) expect(centers).toContainEqual(c);
    // Todos los puntos del trazado están sobre algún lóbulo
    for (const p of ends(revisionCloudPath(rect, 20))) {
      const nearest = Math.min(...centers.map((c) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - R)));
      expect(nearest).toBeLessThan(0.05);
    }
  });

  it('los lóbulos vecinos se cortan siempre y el arco entra en el siguiente (gancho de Revu)', () => {
    const quad = [{ x: 0, y: 0 }, { x: 137, y: -30 }, { x: 260, y: 90 }, { x: 70, y: 210 }];
    const centers = cloudCenters(quad, true, 20);
    for (let i = 0; i < centers.length; i++) {
      const a = centers[i];
      const b = centers[(i + 1) % centers.length];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(2 * cloudRadius(20));
    }
    expect(CLOUD_TAIL).toBeGreaterThan(0);
    // El gancho sale y vuelve por el mismo arco: dos puntos finales iguales separados por uno
    const pts = ends(revisionCloudPath(quad, 20));
    const returns = pts.filter((p, i) => i >= 2 && Math.hypot(p.x - pts[i - 2].x, p.y - pts[i - 2].y) < 0.02);
    expect(returns.length).toBeGreaterThanOrEqual(centers.length - 1);
  });

  it('sobresale un radio hacia fuera; invertida queda por dentro; abierta sigue la línea', () => {
    const R = cloudRadius(20);
    const ys = (d: string) => ends(d).map((p) => p.y);
    expect(Math.min(...ys(revisionCloudPath(rect, 20)))).toBeCloseTo(-R, 0);
    expect(Math.min(...ys(revisionCloudPath(rect, 20, true)))).toBeGreaterThan(-R * 0.3);
    const open = cloudPathFromOutline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false, 20);
    expect(open.endsWith('Z')).toBe(false);
    expect(Math.min(...ys(open))).toBeCloseTo(-R, 0);
  });
});

describe('Tipos de línea de Revu (ADR-0041)', () => {
  it('la lista tiene los tipos de Revu: Solid, Dashed 1 a 6, Cloud y los patrones', () => {
    const labels = Object.values(LINE_STYLE_LABELS);
    for (const l of [
      'Solid', 'Dashed 1', 'Dashed 2', 'Dashed 3', 'Dashed 4', 'Dashed 5', 'Dashed 6', 'Cloud', 'Fenceline Circle',
      'Fenceline Square', 'Gas', 'Hot Water', 'Zig Zag', 'Insulation', 'Double', 'Tracks', 'Road',
    ]) {
      expect(labels).toContain(l);
    }
    expect(PATTERN_LINE_STYLES).toHaveLength(10);
  });

  it('Dashed 1 a 6 son patrones distintos y se reconocen al leerlos de un PDF', () => {
    const ids: DashStyleId[] = ['dashed', 'dashed2', 'dashed3', 'dashDot', 'dashed5', 'dashed6', 'dotted'];
    const seen = new Set(ids.map((id) => JSON.stringify(dashArrayFor(id, 1))));
    expect(seen.size).toBe(ids.length);
    for (const id of ids) expect(lineStyleOf(dashArrayFor(id, 2.5))).toBe(id);
    expect(dashArrayFor('road', 2)).toBeUndefined();
    expect(lineStyleOfMarkup(mk('c', 'cloud', []))).toBe('cloud');
    expect(lineStyleOfMarkup(mk('l', 'line', [], { lineStyle: 'tracks' }))).toBe('tracks');
  });

  it('valla, gas y agua caliente cortan la línea en cada símbolo; el texto va en trazos y legible', () => {
    const line = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const fence = linePatternPrimitives(line, false, 'fenceCircle', { strokeWidth: 1, unitsPerPt: 1 });
    // 200 pt / 24 pt por símbolo = 8 círculos → 9 tramos de línea + 1 trazado con los círculos
    expect(fence.strokes).toHaveLength(10);
    expect(fence.strokes[9].d.match(/M /g)).toHaveLength(8);
    const gas = linePatternPrimitives(line, false, 'gas', { strokeWidth: 1, unitsPerPt: 1 });
    const label = gas.strokes[gas.strokes.length - 1];
    expect(label.width).toBeGreaterThan(0);
    // Una línea trazada de derecha a izquierda no pone el texto boca abajo: mismo dibujo
    const back = linePatternPrimitives([...line].reverse(), false, 'gas', { strokeWidth: 1, unitsPerPt: 1 });
    const glyphs = (d: string) => d.split(/(?=M )/).map((x) => x.trim()).sort();
    expect(glyphs(back.strokes[back.strokes.length - 1].d)).toEqual(glyphs(label.d));
  });

  it('doble, vías y camino van paralelos a ambos lados; zigzag y aislamiento no salen de su banda', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const dbl = linePatternPrimitives(line, false, 'double', { strokeWidth: 1, unitsPerPt: 1 });
    expect(dbl.strokes.map((s) => ends(s.d)[0].y)).toEqual([-1.95, 1.95]);
    const tracks = linePatternPrimitives(line, false, 'tracks', { strokeWidth: 1, unitsPerPt: 1 });
    expect(tracks.strokes).toHaveLength(3); // dos carriles y las traviesas
    const road = linePatternPrimitives(line, false, 'road', { strokeWidth: 1, unitsPerPt: 1 });
    expect(road.strokes[2].d.match(/M /g)!.length).toBeGreaterThan(10); // eje discontinuo
    for (const id of ['zigzag', 'insulation'] as const) {
      const ys = ends(linePatternPrimitives(line, false, id, { strokeWidth: 1, unitsPerPt: 1 }).strokes[0].d).map((p) => Math.abs(p.y));
      expect(Math.max(...ys)).toBeLessThanOrEqual(3.61);
    }
    // Las paralelas de un contorno cerrado se unen en inglete
    const sq = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], 1, true);
    expect(sq[0].x).toBeCloseTo(-1, 9);
    expect(sq[0].y).toBeCloseTo(-1, 9);
  });

  it('se aplica a líneas, polilíneas, polígonos, rectángulos y elipses; no a las mediciones', () => {
    expect(patternOutlineOf('rectangle', [{ x: 0, y: 0 }, { x: 1, y: 1 }], { width: 10, height: 20 })!.pts).toHaveLength(4);
    expect(patternOutlineOf('circle', [{ x: 0, y: 0 }, { x: 1, y: 1 }], { width: 10, height: 20 })!.closed).toBe(true);
    expect(markupLinePattern(mk('a', 'polyLine', [], { lineStyle: 'zigzag' }))).toBe('zigzag');
    expect(markupLinePattern(mk('b', 'length', [], { lineStyle: 'zigzag' }))).toBeNull();
    expect(markupLinePattern(mk('c', 'line', [], { lineStyle: 'dashed' }))).toBeNull();
  });

  it('pantalla y /AP dibujan el patrón con la misma geometría y conservan las flechas', () => {
    const transform: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
    const line = mk('ln', 'line', [{ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.5 }], { lineStyle: 'tracks', lineEndingEnd: 'closedArrow' });
    const ap = emitMarkupOperators(line, transform);
    expect(ap.operators.split('\n').filter((l) => l === 'S')).toHaveLength(3);
    expect(ap.operators).toMatch(/^f$/m); // punta rellena
    // La caja del /AP incluye el ancho de las traviesas
    expect(ap.bbox[3] - ap.bbox[1]).toBeGreaterThan(6);
    const screen = getMarkupSvgDescriptor(line, { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 });
    expect(screen.tag).toBe('g');
    const paths = JSON.stringify(screen).match(/"tag":"path"/g) ?? [];
    expect(paths.length).toBe(3);
  });

  it('ida y vuelta: el tipo de línea con patrón se guarda en el PDF y se recupera al abrirlo', async () => {
    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
    const road = mk('road-1', 'polyLine', [{ x: 0.1, y: 0.7 }, { x: 0.3, y: 0.8 }, { x: 0.5, y: 0.7 }], { lineStyle: 'road' });
    const back = await importPdfAnnotations(await saveIncrementalMarkups(blueprint, [road]));
    expect(back.markups.find((m) => m.id === 'road-1')!.style.lineStyle).toBe('road');
  });
});
