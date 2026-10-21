import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFArray, PDFRef, PDFRawStream, decodePDFRawStream, StandardFonts } from 'pdf-lib';
import { exportMarkupsToPdf } from '../../services/pdfExportService';
import { canUnflatten, unflattenPdf } from './flattenRecord';
import type { Markup } from '../../types/markup';

const mk = (id: string, type: Markup['type'], points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
  author: 'Ana',
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
  status: 'pending',
  ...extra,
});

async function sourcePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('PLANO ORIGINAL', { x: 40, y: 250, size: 18, font });
  return doc.save();
}

/** Contenido decodificado de todos los flujos de la página, para comparar el plano antes y después. */
async function pageContent(bytes: Uint8Array): Promise<{ count: number; text: string }> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray().filter((o): o is PDFRef => o instanceof PDFRef) : [];
  let text = '';
  for (const r of refs) {
    const s = doc.context.lookup(r);
    if (s instanceof PDFRawStream) text += Buffer.from(decodePDFRawStream(s).decode()).toString('latin1');
  }
  return { count: refs.length, text };
}

const MARKUPS = [
  mk('r1', 'rectangle', [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.4 }]),
  mk('l1', 'line', [{ x: 0.2, y: 0.6 }, { x: 0.8, y: 0.7 }]),
];

describe('Aplanar y desaplanar marcas (ADR-0093)', () => {
  it('desaplanar quita lo dibujado al aplanar y devuelve las marcas, dejando el contenido original intacto', async () => {
    const original = await sourcePdf();
    const before = await pageContent(original);
    const { pdfBytes: flat } = await exportMarkupsToPdf(original, MARKUPS);
    const flattened = await pageContent(flat);
    // Aplanar añade flujos y el contenido ahora incluye las marcas
    expect(flattened.text.length).toBeGreaterThan(before.text.length);
    expect(await canUnflatten(flat)).toBe(true);

    const { pdfBytes: restored, markups } = await unflattenPdf(flat);
    expect(markups.map((m) => m.id)).toEqual(['r1', 'l1']);
    expect(markups[0].points).toEqual(MARKUPS[0].points);
    const after = await pageContent(restored);
    // El contenido del plano sigue idéntico y lo dibujado por el aplanado ha desaparecido
    expect(after.text).toContain(before.text);
    expect(after.text).not.toContain(' re');
    expect(await canUnflatten(restored)).toBe(false);
    const reloaded = await PDFDocument.load(restored);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('un PDF que no aplanó REA no se puede desaplanar y se avisa', async () => {
    const original = await sourcePdf();
    expect(await canUnflatten(original)).toBe(false);
    await expect(unflattenPdf(original)).rejects.toThrow(/not flattened by REA/);
  });

  it('un PDF sin marcas que dibujar no deja registro', async () => {
    const { pdfBytes } = await exportMarkupsToPdf(await sourcePdf(), []);
    expect(await canUnflatten(pdfBytes)).toBe(false);
  });
});
