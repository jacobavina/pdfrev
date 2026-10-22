import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

const toasts: string[] = [];
vi.mock('./toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('./pageRaster', () => ({ rasterizePage: vi.fn(), rasterToPng: vi.fn() }));
vi.mock('./pdfService', () => ({ loadPdfDocument: vi.fn(async (b: Uint8Array) => ({ numPages: (await PDFDocument.load(b)).getPageCount() })) }));

import {
  applyRedactions,
  applyRedactionsToPdf,
  describeReport,
  isRedaction,
  markSearchResultsForRedaction,
  redactionMarkup,
  toUserRect,
} from './redactionService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { getHelveticaTextWidth } from '../core/markup/helveticaMetrics';
import type { SearchMatch } from '../core/search/textSearch';

async function textPage(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Cliente: ACME SA', { x: 50, y: 200, size: 12, font });
  page.drawText('Presupuesto: 12.500 USD', { x: 50, y: 150, size: 12, font });
  return doc.save();
}

async function pageText(bytes: Uint8Array): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  return content.items.map((i) => ('str' in i ? (i as { str: string }).str : '')).join(' ');
}

/** Marca sobre "ACME SA" de la primera línea, en coordenadas normalizadas de la página de 400 × 300. */
const acmeMark = () => {
  const x0 = 50 + getHelveticaTextWidth('Cliente: ', 12);
  const x1 = 50 + getHelveticaTextWidth('Cliente: ACME SA', 12);
  return redactionMarkup(0, { x: (x0 - 0.3) / 400, y: 1 - 215 / 300 }, { x: (x1 + 0.3) / 400, y: 1 - 195 / 300 }, 'Ana');
};

describe('Redacción permanente: marcas, aplicación y Search & Redact (ADR-0103)', () => {
  beforeEach(() => {
    toasts.length = 0;
    window.confirm = () => true;
  });

  it('las marcas de redacción son rectángulos rojos reconocibles y no se confunden con un rectángulo normal', () => {
    const m = acmeMark();
    expect(m).toMatchObject({ type: 'rectangle', subject: 'Redaction', customFields: { redact: 1 } });
    expect(isRedaction(m)).toBe(true);
    expect(isRedaction({ type: 'rectangle', customFields: {} })).toBe(false);
    expect(isRedaction({ type: 'line', customFields: { redact: 1 } })).toBe(false);
  });

  it('pasa la caja mostrada al espacio de usuario según el giro de la página', () => {
    const box = { x: 0, y: 0, width: 400, height: 300 };
    expect(toUserRect({ x: 0.25, y: 0.1 }, { x: 0.5, y: 0.2 }, 0, box)).toEqual({ x0: 100, y0: 240, x1: 200, y1: 270 });
    // A 90° el eje horizontal mostrado es el vertical de la página
    const r = toUserRect({ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, 90, box);
    expect(r).toEqual({ x0: 0, y0: 0, x1: 200, y1: 150 });
  });

  it('aplicar redacciones quita el texto del PDF y deja el resto', async () => {
    const { pdfBytes, report } = await applyRedactionsToPdf(await textPage(), [acmeMark()]);
    const text = await pageText(pdfBytes);
    expect(text).not.toContain('ACME');
    expect(text).toContain('Cliente:');
    expect(text).toContain('Presupuesto: 12.500 USD');
    expect(report).toMatchObject({ removedGlyphs: 7, removedPaths: 0 });
    expect(report.pages).toHaveLength(1);
    expect(Buffer.from(pdfBytes).toString('latin1')).not.toContain('ACME');
  });

  it('si la página tiene una imagen bajo la redacción la sustituye por su versión rasterizada con la caja en negro', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    page.drawImage(await doc.embedPng(png), { x: 100, y: 100, width: 100, height: 100 });
    const rasterize = vi.fn(async (bytes: Uint8Array, _page: number, _boxes: unknown[]) => bytes);
    const mark = redactionMarkup(0, { x: 0.3, y: 0.4 }, { x: 0.4, y: 0.6 }, 'Ana');
    const { report } = await applyRedactionsToPdf(await doc.save(), [mark], rasterize);
    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(rasterize.mock.calls[0][1]).toBe(0);
    expect(rasterize.mock.calls[0][2]).toEqual([{ a: mark.points[0], b: mark.points[1] }]);
    expect(report.pages[0].rasterized).toMatch(/image overlaps/);
    expect(describeReport(report)).toMatch(/Page 1 became an image because an image overlaps/);
  });

  it('el flujo completo cambia el documento abierto, quita las marcas, conserva la página y el zoom y avisa', async () => {
    const bytes = await textPage();
    const other = redactionMarkup(0, { x: 0.8, y: 0.8 }, { x: 0.9, y: 0.9 }, 'Ana');
    useMarkupStore.setState({ markups: [acmeMark(), other, { ...other, id: 'normal', customFields: {}, subject: 'Rect' }], selectedMarkupIds: [] });
    useDocumentStore.setState({ pdfBytes: bytes, numPages: 1, currentPageIndex: 0, scale: 2, filePath: 'p.pdf', fileName: 'p.pdf' });
    await applyRedactions();
    const s = useDocumentStore.getState();
    expect(await pageText(s.pdfBytes!)).not.toContain('ACME');
    expect(s.scale).toBe(2);
    // Solo se quitan las marcas de redacción; el rectángulo normal sigue
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['normal']);
    expect(toasts.at(-1)).toMatch(/Redaction applied to 1 page: 7 characters/);
  });

  it('sin marcas, o si el usuario cancela, no toca el documento', async () => {
    const bytes = await textPage();
    useDocumentStore.setState({ pdfBytes: bytes, numPages: 1, currentPageIndex: 0, scale: 1 });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    await applyRedactions();
    expect(toasts.at(-1)).toMatch(/no redaction marks/);
    useMarkupStore.setState({ markups: [acmeMark()], selectedMarkupIds: [] });
    window.confirm = () => false;
    await applyRedactions();
    expect(useDocumentStore.getState().pdfBytes).toBe(bytes);
    expect(useMarkupStore.getState().markups).toHaveLength(1);
  });

  it('Search & Redact: cada línea de cada resultado de la búsqueda pasa a ser una marca de redacción', () => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    const matches: SearchMatch[] = [
      { pageIndex: 0, matchIndex: 0, pageMatchIndex: 0, text: 'ACME', rects: [{ x: 0.1, y: 0.2, width: 0.1, height: 0.03 }] },
      {
        pageIndex: 1,
        matchIndex: 1,
        pageMatchIndex: 0,
        text: 'ACME SA',
        rects: [
          { x: 0.1, y: 0.2, width: 0.1, height: 0.03 },
          { x: 0.1, y: 0.25, width: 0.05, height: 0.03 },
        ],
      },
    ];
    expect(markSearchResultsForRedaction(matches)).toBe(3);
    const marks = useMarkupStore.getState().markups;
    expect(marks.every(isRedaction)).toBe(true);
    expect(marks.map((m) => m.pageIndex)).toEqual([0, 1, 1]);
    expect(marks[0].points[1].x).toBeCloseTo(0.2, 9);
    expect(markSearchResultsForRedaction([])).toBe(0);
  });
});
