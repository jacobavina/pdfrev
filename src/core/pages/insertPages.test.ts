import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { insertPdfPages, insertionIndex } from './insertPages';

const make = async (n: number, base: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([base + i, 100]);
  return doc.save();
};
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

describe('Insert Pages (ADR-0123)', () => {
  it('la posición sale de antes, después o al final de la página actual y no se sale del documento', () => {
    expect(insertionIndex('before', 2, 5)).toBe(2);
    expect(insertionIndex('after', 2, 5)).toBe(3);
    expect(insertionIndex('after', 4, 5)).toBe(5);
    expect(insertionIndex('end', 0, 5)).toBe(5);
    expect(insertionIndex('before', -3, 5)).toBe(0);
    expect(insertionIndex('after', 99, 5)).toBe(5);
  });

  it('inserta las páginas elegidas del otro PDF, en su orden, en la posición pedida', async () => {
    const r = await insertPdfPages(await make(4, 100), 2, await make(3, 500), [2, 0]);
    expect(await widths(r.bytes)).toEqual([100, 101, 502, 500, 102, 103]);
    expect([r.pagesBefore, r.pagesAfter]).toEqual([4, 6]);
  });

  it('al principio y al final', async () => {
    const doc = await make(2, 100);
    const other = await make(2, 500);
    expect(await widths((await insertPdfPages(doc, 0, other, [0])).bytes)).toEqual([500, 100, 101]);
    expect(await widths((await insertPdfPages(doc, 2, other, [0, 1])).bytes)).toEqual([100, 101, 500, 501]);
  });

  it('rechaza una posición o unas páginas que no existen, y una lista vacía, sin tocar nada', async () => {
    const doc = await make(2, 100);
    const other = await make(2, 500);
    await expect(insertPdfPages(doc, 3, other, [0])).rejects.toThrow(/position/);
    await expect(insertPdfPages(doc, -1, other, [0])).rejects.toThrow(/position/);
    await expect(insertPdfPages(doc, 1, other, [5])).rejects.toThrow(/outside the other PDF/);
    await expect(insertPdfPages(doc, 1, other, [])).rejects.toThrow(/Choose the pages/);
  });
});
