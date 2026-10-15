import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFString } from 'pdf-lib';
import { lineEndingShape, lineEndingSize } from './lineEndings';
import { lineCaptionLayout, pointCaption, MEASURE_CAPTION_PT } from './measureCaption';
import { getMarkupSvgDescriptor, SvgRenderDescriptor } from './render';
import { emitMarkupOperators, PageTransformInfo } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { Markup, MarkupType, ViewportTransform } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
const pdfT: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
const screen = (zoom = 1): ViewportTransform => ({ width: 800 * zoom, height: 600 * zoom, scale: 1, offsetX: 0, offsetY: 0, zoom });

const mk = (id: string, type: MarkupType, points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-14T12:00:00Z',
  updatedAt: '2026-10-14T12:00:00Z',
  status: 'pending',
  ...extra,
});

/** Todos los nodos de un descriptor, en profundidad. */
const flatten = (d: SvgRenderDescriptor): SvgRenderDescriptor[] => [d, ...(d.children ?? []).flatMap(flatten)];

describe('Flechas al estilo de Acrobat (ADR-0032)', () => {
  it('punta angosta de las mediciones de Acrobat (~20° por lado) y 9 pt de largo con una línea de 1 pt', () => {
    const s = lineEndingShape({ x: 0, y: 0 }, 0, 'openArrow', lineEndingSize(1))!;
    expect(s.kind).toBe('polyline');
    const [a1, tip, a2] = (s as { points: { x: number; y: number }[] }).points;
    expect(tip).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(a1.x, a1.y)).toBeCloseTo(9, 9);
    const angle = Math.abs(Math.atan2(a1.y, a1.x) - Math.atan2(a2.y, a2.x));
    // ADR-0033: proporción medida en una captura de Acrobat (16 px de largo por 12 px de base)
    expect((2 * Math.PI - angle) * (180 / Math.PI)).toBeCloseTo(41.25, 1);
  });

  it('flechas invertidas: el vértice en el extremo y las alas hacia fuera de la línea', () => {
    // Línea que llega a la punta hacia la derecha: las alas invertidas quedan a la derecha del extremo
    const open = lineEndingShape({ x: 0, y: 0 }, 0, 'rOpenArrow', 10) as { kind: string; points: { x: number }[]; filled: boolean };
    expect(open.kind).toBe('polyline');
    expect(open.points[0].x).toBeGreaterThan(0);
    expect(open.points[2].x).toBeGreaterThan(0);
    const closed = lineEndingShape({ x: 0, y: 0 }, 0, 'rClosedArrow', 10) as { kind: string; filled: boolean };
    expect(closed.kind).toBe('polygon');
    expect(closed.filled).toBe(true);
  });

  it('/ROpenArrow y /RClosedArrow se escriben y se vuelven a leer', async () => {
    const line = mk('ln', 'line', [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.2 }], {
      style: { strokeColor: '#000', strokeWidth: 1, opacity: 1, lineEndingStart: 'rOpenArrow', lineEndingEnd: 'rClosedArrow' },
    });
    const saved = await saveIncrementalMarkups(blueprint, [line]);
    const back = (await importPdfAnnotations(saved)).markups.find((m) => m.id === 'ln')!;
    expect(back.style.lineEndingStart).toBe('rOpenArrow');
    expect(back.style.lineEndingEnd).toBe('rClosedArrow');
  });
});

