import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from 'pdf-lib';
import { autosizeFontSize, effectiveTextSize, AUTOSIZE_MIN_PT } from './autosizeText';
import { getMarkupSvgDescriptor, SvgRenderDescriptor } from './render';
import { emitMarkupOperators } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { Markup } from '../../types/markup';

const texts = (d: SvgRenderDescriptor): SvgRenderDescriptor[] =>
  d.tag === 'text' ? [d] : (d.children ?? []).flatMap(texts);

describe('Autosize Text de Revu (ADR-0061)', () => {
  it('da el mayor tamaño con que el texto cabe en la caja y crece o encoge con ella', () => {
    const small = autosizeFontSize('Verify beam', 120, 30, 'callout');
    const big = autosizeFontSize('Verify beam', 240, 60, 'callout');
    expect(big).toBeGreaterThan(small);
    // Con medio punto más ya no cabría (máximo real)
    expect(autosizeFontSize('Verify beam', 120, 30, 'callout')).toBe(small);
    expect(small % 0.5).toBe(0);
    // Un texto largo se envuelve en varias líneas y queda más pequeño que uno corto en la misma caja
    expect(autosizeFontSize('Verify beam size and connection details at grid line C', 120, 60, 'callout')).toBeLessThan(
      autosizeFontSize('Verify', 120, 60, 'callout')
    );
    // Caja imposible: el mínimo
    expect(autosizeFontSize('Hello', 10, 5, 'text')).toBe(AUTOSIZE_MIN_PT);
    // Sin la opción, el tamaño elegido
    expect(effectiveTextSize({ text: 'Hi' }, 11, 300, 300, 'text')).toBe(11);
    expect(effectiveTextSize({ text: 'Hi', customFields: { autoSizeText: 1 } }, 11, 300, 300, 'text')).toBeGreaterThan(11);
  });

  it('la pantalla, el /AP y el /DA escriben el texto del callout con el tamaño que llena la caja', async () => {
    const callout: Markup = {
      id: 'co-auto',
      type: 'callout',
      pageIndex: 0,
      points: [{ x: 0.3, y: 0.2 }, { x: 0.6, y: 0.3 }],
      leaders: [[{ x: 0.1, y: 0.5 }]],
      style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
      text: 'Check',
      author: 'Ana',
      createdAt: '2026-10-16T12:00:00Z',
      updatedAt: '2026-10-16T12:00:00Z',
      status: 'pending',
      customFields: { autoSizeText: 1 },
    };
    // Caja de 240 × 60 pt en una página de 800 × 600 pt
    const size = autosizeFontSize('Check', 240, 60, 'callout');
    expect(size).toBeGreaterThan(20);

    const screen = texts(getMarkupSvgDescriptor(callout, { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 }));
    expect(Number(screen[0].attrs.fontSize)).toBeCloseTo(size, 6);

    const ap = emitMarkupOperators(callout, { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 });
    expect(ap.operators).toContain(` ${size.toFixed(2)} Tf`);

    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
    const doc = await PDFDocument.load(await saveIncrementalMarkups(blueprint, [callout]));
    const annot = doc
      .getPages()[0]
      .node.Annots()!
      .asArray()
      .map((r) => doc.context.lookup(r as PDFRef, PDFDict))
      .find((d) => (d.get(PDFName.of('NM')) as PDFString | undefined)?.decodeText() === 'co-auto')!;
    expect((annot.get(PDFName.of('DA')) as PDFString).decodeText()).toContain(`/Helv ${size} Tf`);
  });
});
