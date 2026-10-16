import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from 'pdf-lib';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { Markup, MarkupType, PageCalibration } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const mk = (id: string, type: MarkupType, points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '2026-10-15T12:00:00Z',
  updatedAt: '2026-10-15T12:00:00Z',
  status: 'pending',
  measurement: { value: 1, unit: 'ft', formatted: '1 ft' },
  ...extra,
});

/** Diccionario de cada anotación escrita, por su /NM. */
async function annotsByName(bytes: Uint8Array): Promise<Record<string, PDFDict>> {
  const doc = await PDFDocument.load(bytes);
  const out: Record<string, PDFDict> = {};
  for (const ref of doc.getPages()[0].node.Annots()!.asArray()) {
    const d = doc.context.lookup(ref as PDFRef, PDFDict);
    const nm = d.get(PDFName.of('NM'));
    if (nm instanceof PDFString) out[nm.decodeText()] = d;
  }
  return out;
}

describe('Mediciones de Revu: volumen, ángulo, conteo, radio y diámetro (ADR-0051)', () => {
  it('se escriben con la intención y el tipo de medición de Revu, y el volumen con su profundidad', async () => {
    const cal: PageCalibration = { scale: 0.05, unit: 'ft', precision: 2 };
    const saved = await saveIncrementalMarkups(
      blueprint,
      [
        mk('vol', 'volume', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }], { customFields: { volumeDepth: 2 } }),
        mk('ang', 'angle', [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.3 }, { x: 0.7, y: 0.3 }]),
        mk('cnt', 'count', [{ x: 0.6, y: 0.6 }]),
        mk('dia', 'diameter', [{ x: 0.1, y: 0.7 }, { x: 0.3, y: 0.7 }]),
      ],
      {},
      { calibrations: { 0: cal } }
    );
    const a = await annotsByName(saved);
    const get = (id: string, key: string) => a[id].get(PDFName.of(key))?.toString();
    expect(get('vol', 'IT')).toBe('/PolygonVolume');
    expect(get('vol', 'MeasurementTypes')).toBe('132');
    expect(get('vol', 'Depth')).toBe('2');
    expect(get('vol', 'DepthUnit')).toBe('[ (ft) ]');
    expect(get('ang', 'IT')).toBe('/PolyLineAngle');
    expect(get('ang', 'MeasurementTypes')).toBe('1152');
    expect(get('cnt', 'IT')).toBe('/PolygonCount');
    expect(get('cnt', 'MeasurementTypes')).toBe('128');
    expect(get('dia', 'MeasurementTypes')).toBe('384');
    // Todas con su escala
    for (const id of ['vol', 'ang', 'cnt', 'dia']) expect(a[id].get(PDFName.of('Measure'))).toBeDefined();
  });

  it('al abrir un PDF de Revu, sus mediciones de volumen, ángulo, conteo, radio y diámetro vuelven como mediciones de REA', async () => {
    const doc = await PDFDocument.load(blueprint);
    const ctx = doc.context;
    const annot = (o: Record<string, unknown>) => ctx.register(ctx.obj(o as never));
    const annots = [
      // Volumen 100×100 pt con profundidad 3
      annot({ Type: 'Annot', Subtype: 'Polygon', IT: PDFName.of('PolygonVolume'), NM: PDFString.of('rv-vol'), Rect: [100, 100, 200, 200], Vertices: [100, 100, 200, 100, 200, 200, 100, 200], Depth: 3 }),
      // Ángulo recto en (300, 300)
      annot({ Type: 'Annot', Subtype: 'PolyLine', IT: PDFName.of('PolyLineAngle'), NM: PDFString.of('rv-ang'), Rect: [300, 300, 400, 400], Vertices: [300, 400, 300, 300, 400, 300] }),
      annot({ Type: 'Annot', Subtype: 'Circle', IT: PDFName.of('PolygonCount'), NM: PDFString.of('rv-cnt'), Rect: [500, 500, 510, 510] }),
      annot({ Type: 'Annot', Subtype: 'Circle', IT: PDFName.of('PolygonRadius'), NM: PDFString.of('rv-rad'), Rect: [600, 100, 700, 200] }),
      annot({ Type: 'Annot', Subtype: 'Circle', IT: PDFName.of('PolygonRadius'), MeasurementTypes: 384, NM: PDFString.of('rv-dia'), Rect: [600, 100, 700, 200] }),
    ];
    doc.getPages()[0].node.set(PDFName.of('Annots'), ctx.obj(annots));
    const back = (await importPdfAnnotations(await doc.save({ useObjectStreams: false }))).markups;
    const by = (id: string) => back.find((m) => m.id === id)!;
    expect(by('rv-vol').type).toBe('volume');
    expect(by('rv-vol').customFields?.volumeDepth).toBe(3);
    expect(by('rv-vol').measurement!.formatted).toMatch(/³$/);
    expect(by('rv-ang').type).toBe('angle');
    expect(by('rv-ang').measurement!.formatted).toBe('90.0°');
    expect(by('rv-cnt').type).toBe('count');
    expect(by('rv-cnt').points).toHaveLength(1);
    expect(by('rv-rad').type).toBe('radius');
    expect(by('rv-rad').measurement!.value).toBeGreaterThan(0);
    expect(by('rv-dia').type).toBe('diameter');
    expect(by('rv-dia').measurement!.value).toBeCloseTo(by('rv-rad').measurement!.value * 2, 3);
  });

  it('callout /FreeTextCallout y sellos /Stamp de Revu/Acrobat se importan con su directriz, caja /RD y nombre de sello (ADR-0053)', async () => {
    const doc = await PDFDocument.load(blueprint);
    const ctx = doc.context;
    const annot = (o: Record<string, unknown>) => ctx.register(ctx.obj(o as never));
    const annots = [
      annot({
        Type: 'Annot',
        Subtype: 'FreeText',
        IT: PDFName.of('FreeTextCallout'),
        NM: PDFString.of('rv-callout'),
        Rect: [100, 100, 300, 240],
        RD: [80, 60, 0, 0],
        CL: [100, 100, 160, 200, 180, 200],
        LE: PDFName.of('OpenArrow'),
        Contents: PDFString.of('Verify beam'),
      }),
      annot({
        Type: 'Annot',
        Subtype: 'Stamp',
        Name: PDFName.of('Draft'),
        NM: PDFString.of('rv-stamp'),
        Rect: [350, 150, 470, 195],
        T: PDFString.of('Marta'),
      }),
    ];
    doc.getPages()[0].node.set(PDFName.of('Annots'), ctx.obj(annots));
    const res = await importPdfAnnotations(await doc.save({ useObjectStreams: false }));
    expect(res.foreignUnsupportedCount).toBe(0);
    const co = res.markups.find((m) => m.id === 'rv-callout')!;
    expect(co.type).toBe('callout');
    expect(co.text).toBe('Verify beam');
    expect(co.style.lineEndingStart).toBe('openArrow');
    expect(co.leaders?.[0]).toHaveLength(2);
    // La caja de texto tomó Rect menos RD (empieza en x=180, no en x=100)
    expect(co.points[0].x).toBeGreaterThan(co.leaders![0][0].x);
    const st = res.markups.find((m) => m.id === 'rv-stamp')!;
    expect(st.type).toBe('stamp');
    expect(st.author).toBe('Marta');
    expect(String(st.customFields?.stampId)).toMatch(/draft/);
  });
});
