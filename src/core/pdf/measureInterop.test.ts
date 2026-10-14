import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { emitMarkupOperators, PageTransformInfo } from './operators';
import { saveIncrementalMarkups } from './incrementalWriter';
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
  style: { strokeColor: '#7c3aed', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-12T12:00:00Z',
  updatedAt: '2026-10-12T12:00:00Z',
  status: 'pending',
  ...extra,
});

const quad = [
  { x: 0.1, y: 0.1 },
  { x: 0.3, y: 0.1 },
  { x: 0.3, y: 0.3 },
  { x: 0.1, y: 0.3 },
];
const markups: Markup[] = [
  mk('per-1', 'perimeter', quad, { measurement: { value: 225.78, unit: 'mm', formatted: '225.8 mm' } }),
  mk('vol-1', 'volume', quad.map((p) => ({ x: p.x + 0.4, y: p.y })), {
    measurement: { value: 6370.4, unit: 'mm', formatted: '6370.4 mm³' },
    customFields: { volumeDepth: 2 },
  }),
  mk('ang-1', 'angle', [{ x: 0.6, y: 0.6 }, { x: 0.5, y: 0.6 }, { x: 0.5, y: 0.5 }], {
    measurement: { value: 90, unit: 'mm', formatted: '90.0°' },
  }),
  mk('rad-1', 'radius', [{ x: 0.2, y: 0.7 }, { x: 0.25, y: 0.7 }], { measurement: { value: 14.1, unit: 'mm', formatted: '14.1 mm' } }),
  mk('dia-1', 'diameter', [{ x: 0.7, y: 0.7 }, { x: 0.8, y: 0.7 }], { measurement: { value: 28.2, unit: 'mm', formatted: '28.2 mm' } }),
];

describe('Mediciones adicionales en el PDF (ADR-0029)', () => {
  it('subtipos estándar: perímetro /PolyLine cerrada (ADR-0030), volumen /Polygon, ángulo /PolyLine, radio y diámetro /Circle', async () => {
    const saved = await saveIncrementalMarkups(blueprint, markups);
    const doc = await PDFDocument.load(saved);
    const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    const subtypes = annots
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .filter((d) => d.get(PDFName.of('Subtype'))?.toString() !== '/Popup')
      .map((d) => d.get(PDFName.of('Subtype'))?.toString());
    expect(subtypes).toEqual(['/PolyLine', '/Polygon', '/PolyLine', '/Circle', '/Circle']);
  });

  it('ida y vuelta: tipo, vértices exactos, medida y profundidad del volumen', async () => {
    const back = (await importPdfAnnotations(await saveIncrementalMarkups(blueprint, markups))).markups;
    for (const original of markups) {
      const m = back.find((x) => x.id === original.id)!;
      expect(m.type).toBe(original.type);
      expect(m.points).toEqual(original.points);
      expect(m.measurement?.formatted).toBe(original.measurement?.formatted);
    }
    expect(Number(back.find((x) => x.id === 'vol-1')!.customFields?.volumeDepth)).toBe(2);
  });

  it('un lector externo (PDF.js) ve las cinco con su apariencia propia y los vértices del contorno', async () => {
    const saved = await saveIncrementalMarkups(blueprint, markups);
    const pdf = await pdfjs.getDocument({ data: saved, disableFontFace: true }).promise;
    const annots = (await (await pdf.getPage(1)).getAnnotations()) as {
      subtype: string;
      hasAppearance?: boolean;
      vertices?: ArrayLike<number>;
      contentsObj?: { str: string };
    }[];
    const ours = annots.filter((a) => ['Polygon', 'PolyLine', 'Circle'].includes(a.subtype)).slice(-5);
    expect(ours.map((a) => a.subtype)).toEqual(['PolyLine', 'Polygon', 'PolyLine', 'Circle', 'Circle']);
    expect(ours.every((a) => a.hasAppearance)).toBe(true);
    // PDF.js entrega los vértices planos (x, y, x, y…): 4 del perímetro más el de cierre, y 3 del ángulo
    expect(ours[0].vertices).toHaveLength(10);
    expect(Array.from(ours[0].vertices!).slice(0, 4)).toEqual([80, 540, 240, 540]);
    expect(Array.from(ours[0].vertices!).slice(8)).toEqual([80, 540]);
    expect(ours[2].vertices).toHaveLength(6);
    await pdf.destroy();
  });

  it('/AP: volumen con relleno translúcido, ángulo con arco y radio con círculo y centro', () => {
    const vol = emitMarkupOperators(markups[1], transform);
    expect(vol.operators).toContain('0.486 0.227 0.929 rg');
    expect(vol.operators).toContain('/GS_HL gs');
    expect(vol.extGState?.ca).toBeCloseTo(0.15);

    const per = emitMarkupOperators(markups[0], transform).operators.split('\n');
    // Solo contorno (h y después S), seguido del texto del valor (ADR-0032)
    expect(per[per.indexOf('h') + 1]).toBe('S');
    expect(per.some((l) => l.endsWith(' Tj'))).toBe(true);

    const ang = emitMarkupOperators(markups[2], transform).operators.split('\n');
    // Dos lados (3 vértices) + arco de 17 puntos
    expect(ang.filter((l) => l.endsWith(' l')).length).toBe(2 + 16);

    const rad = emitMarkupOperators(markups[3], transform);
    // Círculo de radio 40 pt centrado en (160, 180) en coordenadas PDF: 4 curvas + 4 del punto central
    expect(rad.operators.split('\n').filter((l) => l.endsWith(' c')).length).toBe(8);
    expect(rad.operators).toContain('200.00 180.00 m');
    expect(rad.bbox[0]).toBeLessThanOrEqual(120);
    expect(rad.bbox[2]).toBeGreaterThanOrEqual(200);
  });

  it('el aplanado dibuja las cinco mediciones con su valor', async () => {
    const formsOf = async (ms: Markup[]) => {
      const doc = await PDFDocument.load((await exportMarkupsToPdf(blueprint, ms)).pdfBytes);
      const xobjects = doc.getPages()[0].node.Resources()!.lookup(PDFName.of('XObject'));
      return xobjects instanceof PDFDict ? xobjects.keys().length : 0;
    };
    // Un Form XObject por medición (mismo dibujo que su /AP)
    expect((await formsOf(markups)) - (await formsOf([]))).toBe(5);
  });
});
