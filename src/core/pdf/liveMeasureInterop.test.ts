import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFNumber, PDFString, PDFObject } from 'pdf-lib';
import { saveIncrementalMarkups, measurementIntentOf } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { calibrationFromMeasure } from './pdfScale';
import { Markup, MarkupType, PageCalibration } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
const MM_PER_PT = 25.4 / 72;

const mk = (id: string, type: MarkupType, points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#7c3aed', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-12T12:00:00Z',
  updatedAt: '2026-10-12T12:00:00Z',
  status: 'pending',
  ...extra,
});

/** Diccionarios de anotación de la primera página, sin popups. */
async function annotsOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
  return annots
    .asArray()
    .map((r) => doc.context.lookup(r, PDFDict))
    .filter((d) => d.get(PDFName.of('Subtype'))?.toString() !== '/Popup');
}

const nameOf = (d: PDFDict, key: string) => d.get(PDFName.of(key))?.toString();

/** PDF con anotaciones "ajenas" (como las escribe Acrobat o Revu) en la primera página. */
async function withForeignAnnots(build: (doc: PDFDocument) => Record<string, unknown>[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(blueprint);
  const refs = build(doc).map((o) => doc.context.register(doc.context.obj(o as never)));
  doc.getPages()[0].node.set(PDFName.of('Annots'), doc.context.obj(refs));
  return doc.save();
}

/** /Measure /RL mínimo: 1 pt = `c` unidades `u`. */
const rl = (doc: PDFDocument, u: string, c: number): PDFObject =>
  doc.context.obj({
    Type: 'Measure',
    Subtype: 'RL',
    R: PDFString.of(`1 pt = ${c} ${u}`),
    X: [{ Type: 'NumberFormat', U: PDFString.of(u), C: c, D: 100 }],
    D: [{ Type: 'NumberFormat', U: PDFString.of(u), C: 1, D: 100 }],
    A: [{ Type: 'NumberFormat', U: PDFString.of(`sq ${u}`), C: 1, D: 100 }],
  } as never);

describe('Mediciones vivas en Revu y Acrobat (ADR-0030)', () => {
  it('intención por tipo: Length, Polylength/Perimeter y Area estándar; volumen, ángulo, conteo y radio de Revu', () => {
    const p = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }];
    expect(measurementIntentOf(mk('a', 'length', p))).toBe('LineDimension');
    expect(measurementIntentOf(mk('b', 'polylineMeasure', p))).toBe('PolyLineDimension');
    expect(measurementIntentOf(mk('c', 'perimeter', p))).toBe('PolyLineDimension');
    expect(measurementIntentOf(mk('d', 'area', p))).toBe('PolygonDimension');
    // Intenciones propias de Revu (ADR-0051)
    expect(measurementIntentOf(mk('e', 'volume', p))).toBe('PolygonVolume');
    expect(measurementIntentOf(mk('f', 'angle', p))).toBe('PolyLineAngle');
    expect(measurementIntentOf(mk('g', 'count', p))).toBe('PolygonCount');
    expect(measurementIntentOf(mk('h', 'radius', p))).toBe('PolygonRadius');
    for (const t of ['diameter', 'line', 'polygon'] as const) {
      expect(measurementIntentOf(mk('x', t, p))).toBeNull();
    }
  });

  it('cada medición lleva /IT y su /Measure con la escala de la página; el área rectangular va como polígono', async () => {
    const cal: PageCalibration = { scale: 0.05, unit: 'ft', precision: 2 };
    const saved = await saveIncrementalMarkups(
      blueprint,
      [
        mk('len', 'length', [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }]),
        mk('area', 'area', [{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.8 }]),
        mk('pl', 'polylineMeasure', [{ x: 0.1, y: 0.8 }, { x: 0.2, y: 0.9 }, { x: 0.3, y: 0.8 }]),
        mk('ln', 'line', [{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.5 }]),
      ],
      {},
      { calibrations: { 0: cal } }
    );
    const dicts = await annotsOf(saved);
    const [len, area, pl, ln] = dicts.slice(-4);
    expect(nameOf(len, 'Subtype')).toBe('/Line');
    expect(nameOf(len, 'IT')).toBe('/LineDimension');
    expect(nameOf(area, 'Subtype')).toBe('/Polygon');
    expect(nameOf(area, 'IT')).toBe('/PolygonDimension');
    expect(area.lookup(PDFName.of('Vertices'), PDFArray).size()).toBe(8);
    expect(nameOf(pl, 'IT')).toBe('/PolyLineDimension');
    expect(ln.get(PDFName.of('IT'))).toBeUndefined();
    expect(ln.get(PDFName.of('Measure'))).toBeUndefined();
    // La escala de la medición es la misma de la página, legible como cualquier /Measure /RL
    const measure = len.lookup(PDFName.of('Measure'), PDFDict);
    expect(nameOf(measure, 'Subtype')).toBe('/RL');
    const back = calibrationFromMeasure(measure, 0)!;
    expect(back.unit).toBe('ft');
    expect(back.scale).toBeCloseTo(0.05, 9);
  });

  it('sin escala definida en REA, el /Measure usa la que ya trae el PDF o, sin ninguna, mm de papel', async () => {
    // Página calibrada fuera de REA (p. ej. en Revu): /VP con /Measure de 0.1 m por punto
    const doc = await PDFDocument.load(blueprint);
    const page = doc.getPages()[0];
    page.node.set(
      PDFName.of('VP'),
      doc.context.obj([{ Type: 'Viewport', BBox: [0, 0, 800, 600], Measure: rl(doc, 'm', 0.1) }] as never)
    );
    const calibrated = await doc.save();
    const len = (await annotsOf(await saveIncrementalMarkups(calibrated, [mk('l', 'length', [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }])]))).pop()!;
    const fromPage = calibrationFromMeasure(len.lookup(PDFName.of('Measure'), PDFDict), 0)!;
    expect(fromPage.unit).toBe('m');
    expect(fromPage.scale).toBeCloseTo(0.1, 9);

    const plain = (await annotsOf(await saveIncrementalMarkups(blueprint, [mk('l', 'length', [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }])]))).pop()!;
    const paper = calibrationFromMeasure(plain.lookup(PDFName.of('Measure'), PDFDict), 0)!;
    expect(paper.unit).toBe('mm');
    expect(paper.scale).toBeCloseTo(MM_PER_PT, 9);
  });

  it('mediciones de Acrobat/Revu se importan como Length, Polylength, Perimeter y Area con su valor', async () => {
    const bytes = await withForeignAnnots((doc) => [
      // Distancia de 100 pt con 0.5 ft por punto = 50 ft
      { Type: 'Annot', Subtype: 'Line', Rect: [100, 300, 200, 310], L: [100, 305, 200, 305], IT: 'LineDimension', Measure: rl(doc, 'ft', 0.5), Contents: PDFString.of("50'-0\"") },
      // Polilongitud abierta de 100 + 100 pt
      { Type: 'Annot', Subtype: 'PolyLine', Rect: [100, 100, 200, 200], Vertices: [100, 100, 200, 100, 200, 200], IT: 'PolyLineDimension', Measure: rl(doc, 'ft', 0.5) },
      // Perímetro: polilínea cerrada de un cuadrado de 100 pt
      { Type: 'Annot', Subtype: 'PolyLine', Rect: [300, 100, 400, 200], Vertices: [300, 100, 400, 100, 400, 200, 300, 200, 300, 100], IT: 'PolyLineDimension', Measure: rl(doc, 'ft', 0.5) },
      // Área de 100 x 100 pt = 50 x 50 ft
      { Type: 'Annot', Subtype: 'Polygon', Rect: [500, 100, 600, 200], Vertices: [500, 100, 600, 100, 600, 200, 500, 200], IT: 'PolygonDimension', Measure: rl(doc, 'ft', 0.5) },
      // Polígono sin intención de medida: sigue siendo un polígono
      { Type: 'Annot', Subtype: 'Polygon', Rect: [500, 300, 600, 400], Vertices: [500, 300, 600, 300, 600, 400] },
    ]);
    const { markups, foreignUnsupportedCount } = await importPdfAnnotations(bytes);
    expect(foreignUnsupportedCount).toBe(0);
    const ours = markups.slice(-5);
    expect(ours.map((m) => m.type)).toEqual(['length', 'polylineMeasure', 'perimeter', 'area', 'polygon']);
    const [len, poly, per, area, plain] = ours;
    expect(len.measurement!.unit).toBe('ft');
    expect(len.measurement!.value).toBeCloseTo(50, 6);
    expect(len.text).toBe("50'-0\"");
    expect(poly.measurement!.value).toBeCloseTo(100, 6);
    expect(per.points).toHaveLength(4); // sin el vértice de cierre repetido
    expect(per.measurement!.value).toBeCloseTo(200, 6);
    expect(area.measurement!.value).toBeCloseTo(2500, 6);
    expect(area.measurement!.perimeter).toBeCloseTo(200, 6);
    expect(plain.measurement).toBeUndefined();
  });

  it('sin /Measure propio, una medición ajena usa la escala de la página', async () => {
    const bytes = await withForeignAnnots(() => [
      { Type: 'Annot', Subtype: 'Polygon', Rect: [100, 100, 200, 200], Vertices: [100, 100, 200, 100, 200, 200, 100, 200], IT: 'PolygonDimension' },
    ]);
    const doc = await PDFDocument.load(bytes);
    doc.getPages()[0].node.set(
      PDFName.of('VP'),
      doc.context.obj([{ Type: 'Viewport', BBox: [0, 0, 800, 600], Measure: rl(doc, 'm', 0.01) }] as never)
    );
    const [area] = (await importPdfAnnotations(await doc.save())).markups.slice(-1);
    expect(area.type).toBe('area');
    expect(area.measurement!.unit).toBe('m');
    expect(area.measurement!.value).toBeCloseTo(1, 6);
  });

  it('ida y vuelta: perímetro y área rectangular vuelven exactos; si otro programa mueve una medición, se recalcula', async () => {
    const rect = mk('area-r', 'area', [{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.8 }], {
      measurement: { value: 1, unit: 'mm', formatted: 'x' },
    });
    const per = mk('per', 'perimeter', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }], {
      measurement: { value: 2, unit: 'mm', formatted: 'y' },
    });
    const len = mk('len', 'length', [{ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.5 }], {
      measurement: { value: 3, unit: 'mm', formatted: 'z' },
    });
    const saved = await saveIncrementalMarkups(blueprint, [rect, per, len]);
    const back = (await importPdfAnnotations(saved)).markups;
    const byId = (id: string) => back.find((m) => m.id === id)!;
    expect(byId('area-r').points).toEqual(rect.points);
    expect(byId('area-r').measurement!.formatted).toBe('x');
    expect(byId('per').points).toEqual(per.points);
    expect(byId('per').measurement!.formatted).toBe('y');

    // Otro programa alarga la longitud: nueva /L y nueva /Rect (sin tocar /REA)
    const doc = await PDFDocument.load(saved);
    const lenDict = (await (async () => {
      const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
      return annots
        .asArray()
        .map((r) => doc.context.lookup(r, PDFDict))
        .find((d) => nameOf(d, 'IT') === '/LineDimension')!;
    })());
    lenDict.set(PDFName.of('L'), doc.context.obj([80, 300, 380, 300]));
    lenDict.set(PDFName.of('Rect'), doc.context.obj([78, 298, 382, 302]));
    const moved = (await importPdfAnnotations(await doc.save())).markups.find((m) => m.id === 'len')!;
    expect(moved.type).toBe('length');
    expect(moved.measurement!.value).toBeCloseTo(300 * MM_PER_PT, 6);
    expect(lenDict.lookup(PDFName.of('L'), PDFArray).lookup(2, PDFNumber).asNumber()).toBe(380);
  });
});
