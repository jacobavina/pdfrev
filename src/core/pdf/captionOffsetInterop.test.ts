import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFNumber } from 'pdf-lib';
import { emitMarkupOperators, PageTransformInfo } from './operators';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { getMarkupSvgDescriptor, measureCaptionFrame } from '../markup/render';
import { lineCaptionLayout, offsetFromPoint, shiftCaption } from '../markup/measureCaption';
import { Markup, MarkupType } from '../../types/markup';

const transform: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const mk = (id: string, type: MarkupType, points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-21T12:00:00Z',
  updatedAt: '2026-10-21T12:00:00Z',
  status: 'pending',
  ...extra,
});

const length = (extra: Record<string, number> = {}) =>
  mk('len', 'length', [{ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.5 }], {
    text: '17.1 ft',
    measurement: { value: 17.1, unit: 'ft', formatted: '17.1 ft' },
    customFields: { captionStyle: 'inline', ...extra },
  });
const dimension = (extra: Record<string, number> = {}) =>
  mk('dim', 'dimension', [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.4, y: 0.2 }], {
    text: '16.86 ft',
    customFields: extra,
  });

const view = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
const textOf = (m: Markup) => {
  const flat = (d: ReturnType<typeof getMarkupSvgDescriptor>): ReturnType<typeof getMarkupSvgDescriptor>[] => [d, ...(d.children ?? []).flatMap(flat)];
  return flat(getMarkupSvgDescriptor(m, view)).find((d) => d.tag === 'text')!;
};

describe('Texto separable de la flecha en distancias y cotas (ADR-0097)', () => {
  it('el texto desplazado se mueve a lo largo y por encima de la línea, que deja de interrumpirse', () => {
    const a = { x: 100, y: 300 };
    const b = { x: 400, y: 300 };
    const normal = lineCaptionLayout(a, b, '17.1 ft', 10, 'inline');
    expect(normal.pieces).toHaveLength(2);
    const moved = lineCaptionLayout(a, b, '17.1 ft', 10, 'inline', 0, undefined, { along: 30, up: 25 });
    expect(moved.pieces).toEqual([[a, b]]);
    expect(moved.caption.origin.x).toBeCloseTo(normal.caption.origin.x + 30, 6);
    expect(moved.caption.origin.y).toBeCloseTo(normal.caption.origin.y - 25, 6);
  });

  it('arrastrar el tirador calcula el desplazamiento respecto del sitio normal y volver lo deja en cero', () => {
    const frame = measureCaptionFrame(length(), view)!;
    const dragged = { x: frame.origin.x + 40, y: frame.origin.y - 30 };
    const off = offsetFromPoint(frame.origin, frame.angle, dragged, frame.pxPerPt);
    expect(off.along).toBeCloseTo(40, 6);
    expect(off.up).toBeCloseTo(30, 6);
    const back = shiftCaption({ text: '', origin: frame.origin, angle: frame.angle, fontSize: 10 }, off, frame.pxPerPt);
    expect(back.origin.x).toBeCloseTo(dragged.x, 6);
    expect(back.origin.y).toBeCloseTo(dragged.y, 6);
  });

  it('en pantalla el texto de la distancia y de la cota sale desplazado de su sitio normal', () => {
    const l0 = textOf(length());
    const l1 = textOf(length({ captionOffsetX: 20, captionOffsetY: 15 }));
    expect(Number(l1.attrs.x) - Number(l0.attrs.x)).toBeCloseTo(20, 4);
    expect(Number(l1.attrs.y) - Number(l0.attrs.y)).toBeCloseTo(-15, 4);
    const d0 = textOf(dimension());
    const d1 = textOf(dimension({ captionOffsetX: 20, captionOffsetY: 15 }));
    expect(Number(d1.attrs.x)).not.toBeCloseTo(Number(d0.attrs.x), 1);
    expect(Math.hypot(Number(d1.attrs.x) - Number(d0.attrs.x), Number(d1.attrs.y) - Number(d0.attrs.y))).toBeCloseTo(25, 4);
  });

  it('en el /AP el texto también va desplazado y la línea de la distancia queda entera', () => {
    const ops0 = emitMarkupOperators(length(), transform).operators;
    const ops1 = emitMarkupOperators(length({ captionOffsetX: 20, captionOffsetY: 15 }), transform).operators;
    const tm = (ops: string) => /1\.0000 0\.0000 0\.0000 1\.0000 ([\d.-]+) ([\d.-]+) Tm/.exec(ops) ?? /([\d.-]+) ([\d.-]+) Td/.exec(ops);
    expect(tm(ops0)).not.toBeNull();
    expect(tm(ops1)![1]).not.toBe(tm(ops0)![1]);
    // Sin desplazar la línea se parte en dos tramos; desplazado, en uno
    const strokes = (ops: string) => ops.split('\n').filter((l) => l === 'S').length;
    expect(strokes(ops0)).toBeGreaterThan(strokes(ops1));
  });

  it('el desplazamiento se guarda como /CO en la anotación y vuelve al abrir el PDF', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [length({ captionOffsetX: 20.5, captionOffsetY: -12 }), dimension({ captionOffsetX: -8, captionOffsetY: 30 })]);
    const doc = await PDFDocument.load(saved);
    const annots = doc
      .getPages()[0]
      .node.lookup(PDFName.of('Annots'), PDFArray)
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .filter((d) => d.get(PDFName.of('Subtype'))?.toString() === '/Line');
    expect(annots).toHaveLength(2);
    const co = annots.map((d) => (d.get(PDFName.of('CO')) as PDFArray).asArray().map((n) => (n as PDFNumber).asNumber()));
    expect(co).toEqual([
      [20.5, -12],
      [-8, 30],
    ]);
    const back = (await importPdfAnnotations(saved)).markups;
    const l = back.find((m) => m.id === 'len')!;
    const d = back.find((m) => m.id === 'dim')!;
    expect(l.customFields).toMatchObject({ captionOffsetX: 20.5, captionOffsetY: -12 });
    expect(d.customFields).toMatchObject({ captionOffsetX: -8, captionOffsetY: 30 });
  });

  it('sin desplazamiento no se escribe /CO', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [length(), dimension()]);
    expect(Buffer.from(saved).toString('latin1')).not.toContain('/CO [');
  });
});
