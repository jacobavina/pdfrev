import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFNumber, PDFString } from 'pdf-lib';
import { distanceGeometry, MEASURE_LEADER_EXTENSION_PT } from './measureCaption';
import { getMarkupSvgDescriptor, SvgRenderDescriptor } from './render';
import { emitMarkupOperators, PageTransformInfo } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { groupThousands, formatWithCalibration, formatFeetInches } from '../measurements/scale';
import { calculateVolume } from '../measurements/calculate';
import { hitTestMarkup } from '../../utils/coordinates';
import { Markup, ViewportTransform } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
const pdfT: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
const screen: ViewportTransform = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
const flatten = (d: SvgRenderDescriptor): SvgRenderDescriptor[] => [d, ...(d.children ?? []).flatMap(flatten)];

// Distancia horizontal de 300 pt medida en y = 300, con la línea de medida 50 pt por encima (como la captura)
const withLeaders: Markup = {
  id: 'dist-l',
  type: 'length',
  pageIndex: 0,
  points: [
    { x: 100 / 800, y: 0.5 },
    { x: 400 / 800, y: 0.5 },
    { x: 250 / 800, y: 250 / 600 },
  ],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1, dashArray: [4, 2] },
  author: 'Reviewer',
  createdAt: '2026-10-14T12:00:00Z',
  updatedAt: '2026-10-14T12:00:00Z',
  status: 'pending',
  measurement: { value: 1551.89, unit: 'ft', formatted: '1,551.89 ft' },
};

describe('Distancia de Acrobat con líneas de referencia (ADR-0033)', () => {
  it('geometría: la línea de medida se desplaza y las referencias van del punto medido y sobresalen', () => {
    const g = distanceGeometry(
      [
        { x: 100, y: 300 },
        { x: 400, y: 300 },
        { x: 250, y: 250 },
      ],
      MEASURE_LEADER_EXTENSION_PT
    )!;
    expect(g.a).toEqual({ x: 100, y: 250 });
    expect(g.b).toEqual({ x: 400, y: 250 });
    expect(g.leaders).toHaveLength(2);
    expect(g.leaders[0][0]).toEqual({ x: 100, y: 300 }); // desde el punto medido (sin separación)
    expect(g.leaders[0][1].y).toBeCloseTo(250 - MEASURE_LEADER_EXTENSION_PT, 9); // sobresale por encima
    // Sin tercer punto, de punto a punto y sin referencias
    expect(distanceGeometry([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)!.leaders).toHaveLength(0);
  });

  it('pantalla y /AP: referencias continuas aunque la medida sea discontinua, flechas cerradas en la línea desplazada', () => {
    const nodes = flatten(getMarkupSvgDescriptor(withLeaders, screen));
    const leaders = nodes.filter((n) => n.attrs['data-testid'] === 'distance-leader');
    expect(leaders).toHaveLength(2);
    expect(leaders.every((n) => n.attrs.strokeDasharray === undefined)).toBe(true);
    expect(nodes.filter((n) => n.tag === 'polygon')).toHaveLength(2);
    const text = nodes.find((n) => n.tag === 'text')!;
    expect(text.textNode).toBe('1,551.89 ft');
    expect(text.attrs.y as number).toBeLessThan(260); // sobre la línea desplazada (y = 250), no en y = 300

    const ops = emitMarkupOperators(withLeaders, pdfT).operators;
    expect(ops).toContain('[] 0 d'); // referencias continuas
    expect(ops).toContain('100.00 300.00 m'); // referencia desde el punto medido (y PDF = 600 − 300)
    expect(ops).toContain('(1,551.89 ft) Tj');
  });

  it('el PDF lleva /LL, /LLE y /LLO de Acrobat sin repetir /IT ni /Cap; vuelve con su tercer punto', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [withLeaders]);
    const doc = await PDFDocument.load(saved);
    const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    const line = annots
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .find((d) => d.get(PDFName.of('IT'))?.toString() === '/LineDimension')!;
    // Línea de medida 50 pt por encima en pantalla = sentido antihorario recorriendo /L → /LL negativo
    expect(line.lookup(PDFName.of('LL'), PDFNumber).asNumber()).toBeCloseTo(-50, 6);
    expect(line.lookup(PDFName.of('LLE'), PDFNumber).asNumber()).toBe(MEASURE_LEADER_EXTENSION_PT);
    expect(line.lookup(PDFName.of('LLO'), PDFNumber).asNumber()).toBe(0);
    const raw = new TextDecoder('latin1').decode(saved);
    expect((raw.match(/\/IT \/LineDimension/g) ?? []).length).toBe(1);

    const back = (await importPdfAnnotations(saved)).markups.find((m) => m.id === 'dist-l')!;
    expect(back.type).toBe('length');
    expect(back.points).toHaveLength(3);
  });

  it('una distancia de Acrobat con /LL se importa como Length con su línea desplazada, no como cota', async () => {
    const doc = await PDFDocument.load(blueprint);
    const measure = doc.context.obj({ Type: 'Measure', Subtype: 'RL', X: [{ U: PDFString.of('ft'), C: 5 }] } as never);
    const annot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Line',
      Rect: [90, 290, 410, 360],
      L: [100, 300, 400, 300],
      LL: 50,
      LLE: 8,
      IT: 'LineDimension',
      Measure: measure,
      Contents: PDFString.of('1,500.00'),
    } as never);
    doc.getPages()[0].node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));
    const [m] = (await importPdfAnnotations(await doc.save())).markups.slice(-1);
    expect(m.type).toBe('length');
    expect(m.points).toHaveLength(3);
    expect(m.measurement!.value).toBeCloseTo(1500, 6);
    expect(m.measurement!.formatted).toBe('1,500.00 ft');
  });

  it('se selecciona haciendo clic en la línea desplazada', () => {
    expect(hitTestMarkup({ x: 250 / 800, y: 250 / 600 }, withLeaders, 0.01, { width: 800, height: 600 })).toBe(true);
  });
});

describe('Números con separador de miles, como Acrobat (ADR-0033)', () => {
  it('agrupa los miles en longitudes, áreas, volúmenes y pies-pulgadas', () => {
    expect(groupThousands('1551.89')).toBe('1,551.89');
    expect(groupThousands('1234567')).toBe('1,234,567');
    expect(groupThousands('-1000.5')).toBe('-1,000.5');
    expect(groupThousands('999.99')).toBe('999.99');
    expect(formatWithCalibration(1551.894, { scale: 1, unit: 'ft', precision: 2 })).toBe('1,551.89 ft');
    expect(formatWithCalibration(12345.6, { scale: 1, unit: 'm', precision: 1 }, true)).toBe('12,345.6 m²');
    expect(formatFeetInches(1234.5)).toBe(`1,234'-6"`);
    const vol = calculateVolume(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      { width: 100, height: 100 },
      { scale: 1, unit: 'm', precision: 0 },
      1
    );
    expect(vol.formatted).toBe('10,000 m³');
  });
});
