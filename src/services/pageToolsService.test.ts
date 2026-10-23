import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { executeHeadersFooters, executeReplacePages, executeSplitDocument, serializeOpenDocument } from './pageToolsService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { EMPTY_SLOTS } from '../core/pages/headersFooters';
import type { Markup } from '../types/markup';

const saved: { name: string; bytes: Uint8Array }[] = [];
vi.mock('./toastService', () => ({ showToast: vi.fn() }));
vi.mock('./exportService', () => ({
  saveExportFileWithDialog: vi.fn().mockImplementation(async (name: string, _ext: string, bytes: Uint8Array) => {
    saved.push({ name, bytes });
    return true;
  }),
}));
vi.mock('./pdfService', () => ({
  loadPdfDocument: vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { numPages: doc.getPageCount() } as never;
  }),
}));

const mk = (id: string, pageIndex: number): Markup =>
  ({
    id,
    type: 'rectangle',
    pageIndex,
    points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }],
    style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    author: 'a',
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T10:00:00Z',
    status: 'pending',
  }) as Markup;

/** PDF cuyas páginas miden `base + i` de ancho, para reconocerlas. */
const make = async (n: number, base: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([base + i, 400]);
  return doc.save();
};
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

describe('pageToolsService (ADR-0114)', () => {
  beforeEach(async () => {
    saved.length = 0;
    const bytes = await make(5, 600);
    useDocumentStore.setState({
      filePath: 'C:/planos/Obra.pdf',
      fileName: 'Obra.pdf',
      pdfBytes: bytes,
      numPages: 5,
      currentPageIndex: 3,
      scale: 1,
      rotation: 0,
      pdfDoc: { numPages: 5 } as never,
      pageLabels: { 0: 'A' } as never,
      importedAnnotationIds: [],
    });
    useMarkupStore.setState({ markups: [mk('p0', 0), mk('p1', 1), mk('p2', 2), mk('p4', 4)], selectedMarkupIds: [] });
    useCalibrationStore.setState({
      calibrations: { 1: { scale: 2, unit: 'm' }, 4: { scale: 3, unit: 'm' } },
      viewports: { 4: [{ id: 'v', name: 'v', pageIndex: 4, bounds: { x: 0, y: 0, width: 0.5, height: 0.5 }, calibration: { scale: 1, unit: 'm' } }] },
    });
  });

  it('Headers & Footers estampa y conserva el estado del documento', async () => {
    const before = useDocumentStore.getState().pdfBytes!;
    const res = await executeHeadersFooters({
      slots: { ...EMPTY_SLOTS, headerRight: '{date}', footerCenter: '{n} / {total}' },
      fontSize: 9,
      margin: 20,
      color: '#000000',
      font: 'Helvetica',
      startAt: 1,
      pages: [0, 1, 2, 3, 4],
      fileName: 'Obra.pdf',
      title: '',
      now: new Date(2026, 9, 22),
    });
    expect(res).toEqual({ ok: true, message: 'Headers and footers added to 5 pages.' });
    expect(useDocumentStore.getState().pdfBytes).not.toBe(before);
    expect(useDocumentStore.getState().currentPageIndex).toBe(3);
    expect(useDocumentStore.getState().pageLabels).toEqual({ 0: 'A' });
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('Replace con la misma cantidad y conservando marcas: nada se corre', async () => {
    const source = await make(3, 900);
    const res = await executeReplacePages({ targets: [1, 2], source: { name: 'rev.pdf', bytes: source }, sourceIndices: [0, 1], keepMarkups: true });
    expect(res.ok).toBe(true);
    expect(await widths(useDocumentStore.getState().pdfBytes!)).toEqual([600, 900, 901, 603, 604]);
    expect(useMarkupStore.getState().markups.map((m) => [m.id, m.pageIndex])).toEqual([['p0', 0], ['p1', 1], ['p2', 2], ['p4', 4]]);
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
  });

  it('Replace sin conservar marcas quita las de las páginas sustituidas', async () => {
    const source = await make(2, 900);
    await executeReplacePages({ targets: [1, 2], source: { name: 'rev.pdf', bytes: source }, sourceIndices: [0, 1], keepMarkups: false });
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['p0', 'p4']);
    expect(useCalibrationStore.getState().calibrations[1]).toEqual({ scale: 2, unit: 'm' });
  });

  it('Replace con más páginas nuevas: lo posterior se desplaza (marcas, escalas y viewports) y las de lo sustituido se quitan', async () => {
    const source = await make(3, 900);
    const res = await executeReplacePages({ targets: [1], source: { name: 'rev.pdf', bytes: source }, sourceIndices: [0, 1, 2], keepMarkups: true });
    expect(res.message).toBe('1 page replaced (5 → 7 pages).');
    expect(await widths(useDocumentStore.getState().pdfBytes!)).toEqual([600, 900, 901, 902, 602, 603, 604]);
    // p1 desaparece; p2 pasa de la página 2 a la 4 y p4 de la 4 a la 6
    expect(useMarkupStore.getState().markups.map((m) => [m.id, m.pageIndex])).toEqual([['p0', 0], ['p2', 4], ['p4', 6]]);
    const cal = useCalibrationStore.getState();
    expect(cal.calibrations).toEqual({ 6: { scale: 3, unit: 'm' } });
    expect(cal.viewports[6][0].pageIndex).toBe(6);
    expect(useDocumentStore.getState().pageLabels).toBeNull();
  });

  it('Replace con menos páginas nuevas: el documento se encoge y lo posterior sube', async () => {
    const source = await make(1, 900);
    await executeReplacePages({ targets: [1, 2, 3], source: { name: 'rev.pdf', bytes: source }, sourceIndices: [0], keepMarkups: true });
    expect(await widths(useDocumentStore.getState().pdfBytes!)).toEqual([600, 900, 604]);
    expect(useMarkupStore.getState().markups.map((m) => [m.id, m.pageIndex])).toEqual([['p0', 0], ['p4', 2]]);
  });

  it('Replace con datos no válidos no cambia nada', async () => {
    const before = useDocumentStore.getState().pdfBytes;
    const res = await executeReplacePages({ targets: [9], source: { name: 'rev.pdf', bytes: await make(1, 900) }, sourceIndices: [0], keepMarkups: true });
    expect(res.ok).toBe(false);
    expect(useDocumentStore.getState().pdfBytes).toBe(before);
    expect(useMarkupStore.getState().markups).toHaveLength(4);
  });

  it('el documento serializado lleva las marcas como anotaciones', async () => {
    const bytes = await serializeOpenDocument();
    const doc = await PDFDocument.load(bytes);
    const annots = doc.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
  });

  it('Split en el navegador descarga un archivo por parte, con las marcas de sus páginas', async () => {
    const res = await executeSplitDocument([[0, 1], [2], [3, 4]]);
    expect(res).toEqual({ ok: true, message: '3 files downloaded.' });
    expect(saved.map((s) => s.name)).toEqual(['Obra_p1-2.pdf', 'Obra_p3.pdf', 'Obra_p4-5.pdf']);
    const widthsOf = await Promise.all(saved.map((s) => widths(s.bytes)));
    expect(widthsOf).toEqual([[600, 601], [602], [603, 604]]);
    // Cada archivo lleva las anotaciones de sus páginas: p0 y p1 en el primero, p2 en el segundo, p4 en el tercero
    const counts = await Promise.all(
      saved.map(async (s) => {
        const d = await PDFDocument.load(s.bytes);
        return d.getPages().reduce((n, p) => n + (p.node.Annots()?.size() ?? 0), 0);
      })
    );
    expect(counts).toEqual([2, 1, 1]);
  });
});
