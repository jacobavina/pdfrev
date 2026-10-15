import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, PDFStream } from 'pdf-lib';
import { emitMarkupOperators, PageTransformInfo } from './operators';
import { saveIncrementalMarkups, toPdfLineEnding, borderStyleEntry } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { exportMarkupsToPdf } from '../../services/pdfExportService';
import { getMarkupSvgDescriptor } from '../markup/render';
import { dashArrayFor } from '../markup/lineStyles';
import { Markup, MarkupType, LineEndingStyle } from '../../types/markup';

const transform: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const mk = (
  id: string,
  type: MarkupType,
  points: { x: number; y: number }[],
  style: Partial<Markup['style']> = {}
): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1, ...style },
  author: 'Revisor',
  createdAt: '2026-10-11T12:00:00Z',
  updatedAt: '2026-10-11T12:00:00Z',
  status: 'pending',
});

const arrowLine = mk('flecha-1', 'line', [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }], {
  lineEndingEnd: 'closedArrow',
  lineEndingStart: 'circle',
  dashArray: dashArrayFor('dashed', 2),
});

describe('Flechas y tipos de línea en el PDF (ADR-0018)', () => {
  it('la apariencia /AP dibuja la punta rellena, sólida (sin patrón) y la incluye en la caja', () => {
    const plain = emitMarkupOperators({ ...arrowLine, style: { ...arrowLine.style, lineEndingEnd: undefined, lineEndingStart: undefined } }, transform);
    const withArrow = emitMarkupOperators(arrowLine, transform);
    // Patrón discontinuo de la línea, y anulado ("[] 0 d") antes de las puntas
    expect(withArrow.operators).toContain('[8.0 6.0] 0 d');
    expect(withArrow.operators).toContain('[] 0 d');
    // Formas cerradas de extremo solo rellenas ("f", sin contorno que redondee la punta, ADR-0035), en color de trazo
    expect(withArrow.operators.match(/^f$/gm)?.length).toBe(2);
    expect(withArrow.operators).toMatch(/0\.878 0\.141 0\.141 rg/);
    // La punta (x = 400 pt) sobresale de la línea y amplía la caja verticalmente
    expect(withArrow.bbox[3] - withArrow.bbox[1]).toBeGreaterThan(plain.bbox[3] - plain.bbox[1]);
  });

  it('las polilíneas también llevan extremos', () => {
    const poly = mk('poly-1', 'polyLine', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }, { x: 0.5, y: 0.1 }], {
      lineEndingEnd: 'openArrow',
    });
    const ops = emitMarkupOperators(poly, transform).operators.split('\n');
    // Trazo de la polilínea + trazo de la flecha abierta, con el patrón anulado entre ambos
    expect(ops.filter((l) => l === 'S').length).toBe(2);
    expect(ops.indexOf('[] 0 d')).toBeGreaterThan(ops.indexOf('S'));
    const noEnding = emitMarkupOperators({ ...poly, style: { ...poly.style, lineEndingEnd: undefined } }, transform);
    expect(noEnding.operators.split('\n').filter((l) => l === 'S').length).toBe(1);
  });

  it('escribe /LE con los seis estilos, en líneas y polilíneas, y /BS discontinuo', () => {
    const all: LineEndingStyle[] = ['none', 'openArrow', 'closedArrow', 'circle', 'square', 'diamond'];
    expect(all.map(toPdfLineEnding)).toEqual(['/None', '/OpenArrow', '/ClosedArrow', '/Circle', '/Square', '/Diamond']);
    expect(borderStyleEntry(2, undefined)).toBe('<< /W 2.00 /S /S >>');
    expect(borderStyleEntry(2, [8, 6])).toBe('<< /W 2.00 /S /D /D [8.00 6.00] >>');
  });

  it('ida y vuelta: extremos y patrón discontinuo se conservan al guardar y reabrir', async () => {
    const poly = mk('poly-2', 'polyLine', [{ x: 0.1, y: 0.7 }, { x: 0.3, y: 0.8 }, { x: 0.5, y: 0.7 }], {
      lineEndingStart: 'square',
      lineEndingEnd: 'diamond',
      dashArray: dashArrayFor('dotted', 2),
    });
    const saved = await saveIncrementalMarkups(blueprint, [arrowLine, poly]);
    const back = await importPdfAnnotations(saved);
    const line = back.markups.find((m) => m.id === 'flecha-1')!;
    const pl = back.markups.find((m) => m.id === 'poly-2')!;
    expect(line.style.lineEndingStart).toBe('circle');
    expect(line.style.lineEndingEnd).toBe('closedArrow');
    expect(line.style.dashArray).toEqual([8, 6]);
    expect(pl.style.lineEndingStart).toBe('square');
    expect(pl.style.lineEndingEnd).toBe('diamond');
    expect(pl.style.dashArray).toEqual([2, 4]);
  });

  it('"Exportar PDF" aplanado ya no omite polilíneas ni mediciones', async () => {
    const poly = mk('poly-3', 'polyLine', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }], { lineEndingEnd: 'closedArrow' });
    const area = {
      ...mk('area-1', 'area', [{ x: 0.6, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.5 }]),
      measurement: { value: 12.5, unit: 'm' as const, formatted: '12.50 m²', perimeter: 15 },
    };
    const { pdfBytes } = await exportMarkupsToPdf(blueprint, [poly, area]);
    const doc = await PDFDocument.load(pdfBytes);
    const xobjects = doc.getPages()[0].node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    expect(xobjects).toBeDefined();
    const streams = xobjects!
      .keys()
      .map((k) => xobjects!.lookup(k))
      .filter((s): s is PDFRawStream => s instanceof PDFStream);
    expect(streams.length).toBeGreaterThanOrEqual(2);
    const contents = streams.map((s) => new TextDecoder('latin1').decode((s as PDFRawStream).getContents()));
    expect(contents.some((c) => /\nf\n/.test(c))).toBe(true); // punta de flecha rellena de la polilínea
  });
});

describe('Extremos en pantalla (ADR-0018)', () => {
  const vt = { width: 800, height: 600, scale: 2, offsetX: 0, offsetY: 0, rotation: 0 };

  it('la flecha cerrada se rellena con el color de la línea aunque la marca no tenga relleno', () => {
    const desc = getMarkupSvgDescriptor({ ...arrowLine, style: { ...arrowLine.style, fillColor: 'transparent' } }, vt);
    expect(desc.tag).toBe('g');
    const head = desc.children!.find((c) => c.tag === 'polygon')!;
    expect(head.attrs.fill).toBe('#e02424');
  });

  it('el patrón discontinuo escala con el zoom', () => {
    const desc = getMarkupSvgDescriptor(arrowLine, vt);
    const line = desc.children![0];
    expect(line.attrs.strokeDasharray).toBe('16 12'); // [8, 6] pt × zoom 2
  });
});
