import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

let tauri = true;
vi.mock('./bbxPersistenceService', () => ({ isTauriEnvironment: () => tauri }));
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('./pageRaster', () => ({
  rasterizePage: vi.fn(async () => ({ raster: { data: new Uint8ClampedArray(4), width: 800, height: 600 }, aspect: 4 / 3 })),
  rasterToPng: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
}));
// Páginas con texto en el documento simulado (índice 1 = segunda página)
let pagesWithText = new Set<number>([1]);
vi.mock('./pdfService', () => ({
  loadPdfDocument: vi.fn(async () => ({
    numPages: 3,
    getPage: async (n: number) => ({ getTextContent: async () => ({ items: pagesWithText.has(n - 1) ? [{ str: 'ya hay texto' }] : [] }) }),
    destroy: async () => undefined,
  })),
}));

import { ocrPdfBytes } from './ocrService';
import { runBatchOp, opSuffix, outputName } from './batchOps';

async function threePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([400, 300]);
  return doc.save();
}

async function textOfPage(bytes: Uint8Array, pageNo: number): Promise<string> {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true }).promise;
  const content = await (await pdf.getPage(pageNo)).getTextContent();
  return content.items.map((i) => ('str' in i ? (i as { str: string }).str : '')).filter((s) => s.trim()).join(' ');
}

describe('OCR en Batch (ADR-0133)', () => {
  beforeEach(() => {
    tauri = true;
    pagesWithText = new Set([1]);
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ width: 800, height: 600, language: 'Español (México)', words: [{ text: 'PLANTA', x: 100, y: 100, width: 200, height: 40 }] });
  });

  it('reconoce solo las páginas sin texto, avanza el progreso y escribe la capa de texto en esas páginas', async () => {
    const progress: string[] = [];
    const result = await ocrPdfBytes(await threePagePdf(), (d, t) => progress.push(`${d}/${t}`));
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ words: 2, pages: 2, skipped: 1, language: 'Español (México)' });
    expect(progress).toEqual(['0/2', '1/2', '2/2']);
    expect(await textOfPage(result.bytes, 1)).toBe('PLANTA');
    expect(await textOfPage(result.bytes, 3)).toBe('PLANTA');
  });

  it('fuera de la aplicación de escritorio falla con un mensaje claro y no llama al motor', async () => {
    tauri = false;
    await expect(ocrPdfBytes(await threePagePdf())).rejects.toThrow(/only available in the desktop app/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('como operación del lote: sufijo _ocr, devuelve el PDF con texto y explica cuando no hay nada que reconocer', async () => {
    expect(opSuffix({ kind: 'ocr' })).toBe('ocr');
    expect(outputName('plano.pdf', { kind: 'ocr' }, new Set())).toBe('plano_ocr.pdf');
    const bytes = await threePagePdf();
    const out = await runBatchOp(bytes, { kind: 'ocr' });
    expect(await textOfPage(out, 1)).toBe('PLANTA');
    pagesWithText = new Set([0, 1, 2]);
    await expect(runBatchOp(bytes, { kind: 'ocr' })).rejects.toThrow(/already has selectable text/);
  });

  it('si el motor no encuentra palabras el archivo falla en lugar de guardarse igual', async () => {
    invokeMock.mockResolvedValue({ width: 800, height: 600, language: 'es', words: [] });
    await expect(runBatchOp(await threePagePdf(), { kind: 'ocr' })).rejects.toThrow(/found no text/);
  });
});
