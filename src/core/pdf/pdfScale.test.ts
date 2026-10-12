import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfCalibrations } from './pdfScale';
import { buildCalibration } from '../measurements/scale';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

describe('Escala de página en el PDF (/VP /Measure, ADR-0025)', () => {
  it('ida y vuelta: la escala de REA (pies-pulgadas, preset) se guarda en el PDF y se recupera al abrir', async () => {
    const cal = buildCalibration({
      paperValue: 0.25,
      paperUnit: 'in',
      realValue: 1,
      realUnit: 'ftin',
      display: 'ftin',
      precision: 'f16',
      presetId: 'a-1/4',
    })!;
    const saved = await saveIncrementalMarkups(blueprint, [], {}, { calibrations: { 1: cal } });
    // Prefijo intacto (guardado incremental) y viewport estándar legible por otros programas
    expect(Buffer.from(saved.slice(0, blueprint.length)).equals(Buffer.from(blueprint))).toBe(true);
    const text = new TextDecoder('latin1').decode(saved.slice(blueprint.length));
    expect(text).toContain('/Type /Viewport');
    expect(text).toContain('/Subtype /RL');
    const back = await importPdfCalibrations(saved);
    expect(Object.keys(back)).toEqual(['1']);
    expect(back[1]).toEqual(cal);
  });

  it('lee la escala que dejó otro programa (Revu/Acrobat) en /Measure: pies con pulgadas', async () => {
    const doc = await PDFDocument.load(blueprint);
    const ctx = doc.context;
    const measure = ctx.obj({
      Type: 'Measure',
      Subtype: 'RL',
      R: PDFString.of('1/8 in = 1 ft'),
      X: [
        { Type: 'NumberFormat', U: PDFString.of('ft'), C: 0.111111, D: 1 },
        { Type: 'NumberFormat', U: PDFString.of('in'), C: 12, D: 16, F: 'F' },
      ],
    });
    doc.getPages()[0].node.set(PDFName.of('VP'), ctx.obj([{ Type: 'Viewport', BBox: [0, 0, 800, 600], Measure: measure }]));
    const back = await importPdfCalibrations(await doc.save());
    expect(back[0].unit).toBe('ft');
    expect(back[0].scale).toBeCloseTo(0.111111, 6);
    expect(back[0].format).toBe('ftin');
    expect(back[1]).toBeUndefined();
  });
});
