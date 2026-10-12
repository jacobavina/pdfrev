import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFNumber, PDFString } from 'pdf-lib';
import { emitMarkupOperators, PageTransformInfo, toWinAnsiPdfLiteral } from './operators';
import { saveIncrementalMarkups, dimensionLineEntries } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { exportMarkupsToPdf } from '../../services/pdfExportService';
import { Markup, MarkupType } from '../../types/markup';

const transform: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const mk = (id: string, type: MarkupType, points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#0284c7', strokeWidth: 1, opacity: 1, lineEndingStart: 'slash', lineEndingEnd: 'slash' },
  author: 'Revisor',
  createdAt: '2026-10-11T12:00:00Z',
  updatedAt: '2026-10-11T12:00:00Z',
  status: 'pending',
  ...extra,
});

// Cota horizontal de 320 pt con la línea de cota 15 pt por encima (en pantalla)
const dim = mk('cota-1', 'dimension', [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.3, y: 0.475 }], {
  text: "12'-6\" típ.",
});

describe('Cota en el PDF (ADR-0020)', () => {
  it('la apariencia /AP lleva líneas de referencia, línea de cota, extremos y el texto con fuente', () => {
    const out = emitMarkupOperators(dim, transform);
    expect(out.fontName).toBe('Helv');
    expect(out.operators).toContain('/Helv 10.00 Tf');
    expect(out.operators).toContain(`${toWinAnsiPdfLiteral("12'-6\" típ.")} Tj`);
    // 2 referencias + línea de cota + 2 barras = 5 trazos
    expect(out.operators.split('\n').filter((l) => l === 'S').length).toBe(5);
  });

  it('/Line con /LL (desfase con signo), /LLE, /LLO, /Cap y /IT /LineDimension', () => {
    // Por encima de la línea en pantalla = sentido antihorario recorriendo /L → /LL negativo
    expect(dimensionLineEntries(dim, transform)).toBe('/LL -15.00 /LLE 4 /LLO 2 /Cap true /CP /Top /IT /LineDimension');
  });

  it('WinAnsi: acentos en octal, paréntesis escapados y comillas tipográficas', () => {
    expect(toWinAnsiPdfLiteral('Á (ñ) “x”')).toBe('(\\301 \\(\\361\\) \\223x\\224)');
  });

  it('ida y vuelta: la cota vuelve como cota con sus 3 puntos, texto y extremos', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [dim]);
    const doc = await PDFDocument.load(saved);
    const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    const dicts = annots.asArray().map((r) => doc.context.lookup(r, PDFDict));
    const line = dicts.find((d) => d.get(PDFName.of('Subtype'))?.toString() === '/Line')!;
    expect(line.lookup(PDFName.of('LL'), PDFNumber).asNumber()).toBeCloseTo(-15);
    expect(line.get(PDFName.of('IT'))?.toString()).toBe('/LineDimension');

    const back = (await importPdfAnnotations(saved)).markups.find((m) => m.id === 'cota-1')!;
    expect(back.type).toBe('dimension');
    expect(back.text).toBe("12'-6\" típ.");
    expect(back.points).toHaveLength(3);
    expect(back.points[2].y).toBeCloseTo(0.475, 5);
    expect(back.style.lineEndingEnd).toBe('slash');
  });

  it('una /Line ajena con /LL (cota de Revu/Acrobat) se importa como cota', async () => {
    const doc = await PDFDocument.load(blueprint);
    const page = doc.getPages()[0];
    const annot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Line',
      Rect: [100, 280, 420, 320],
      L: [100, 300, 420, 300],
      LL: 20,
      IT: 'LineDimension',
      Contents: PDFString.of('3.20 m'),
    });
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));
    const back = (await importPdfAnnotations(await doc.save())).markups[0];
    expect(back.type).toBe('dimension');
    expect(back.text).toBe('3.20 m');
    // /LL positivo = sentido horario recorriendo /L = por debajo (y del PDF menor → y normalizada mayor)
    expect(back.points[2].y).toBeGreaterThan(back.points[0].y);
  });
});

