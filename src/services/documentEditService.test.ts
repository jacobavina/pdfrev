import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { executeCropPages, executeNumberPages, executeUpdateProperties, previewCrop } from './documentEditService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { readPageGeometry, viewSize } from '../core/pages/pageBoxes';
import { readDocumentProperties } from '../core/pages/documentProperties';
import type { Markup } from '../types/markup';

vi.mock('./toastService', () => ({ showToast: vi.fn() }));
vi.mock('./pdfService', () => ({
  loadPdfDocument: vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { numPages: doc.getPageCount() } as never;
  }),
}));

const mk = (id: string, points: { x: number; y: number }[], pageIndex = 0): Markup =>
  ({ id, type: 'rectangle', pageIndex, points, style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending' }) as Markup;

describe('documentEditService (ADR-0113)', () => {
  let bytes: Uint8Array;

  beforeEach(async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    doc.addPage([600, 400]).setRotation(degrees(90));
    doc.addPage([600, 400]);
    bytes = await doc.save();
    useDocumentStore.setState({
      filePath: 'C:/planos/a.pdf',
      fileName: 'a.pdf',
      pdfBytes: bytes,
      numPages: 3,
      currentPageIndex: 1,
      scale: 1.5,
      rotation: 0,
      pdfDoc: { numPages: 3 } as never,
      pageLabels: { 0: 'A' } as never,
      importedAnnotationIds: ['x'],
    });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useCalibrationStore.setState({ calibrations: {}, viewports: {} });
  });

  it('Crop: recorta el CropBox, pasa las marcas al nuevo origen y conserva el estado del documento', async () => {
    useMarkupStore.setState({ markups: [mk('a', [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }], 0), mk('otra', [{ x: 0.2, y: 0.3 }], 2)] });
    useCalibrationStore.setState({
      viewports: { 0: [{ id: 'v', name: 'v', pageIndex: 0, bounds: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, calibration: { scale: 1, unit: 'm' } }] },
    });
    // Página 1 (índice 0), 600×400 pt: 60 pt a izquierda y derecha, 40 arriba y abajo
    const pt = 72 / 25.4;
    const res = await executeCropPages({ pages: [0], margins: { top: 40, right: 60, bottom: 40, left: 60 } });
    expect(res).toEqual({ ok: true, message: '1 page cropped.' });
    const [g0, g1] = await readPageGeometry(useDocumentStore.getState().pdfBytes!);
    expect(viewSize(g0.transform)).toEqual({ width: 480, height: 320 });
    expect(viewSize(g1.transform)).toEqual({ width: 400, height: 600 }); // la página rotada no se tocó
    const markups = useMarkupStore.getState().markups;
    const a = markups.find((m) => m.id === 'a')!;
    // x: (0.2*600 - 60)/480 = 0.125 ; y: (0.3*400 - 40)/320 = 0.25
    expect(a.points[0].x).toBeCloseTo(0.125, 9);
    expect(a.points[0].y).toBeCloseTo(0.25, 9);
    expect(markups.find((m) => m.id === 'otra')!.points[0]).toEqual({ x: 0.2, y: 0.3 });
    const vp = useCalibrationStore.getState().viewports[0][0];
    expect(vp.bounds.x).toBeCloseTo((0.1 * 600 - 60) / 480, 9);
    const d = useDocumentStore.getState();
    expect([d.currentPageIndex, d.scale, d.importedAnnotationIds]).toEqual([1, 1.5, ['x']]);
    expect(d.pageLabels).toEqual({ 0: 'A' });
    expect(useMarkupStore.getState().isDirty).toBe(true);
    expect(pt).toBeGreaterThan(0);
  });

  it('Crop se niega si una marca quedaría fuera, y no cambia nada', async () => {
    useMarkupStore.setState({ markups: [mk('borde', [{ x: 0.02, y: 0.5 }, { x: 0.3, y: 0.6 }], 0)] });
    const res = await executeCropPages({ pages: [0], margins: { top: 0, right: 0, bottom: 0, left: 60 } });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/1 markup .*would fall outside the crop/);
    expect(useDocumentStore.getState().pdfBytes).toBe(bytes);
    expect(useMarkupStore.getState().markups[0].points[0].x).toBe(0.02);
  });

  it('Crop se niega si la página quedaría demasiado pequeña', async () => {
    const res = await executeCropPages({ pages: [0], margins: { top: 0, right: 0, bottom: 0, left: 590 } });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/too small/);
  });

  it('Restore full page devuelve la caja completa y vuelve a dejar las marcas donde estaban', async () => {
    useMarkupStore.setState({ markups: [mk('a', [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }], 0)] });
    await executeCropPages({ pages: [0], margins: { top: 40, right: 60, bottom: 40, left: 60 } });
    const res = await executeCropPages({ pages: [0], restore: true });
    expect(res.ok).toBe(true);
    const [g0] = await readPageGeometry(useDocumentStore.getState().pdfBytes!);
    expect(viewSize(g0.transform)).toEqual({ width: 600, height: 400 });
    const a = useMarkupStore.getState().markups[0];
    expect(a.points[0].x).toBeCloseTo(0.2, 9);
    expect(a.points[1].y).toBeCloseTo(0.7, 9);
  });

  it('la vista previa da el tamaño que tendrá la página actual y cuenta las marcas que no caben, por página', async () => {
    useMarkupStore.setState({ markups: [mk('x', [{ x: 0.01, y: 0.5 }], 2)] });
    const p = await previewCrop({ pages: [0, 1, 2], margins: { top: 20, right: 20, bottom: 20, left: 20 } });
    expect(p.plan).toHaveLength(3);
    expect(p.outside).toEqual({ 2: 1 });
    // La página actual (índice 1) está rotada: se ve de 400×600, y queda de 360×560
    expect(p.resultSize!.pageIndex).toBe(1);
    expect(p.resultSize!.width).toBeCloseTo(360, 6);
    expect(p.resultSize!.height).toBeCloseTo(560, 6);
  });

  it('Number Pages estampa las páginas elegidas y conserva el estado del documento', async () => {
    const res = await executeNumberPages({
      format: 'Hoja {n}',
      position: 'bottom-right',
      fontSize: 10,
      margin: 20,
      color: '#ff0000',
      startAt: 1,
      pages: [0, 2],
      font: 'Helvetica',
    });
    expect(res).toEqual({ ok: true, message: 'Numbered 2 pages.' });
    const out = useDocumentStore.getState().pdfBytes!;
    expect(out).not.toBe(bytes);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('Document Properties: escribe título y autor en el PDF abierto y lo marca como modificado', async () => {
    useMarkupStore.getState().markAsClean();
    expect(await executeUpdateProperties({ title: 'Plano A-101', author: 'Estudio', subject: '', keywords: 'obra, losa' })).toBe(true);
    const p = await readDocumentProperties(useDocumentStore.getState().pdfBytes!);
    expect(p).toMatchObject({ title: 'Plano A-101', author: 'Estudio', keywords: 'obra losa' });
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });
});
