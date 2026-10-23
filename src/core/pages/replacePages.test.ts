import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfPageCount, replacePdfPages } from './replacePages';

/** PDF cuyas páginas miden `base + i` de ancho, para reconocerlas. */
const make = async (n: number, base: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([base + i, 100]);
  return doc.save();
};
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

describe('Replace Pages (ADR-0114)', () => {
  it('con la misma cantidad cada página se cambia por su pareja y las demás no se mueven', async () => {
    const doc = await make(5, 100); // 100..104
    const other = await make(3, 500); // 500..502
    const r = await replacePdfPages(doc, [1, 2], other, [0, 1]);
    expect(await widths(r.bytes)).toEqual([100, 500, 501, 103, 104]);
    expect([r.pagesBefore, r.pagesAfter]).toEqual([5, 5]);
  });

  it('con más páginas nuevas que reemplazadas, el documento crece y lo posterior se desplaza', async () => {
    const doc = await make(4, 100);
    const other = await make(3, 500);
    const r = await replacePdfPages(doc, [1], other, [0, 1, 2]);
    expect(await widths(r.bytes)).toEqual([100, 500, 501, 502, 102, 103]);
    expect([r.pagesBefore, r.pagesAfter]).toEqual([4, 6]);
  });

  it('con menos páginas nuevas, el documento se encoge', async () => {
    const doc = await make(5, 100);
    const other = await make(2, 500);
    const r = await replacePdfPages(doc, [1, 2, 3], other, [1]);
    expect(await widths(r.bytes)).toEqual([100, 501, 104]);
  });

  it('las páginas nuevas pueden venir de cualquier parte del otro PDF y en cualquier orden', async () => {
    const doc = await make(3, 100);
    const other = await make(4, 500);
    const r = await replacePdfPages(doc, [0], other, [3, 0]);
    expect(await widths(r.bytes)).toEqual([503, 500, 101, 102]);
  });

  it('páginas no contiguas: las nuevas van donde estaba la primera y las demás se quitan', async () => {
    const doc = await make(5, 100);
    const other = await make(1, 500);
    const r = await replacePdfPages(doc, [3, 1], other, [0]);
    expect(await widths(r.bytes)).toEqual([100, 500, 102, 104]);
  });

  it('rechaza páginas fuera de rango o listas vacías sin tocar nada', async () => {
    const doc = await make(3, 100);
    const other = await make(2, 500);
    await expect(replacePdfPages(doc, [5], other, [0])).rejects.toThrow(/outside this document/);
    await expect(replacePdfPages(doc, [0], other, [2])).rejects.toThrow(/outside the other PDF/);
    await expect(replacePdfPages(doc, [], other, [0])).rejects.toThrow(/Choose the pages/);
    expect(await pdfPageCount(other)).toBe(2);
  });
});
