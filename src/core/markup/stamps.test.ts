import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFArray, PDFDict, PDFName } from 'pdf-lib';
import { STAMPS, stampLayout, stampSubtitle, defaultStampSizePt, boldTextWidth } from './stamps';
import { emitMarkupOperators, PageTransformInfo } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { Markup } from '../../types/markup';

const transform: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const stamp: Markup = {
  id: 'sello-1',
  type: 'stamp',
  pageIndex: 0,
  points: [
    { x: 0.6, y: 0.1 },
    { x: 0.85, y: 0.18 },
  ],
  text: 'APPROVED',
  style: { strokeColor: '#15803d', fillColor: '#ffffff', strokeWidth: 2, opacity: 1 },
  author: 'Reviewer',
  createdAt: '2026-10-11T12:00:00Z',
  updatedAt: '2026-10-11T12:00:00Z',
  status: 'pending',
  customFields: { stampId: 'approved', stampSubtitle: 'Reviewer · 2026-10-11 12:00' },
};

describe('Sellos predeterminados (ADR-0026)', () => {
  it('incluye los sellos de revisión de obra de Revu/Foxit con nombres únicos', () => {
    const labels = STAMPS.map((s) => s.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'APPROVED',
        'REJECTED',
        'REVIEWED',
        'FOR CONSTRUCTION',
        'NOT FOR CONSTRUCTION',
        'REVISE AND RESUBMIT',
        'VOID',
        'DRAFT',
      ])
    );
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(STAMPS.length);
  });

  it('el título cabe siempre dentro del marco y el subtítulo lleva autor y fecha', () => {
    const L = stampLayout({ x: 0, y: 0, w: 60, h: 40 }, 'NOT FOR CONSTRUCTION', 'Reviewer · 2026-10-11 12:00');
    expect(boldTextWidth('NOT FOR CONSTRUCTION', L.titleSize)).toBeLessThanOrEqual(L.inner.w);
    expect(L.subBaseline).not.toBeNull();
    expect(stampSubtitle('Ana', '2026-10-11T12:05:00')).toBe('Ana · 2026-10-11 12:05');
    expect(defaultStampSizePt('APPROVED', 'Ana · 2026-10-11 12:05').height).toBe(44);
  });

  it('el /AP dibuja doble marco y el título en Helvetica-Bold', () => {
    const out = emitMarkupOperators(stamp, transform);
    expect(out.boldFontName).toBe('HeBo');
    expect(out.fontName).toBe('Helv');
    expect(out.operators).toContain('(APPROVED) Tj');
    expect(out.operators).toContain('(Reviewer \\267 2026-10-11 12:00) Tj');
  });

  it('se guarda como /Stamp con /Name estándar y vuelve como sello al reabrir', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [stamp]);
    const doc = await PDFDocument.load(saved);
    const annots = doc.getPages()[0].node.lookup(PDFName.of('Annots'), PDFArray);
    const dict = annots
      .asArray()
      .map((r) => doc.context.lookup(r, PDFDict))
      .find((d) => d.get(PDFName.of('Subtype'))?.toString() === '/Stamp')!;
    expect(dict.get(PDFName.of('Name'))?.toString()).toBe('/Approved');
    const back = (await importPdfAnnotations(saved)).markups.find((m) => m.id === 'sello-1')!;
    expect(back.type).toBe('stamp');
    expect(back.text).toBe('APPROVED');
    expect(back.customFields?.stampSubtitle).toBe('Reviewer · 2026-10-11 12:00');
    expect(back.points).toEqual(stamp.points);
  });
});
