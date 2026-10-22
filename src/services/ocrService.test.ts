import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

const toasts: string[] = [];
vi.mock('./toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
let tauri = true;
vi.mock('./bbxPersistenceService', () => ({ isTauriEnvironment: () => tauri }));
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('./pageRaster', () => ({
  rasterizePage: vi.fn(async () => ({ raster: { data: new Uint8ClampedArray(4), width: 800, height: 600 }, aspect: 4 / 3 })),
  rasterToPng: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
}));
vi.mock('./pdfService', () => ({ loadPdfDocument: vi.fn(async () => ({ numPages: 2 })) }));

import { runOcr } from './ocrService';
import { useDocumentStore } from '../store/useDocumentStore';

async function twoPagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  doc.addPage([400, 300]);
  return doc.save();
}

async function textOfPage(bytes: Uint8Array, pageNo: number): Promise<string[]> {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true }).promise;
  const content = await (await pdf.getPage(pageNo)).getTextContent();
  return content.items.map((i) => ('str' in i ? (i as { str: string }).str : '')).filter((s) => s.trim());
}

describe('OCR de páginas escaneadas (ADR-0102)', () => {
  beforeEach(async () => {
    toasts.length = 0;
    tauri = true;
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      width: 800,
      height: 600,
      language: 'Español (México)',
      words: [
        { text: 'PLANTA', x: 100, y: 100, width: 200, height: 40 },
        { text: 'BAJA', x: 320, y: 100, width: 120, height: 40 },
      ],
    });
    const bytes = await twoPagePdf();
    useDocumentStore.setState({
      pdfBytes: bytes,
      pdfDoc: { getPage: async () => ({ getTextContent: async () => ({ items: [] }) }) } as never,
      numPages: 2,
      currentPageIndex: 1,
      scale: 1.5,
      filePath: 'plano.pdf',
      fileName: 'plano.pdf',
    });
  });

  it('inserta palabras reconocidas por OCR como texto buscable en la página activa y conserva la página y el zoom', async () => {
    await runOcr('page');
    const s = useDocumentStore.getState();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe('ocr_recognize');
    // pdf.js une las palabras de una misma línea, como en cualquier texto del plano
    expect((await textOfPage(s.pdfBytes!, 2)).join(' ')).toBe('PLANTA BAJA');
    expect(await textOfPage(s.pdfBytes!, 1)).toEqual([]);
    expect(s.currentPageIndex).toBe(1);
    expect(s.scale).toBe(1.5);
    expect(toasts.at(-1)).toMatch(/OCR done: 2 words on 1 page .*Español/);
  });

  it('todas las páginas sin texto: reconoce solo las que no lo tienen y avisa si ya lo tienen todas', async () => {
    await runOcr('all');
    expect(invokeMock).toHaveBeenCalledTimes(2);
    const bytes = useDocumentStore.getState().pdfBytes!;
    expect((await textOfPage(bytes, 1)).join(' ')).toBe('PLANTA BAJA');
    expect((await textOfPage(bytes, 2)).join(' ')).toBe('PLANTA BAJA');
    // Ahora todas tienen texto
    useDocumentStore.setState({
      pdfDoc: { getPage: async () => ({ getTextContent: async () => ({ items: [{ str: 'ya hay texto' }] }) }) } as never,
    });
    invokeMock.mockClear();
    await runOcr('all');
    expect(invokeMock).not.toHaveBeenCalled();
    expect(toasts.at(-1)).toMatch(/already has selectable text/);
  });

  it('sin motor nativo (navegador) o sin texto reconocido avisa y no toca el documento', async () => {
    const before = useDocumentStore.getState().pdfBytes;
    tauri = false;
    await runOcr('page');
    expect(toasts.at(-1)).toMatch(/only available in the desktop app/);
    tauri = true;
    invokeMock.mockResolvedValueOnce({ width: 800, height: 600, language: '', words: [] });
    await runOcr('page');
    expect(toasts.at(-1)).toMatch(/found no text/);
    expect(useDocumentStore.getState().pdfBytes).toBe(before);
  });

  it('un error del motor llega al usuario como aviso', async () => {
    invokeMock.mockRejectedValueOnce('Windows no tiene un idioma de OCR instalado');
    await runOcr('page');
    expect(toasts.at(-1)).toMatch(/OCR failed/);
  });
});
