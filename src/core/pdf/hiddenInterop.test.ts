import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFNumber } from 'pdf-lib';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { exportMarkupsToPdf } from '../../services/pdfExportService';
import type { Markup } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const rect = (id: string, extra: Partial<Markup> = {}): Markup => ({
  id,
  type: 'rectangle',
  pageIndex: 0,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
  style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-22T12:00:00Z',
  updatedAt: '2026-10-22T12:00:00Z',
  status: 'pending',
  ...extra,
});

describe('Marcas ocultas (Hide) y el bit Hidden de /F (ADR-0109)', () => {
  it('una marca oculta se guarda con el bit Hidden (2) sumado a Print (4) y vuelve oculta al abrir', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [rect('visible'), rect('oculta', { hidden: true }), rect('oculta-y-bloqueada', { hidden: true, locked: true })]);
    const doc = await PDFDocument.load(saved);
    const flags = doc
      .getPages()[0]
      .node.lookup(PDFName.of('Annots'), PDFArray)
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .filter((d) => d.get(PDFName.of('Subtype'))?.toString() === '/Square')
      .map((d) => (d.get(PDFName.of('F')) as PDFNumber).asNumber());
    expect(flags).toEqual([4, 6, 134]);
    const back = (await importPdfAnnotations(saved)).markups;
    expect(back.find((m) => m.id === 'visible')!.hidden).toBeUndefined();
    expect(back.find((m) => m.id === 'oculta')!.hidden).toBe(true);
    const both = back.find((m) => m.id === 'oculta-y-bloqueada')!;
    expect(both.hidden).toBe(true);
    expect(both.locked).toBe(true);
  });

  it('una marca oculta no se aplana en el PDF final', async () => {
    const none = (await exportMarkupsToPdf(blueprint, [])).pdfBytes.length;
    const shown = (await exportMarkupsToPdf(blueprint, [rect('v')])).pdfBytes.length;
    const hidden = (await exportMarkupsToPdf(blueprint, [rect('h', { hidden: true })])).pdfBytes.length;
    expect(shown).toBeGreaterThan(none + 100);
    expect(hidden).toBe(none);
  });
});
