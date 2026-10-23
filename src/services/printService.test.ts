import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanupPrint, printDocument } from './printService';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useUiStore } from '../store/useUiStore';
import type { Markup } from '../types/markup';

vi.mock('./toastService', () => ({ showToast: vi.fn() }));

const exported: { markupIds: string[] }[] = [];
vi.mock('./pdfExportService', () => ({
  exportMarkupsToPdf: vi.fn().mockImplementation(async (bytes: Uint8Array, markups: Markup[]) => {
    exported.push({ markupIds: markups.map((m) => m.id) });
    return { pdfBytes: new Uint8Array([...bytes, 9]), warnings: { replacedCharactersCount: 0 } };
  }),
}));

const SIZES = [
  { w: 600, h: 800 },
  { w: 1200, h: 800 },
  { w: 600, h: 800 },
];
const loaded: Uint8Array[] = [];
vi.mock('./pdfService', () => ({
  loadPdfDocument: vi.fn().mockImplementation(async (bytes: Uint8Array) => {
    loaded.push(bytes);
    return {
      numPages: SIZES.length,
      destroy: vi.fn().mockResolvedValue(undefined),
      getPage: vi.fn().mockImplementation(async (n: number) => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: SIZES[n - 1].w * scale, height: SIZES[n - 1].h * scale }),
        render: () => ({ promise: Promise.resolve() }),
      })),
    };
  }),
}));

const mk = (id: string, layer?: string): Markup =>
  ({ id, type: 'rectangle', pageIndex: 0, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending', layer }) as Markup;

describe('printService (ADR-0115)', () => {
  let printSpy: ReturnType<typeof vi.fn>;
  let revoked: string[];

  beforeEach(() => {
    exported.length = 0;
    loaded.length = 0;
    revoked = [];
    cleanupPrint();
    useDocumentStore.setState({ pdfBytes: new Uint8Array([1, 2, 3]), numPages: 3, fileName: 'a.pdf' });
    useMarkupStore.setState({ markups: [mk('a'), mk('b', 'Oculta'), { ...mk('c'), hidden: true }], selectedMarkupIds: [] });
    useUiStore.setState({ hiddenLayers: ['Oculta'] });
    printSpy = vi.fn();
    window.print = printSpy as unknown as typeof window.print;
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:page-${n++}`);
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ fillRect: vi.fn(), fillStyle: '' })) as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/png' }));
    } as never;
    HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => cleanupPrint());

  it('prepara una imagen por página elegida en el contenedor de impresión y abre el diálogo del sistema', async () => {
    const res = await printDocument({ pages: [0, 2], withMarkups: false, dpi: 150, scale: 'fit', grayscale: false });
    expect(res).toEqual({ ok: true, message: '2 pages sent to the print dialog.' });
    expect(printSpy).toHaveBeenCalledTimes(1);
    const root = document.getElementById('rea-print-root')!;
    expect([...root.querySelectorAll('section')].map((s) => (s as HTMLElement).dataset.page)).toEqual(['1', '3']);
    expect(root.querySelectorAll('img')).toHaveLength(2);
    expect(document.getElementById('rea-print-style')!.textContent).toContain('@page p1 { size: portrait; margin: 0; }');
  });

  it('con marcas imprime el documento aplanado sin las marcas ocultas ni las de capas ocultas; sin marcas, el original', async () => {
    await printDocument({ pages: [0], withMarkups: true, dpi: 100, scale: 'fit', grayscale: false });
    expect(exported).toEqual([{ markupIds: ['a', 'c'] }]);
    // c lleva `hidden`: la exportación ya la omite al aplanar; aquí solo se filtra por capa
    expect([...loaded[0]]).toEqual([1, 2, 3, 9]);
    cleanupPrint();
    await printDocument({ pages: [0], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false });
    expect([...loaded[1]]).toEqual([1, 2, 3]);
    expect(exported).toHaveLength(1);
  });

  it('tamaño real escribe la hoja de cada página con su tamaño, y las páginas de distinto tamaño no se mezclan', async () => {
    await printDocument({ pages: [0, 1], withMarkups: false, dpi: 150, scale: 'actual', grayscale: true });
    const css = document.getElementById('rea-print-style')!.textContent!;
    expect(css).toContain('@page p0 { size: 600pt 800pt; margin: 0; }');
    expect(css).toContain('@page p1 { size: 1200pt 800pt; margin: 0; }');
    expect(css).toContain('grayscale(1)');
  });

  it('informa del progreso página a página', async () => {
    const seen: string[] = [];
    await printDocument({ pages: [0, 1, 2], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false, onProgress: (d, t) => seen.push(`${d}/${t}`) });
    expect(seen).toEqual(['0/3', '1/3', '2/3', '3/3']);
  });

  it('al terminar la impresión (afterprint) se retira el contenedor y se liberan las imágenes', async () => {
    await printDocument({ pages: [0, 1], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false });
    expect(document.getElementById('rea-print-root')).not.toBeNull();
    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById('rea-print-root')).toBeNull();
    expect(document.getElementById('rea-print-style')).toBeNull();
    expect(revoked).toEqual(['blob:page-0', 'blob:page-1']);
  });

  it('una impresión nueva retira la anterior y no deja dos contenedores', async () => {
    await printDocument({ pages: [0], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false });
    await printDocument({ pages: [1], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false });
    expect(document.querySelectorAll('#rea-print-root')).toHaveLength(1);
    expect(document.querySelectorAll('#rea-print-style')).toHaveLength(1);
  });

  it('sin documento o sin páginas no imprime nada', async () => {
    expect((await printDocument({ pages: [], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false })).ok).toBe(false);
    useDocumentStore.setState({ pdfBytes: null });
    expect(await printDocument({ pages: [0], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false })).toEqual({ ok: false, message: 'No document open.' });
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('si el sistema falla al abrir la impresión se limpia todo y se explica', async () => {
    printSpy.mockImplementation(() => {
      throw new Error('sin impresora');
    });
    const res = await printDocument({ pages: [0], withMarkups: false, dpi: 100, scale: 'fit', grayscale: false });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/sin impresora/);
    expect(document.getElementById('rea-print-root')).toBeNull();
  });
});