describe('Texto de medición al estilo de Acrobat (ADR-0032)', () => {
  it('dentro de la línea: dos tramos con un hueco centrado para el texto', () => {
    const l = lineCaptionLayout({ x: 0, y: 100 }, { x: 300, y: 100 }, '10.6 m', 10, 'inline', 9);
    expect(l.style).toBe('inline');
    expect(l.pieces).toHaveLength(2);
    const gapStart = l.pieces[0][1].x;
    const gapEnd = l.pieces[1][0].x;
    expect((gapStart + gapEnd) / 2).toBeCloseTo(150, 9);
    expect(gapEnd - gapStart).toBeGreaterThan(30);
    expect(l.caption.origin.x).toBeCloseTo(150, 9);
    expect(l.caption.origin.y).toBeGreaterThan(100); // línea base algo por debajo: texto centrado en la línea
  });

  it('el texto nunca queda boca abajo y, si la línea es corta, va encima', () => {
    const rtl = lineCaptionLayout({ x: 300, y: 100 }, { x: 0, y: 100 }, '10.6 m', 10, 'inline');
    expect(Math.cos(rtl.caption.angle)).toBeCloseTo(1, 9);
    const short = lineCaptionLayout({ x: 0, y: 100 }, { x: 30, y: 100 }, '10.6 m', 10, 'inline', 9);
    expect(short.style).toBe('top');
    expect(short.pieces).toHaveLength(1);
    expect(short.caption.origin.y).toBeLessThan(100); // encima de la línea (y hacia abajo)
    expect(pointCaption({ x: 5, y: 5 }, 'x', 10).angle).toBe(0);
  });

  it('en pantalla: Distance con flechas cerradas, línea interrumpida y texto negro sin recuadro', () => {
    const len = mk('d1', 'length', [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }], {
      measurement: { value: 10.6, unit: 'm', formatted: '10.6 m' },
    });
    const nodes = flatten(getMarkupSvgDescriptor(len, screen()));
    expect(nodes.filter((n) => n.tag === 'line')).toHaveLength(2);
    expect(nodes.filter((n) => n.tag === 'polygon')).toHaveLength(2); // dos flechas cerradas (ADR-0033)
    expect(nodes.filter((n) => n.tag === 'rect')).toHaveLength(0);
    const text = nodes.find((n) => n.tag === 'text')!;
    expect(text.textNode).toBe('10.6 m');
    expect(text.attrs.fill).toBe('#000000');
    expect(text.attrs.fontSize).toBe(MEASURE_CAPTION_PT);
    // "On Top": una sola línea y el texto encima; el tamaño del texto sigue al zoom
    const top = flatten(getMarkupSvgDescriptor({ ...len, customFields: { captionStyle: 'top' } }, screen(2)));
    expect(top.filter((n) => n.tag === 'line')).toHaveLength(1);
    expect(top.find((n) => n.tag === 'text')!.attrs.fontSize).toBe(MEASURE_CAPTION_PT * 2);
  });

  it('área, polilongitud y radio: valor como texto simple, sin recuadro', () => {
    for (const m of [
      mk('a', 'area', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }], { measurement: { value: 1, unit: 'm', formatted: '1.00 m²' } }),
      mk('p', 'polylineMeasure', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }], { measurement: { value: 1, unit: 'm', formatted: '1.00 m' } }),
      mk('r', 'radius', [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }], { measurement: { value: 1, unit: 'm', formatted: '1.00 m' } }),
    ]) {
      const nodes = flatten(getMarkupSvgDescriptor(m, screen()));
      expect(nodes.filter((n) => n.tag === 'rect')).toHaveLength(0);
      expect(nodes.find((n) => n.tag === 'text')!.attrs.fill).toBe('#000000');
    }
  });

  it('/AP: la distancia dibuja dos tramos, las flechas y el valor; el área lleva su valor', () => {
    const len = mk('d2', 'length', [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }], {
      measurement: { value: 10.6, unit: 'm', formatted: '10.6 m' },
    });
    const ops = emitMarkupOperators(len, pdfT).operators.split('\n');
    expect(ops.filter((l) => l === 'S').length).toBe(2); // dos tramos
    expect(ops.filter((l) => l === 'b').length).toBe(2); // dos flechas cerradas y rellenas (ADR-0033)
    expect(ops).toContain('(10.6 m) Tj');
    expect(ops).toContain('0.000 0.000 0.000 rg');
    const area = mk('a2', 'area', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }], {
      measurement: { value: 1, unit: 'm', formatted: '1.00 m²' },
    });
    expect(emitMarkupOperators(area, pdfT).operators).toContain('(1.00 m\\262) Tj');
  });

  it('el PDF lleva /Cap y /CP de la distancia y sus flechas cerradas; un /CP /Top ajeno se respeta', async () => {
    const len = mk('d3', 'length', [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }], {
      measurement: { value: 10.6, unit: 'm', formatted: '10.6 m' },
      customFields: { captionStyle: 'top' },
    });
    const saved = await saveIncrementalMarkups(blueprint, [len]);
    const doc = await PDFDocument.load(saved);
    const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    const line = annots
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .find((d) => d.get(PDFName.of('IT'))?.toString() === '/LineDimension')!;
    expect(line.get(PDFName.of('Cap'))?.toString()).toBe('true');
    expect(line.get(PDFName.of('CP'))?.toString()).toBe('/Top');
    expect(line.lookup(PDFName.of('LE'), PDFArray).asArray().map(String)).toEqual(['/ClosedArrow', '/ClosedArrow']);

    // Distancia ajena con el texto encima
    const foreign = await PDFDocument.load(blueprint);
    const measure = foreign.context.obj({
      Type: 'Measure',
      Subtype: 'RL',
      X: [{ U: PDFString.of('ft'), C: 0.5 }],
    } as never);
    const annot = foreign.context.obj({
      Type: 'Annot',
      Subtype: 'Line',
      Rect: [100, 300, 200, 310],
      L: [100, 305, 200, 305],
      IT: 'LineDimension',
      CP: 'Top',
      Measure: measure,
    } as never);
    foreign.getPages()[0].node.set(PDFName.of('Annots'), foreign.context.obj([foreign.context.register(annot)]));
    const [m] = (await importPdfAnnotations(await foreign.save())).markups.slice(-1);
    expect(m.type).toBe('length');
    expect(m.customFields?.captionStyle).toBe('top');
  });
});