describe('Ida y vuelta sin pérdidas de las marcas de REA (ADR-0020)', () => {
  it('longitud, conteo y polilongitud conservan su tipo; capa, grupo, opacidad y directrices se restauran', async () => {
    const markups: Markup[] = [
      mk('len-1', 'length', [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }], {
        measurement: { value: 105.83, unit: 'mm', formatted: '105.8 mm' },
        layer: 'Instalaciones',
      }),
      mk('cnt-1', 'count', [{ x: 0.7, y: 0.2 }], { measurement: { value: 1, unit: 'mm', formatted: '1', countIndex: 1 } }),
      mk('pl-1', 'polylineMeasure', [{ x: 0.1, y: 0.8 }, { x: 0.2, y: 0.9 }, { x: 0.3, y: 0.8 }]),
      mk('call-1', 'callout', [{ x: 0.6, y: 0.6 }, { x: 0.75, y: 0.65 }], {
        text: 'Revisar',
        leaders: [[{ x: 0.5, y: 0.75 }]],
        groupId: 'grupo-1',
        style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 0.5 },
      }),
    ];
    const back = (await importPdfAnnotations(await saveIncrementalMarkups(blueprint, markups))).markups;
    const byId = (id: string) => back.find((m) => m.id === id)!;
    expect(byId('len-1').type).toBe('length');
    expect(byId('len-1').layer).toBe('Instalaciones');
    expect(byId('cnt-1').type).toBe('count');
    expect(byId('cnt-1').points).toEqual([{ x: 0.7, y: 0.2 }]);
    expect(byId('pl-1').type).toBe('polylineMeasure');
    expect(byId('call-1').leaders).toEqual([[{ x: 0.5, y: 0.75 }]]);
    expect(byId('call-1').groupId).toBe('grupo-1');
    expect(byId('call-1').style.opacity).toBeCloseTo(0.5);
    expect(byId('call-1').points).toEqual([{ x: 0.6, y: 0.6 }, { x: 0.75, y: 0.65 }]);
  });
});

describe('Nubes y textos visibles en Revu/Acrobat (ADR-0020/0021)', () => {
  it('la nube tiene festón en su /AP y cuatro /Vertices con borde nuboso', async () => {
    const cloud = mk('nube-1', 'cloud', [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.4 }], { customFields: { arcStep: 20 } });
    const ops = emitMarkupOperators(cloud, transform).operators;
    expect(ops.split('\n').filter((l) => l.endsWith(' c')).length).toBeGreaterThan(30);
    expect(ops).toContain('\nh\n');

    const saved = await saveIncrementalMarkups(blueprint, [cloud]);
    const doc = await PDFDocument.load(saved);
    const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    const poly = annots
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .find((d) => d.get(PDFName.of('Subtype'))?.toString() === '/Polygon')!;
    expect(poly.lookup(PDFName.of('Vertices'), PDFArray).size()).toBe(8);
    expect(poly.lookup(PDFName.of('BE'), PDFDict).get(PDFName.of('S'))?.toString()).toBe('/C');
  });

  it('el cuadro de texto y la llamada dibujan su texto en el /AP (antes salían vacíos)', () => {
    const text = mk('txt-1', 'text', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.15 }], { text: 'Ver detalle 4' });
    const callout = mk('call-2', 'callout', [{ x: 0.6, y: 0.6 }, { x: 0.75, y: 0.65 }], {
      text: 'Revisar anclaje',
      leaders: [[{ x: 0.5, y: 0.75 }]],
    });
    expect(emitMarkupOperators(text, transform).operators).toContain('(Ver detalle 4) Tj');
    const c = emitMarkupOperators(callout, transform);
    expect(c.operators).toContain('(Revisar anclaje) Tj');
    expect(c.fontName).toBe('Helv');
  });

  it('el aplanado incluye la cota con su texto', async () => {
    const { pdfBytes } = await exportMarkupsToPdf(blueprint, [dim]);
    const doc = await PDFDocument.load(pdfBytes);
    const xobjects = doc.getPages()[0].node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    const forms = xobjects.keys().map((k) => xobjects.lookup(k)) as unknown as { dict: PDFDict }[];
    const withFont = forms.filter((f) => {
      const res = f.dict?.lookup(PDFName.of('Resources'));
      return res instanceof PDFDict && res.get(PDFName.of('Font')) !== undefined;
    });
    expect(withFont.length).toBe(1);
  });
});
