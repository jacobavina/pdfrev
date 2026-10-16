import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from 'pdf-lib';
import { COUNT_SYMBOLS, countItems, countMeasurement, countSymbolsPath, countSymbolSizePt, clampCountScale } from './countSymbols';
import { emitMarkupOperators } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { computeMeasureTotals } from '../measurements/totals';
import { Markup } from '../../types/markup';

const count = (points: { x: number; y: number }[], customFields: Record<string, string | number> = { countSymbol: 'check', countScale: 100 }): Markup => ({
  id: 'cnt',
  type: 'count',
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '2026-10-16T12:00:00Z',
  updatedAt: '2026-10-16T12:00:00Z',
  status: 'pending',
  measurement: countMeasurement(points.length),
  customFields,
});

const three = [
  { x: 0.2, y: 0.2 },
  { x: 0.4, y: 0.25 },
  { x: 0.6, y: 0.3 },
];

describe('Count de Revu: símbolos, escala y total por marca (ADR-0059)', () => {
  it('el conteo de Revu suma sus clics, dibuja el mismo símbolo en cada uno y escala su tamaño', () => {
    expect(COUNT_SYMBOLS.map((s) => s.label)).toEqual(['Check', 'Triangle', 'Square', 'Circle', 'Diamond']);
    const m = count(three);
    expect(countItems(m)).toBe(3);
    // Un conteo numerado anterior (sin símbolo) cuenta uno por marca
    expect(countItems({ ...m, customFields: undefined })).toBe(1);
    for (const { id } of COUNT_SYMBOLS) {
      const sym = countSymbolsPath(id, [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], 18);
      expect(sym.d.match(/M /g)).toHaveLength(3);
      expect(sym.width).toBeGreaterThan(0);
    }
    expect(countSymbolSizePt(m)).toBe(18);
    expect(countSymbolSizePt(count(three, { countSymbol: 'square', countScale: 200 }))).toBe(36);
    expect(clampCountScale(5)).toBe(10);
    expect(clampCountScale('abc')).toBe(100);
    expect(countMeasurement(3).formatted).toBe('Count = 3');
    // Los totales de takeoff suman los clics de cada conteo
    const totals = computeMeasureTotals([m, count([{ x: 0.1, y: 0.1 }])]);
    expect(totals.find((t) => t.category === 'count')!.total).toBe(4);
  });

  it('el /AP dibuja un símbolo por clic y el PDF guarda el conteo como polígono /PolygonCount con un vértice por clic', async () => {
    const m = count(three, { countSymbol: 'diamond', countScale: 150 });
    const ap = emitMarkupOperators(m, { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 });
    expect(ap.operators.split('\n').filter((l) => l.endsWith(' m'))).toHaveLength(3);
    expect(ap.operators).toContain('S');

    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
    const saved = await saveIncrementalMarkups(blueprint, [m]);
    const doc = await PDFDocument.load(saved);
    const annot = doc
      .getPages()[0]
      .node.Annots()!
      .asArray()
      .map((r) => doc.context.lookup(r as PDFRef, PDFDict))
      .find((d) => (d.get(PDFName.of('NM')) as PDFString | undefined)?.decodeText() === 'cnt')!;
    expect(annot.get(PDFName.of('Subtype'))?.toString()).toBe('/Polygon');
    expect(annot.get(PDFName.of('IT'))?.toString()).toBe('/PolygonCount');
    expect(annot.lookup(PDFName.of('Vertices'))!.toString().trim().split(/\s+/).length).toBe(3 * 2 + 2);

    const back = (await importPdfAnnotations(saved)).markups.find((x) => x.id === 'cnt')!;
    expect(back.points).toHaveLength(3);
    expect(back.customFields).toMatchObject({ countSymbol: 'diamond', countScale: 150 });
  });
});
