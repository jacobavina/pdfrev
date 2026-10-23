import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { describePart, MAX_SPLIT_PARTS, partFileNames, partsEvery, partsFromRanges, splitPdf } from './pageSplit';

const make = async (sizes: [number, number][]) => {
  const doc = await PDFDocument.create();
  doc.setTitle('Plano');
  for (const [w, h] of sizes) doc.addPage([w, h]);
  return doc.save();
};

describe('Split Document: partes y nombres (ADR-0114)', () => {
  it('cada N páginas, con las que sobren en la última', () => {
    expect(partsEvery(3, 8)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7]]);
    expect(partsEvery(1, 2)).toEqual([[0], [1]]);
    expect(partsEvery(10, 4)).toEqual([[0, 1, 2, 3]]);
    expect(partsEvery(0, 4)).toBeNull();
    expect(partsEvery(2.5, 4)).toBeNull();
    expect(partsEvery(1, MAX_SPLIT_PARTS + 1)).toBeNull();
  });

  it('partes escritas con rangos, comas y punto y coma, y se rechazan las inválidas', () => {
    expect(partsFromRanges('1-3; 4-6; 8, 10', 10)).toEqual([[0, 1, 2], [3, 4, 5], [7, 9]]);
    expect(partsFromRanges('1-2\n3', 3)).toEqual([[0, 1], [2]]);
    expect(partsFromRanges('1-3; 9', 5)).toBeNull();
    expect(partsFromRanges('3-1', 5)).toBeNull();
    expect(partsFromRanges('a', 5)).toBeNull();
    expect(partsFromRanges('   ', 5)).toBeNull();
  });

  it('describe las páginas de una parte con rangos', () => {
    expect(describePart([0, 1, 2])).toBe('1-3');
    expect(describePart([4])).toBe('5');
    expect(describePart([0, 3, 4, 5, 8])).toBe('1, 4-6, 9');
  });

  it('los nombres de archivo llevan las páginas, no se repiten y no tienen caracteres prohibidos', () => {
    expect(partFileNames('Obra', [[0, 1, 2], [3], [4, 6]])).toEqual(['Obra_p1-3.pdf', 'Obra_p4.pdf', 'Obra_part3.pdf']);
    expect(partFileNames('Obra', [[0, 1], [0, 1]])).toEqual(['Obra_p1-2.pdf', 'Obra_p1-2_2.pdf']);
    expect(partFileNames('a/b:c*', [[0]])).toEqual(['a_b_c__p1.pdf']);
    expect(partFileNames('   ', [[0]])).toEqual(['document_p1.pdf']);
  });
});

describe('Split Document: archivos (ADR-0114)', () => {
  it('cada parte es un PDF con las páginas que le tocan, en su orden y con su tamaño', async () => {
    const bytes = await make([[100, 100], [200, 100], [300, 100], [400, 100]]);
    const [a, b] = await splitPdf(bytes, [[0, 1], [3, 2]]);
    const da = await PDFDocument.load(a);
    const db = await PDFDocument.load(b);
    expect(da.getPages().map((p) => p.getWidth())).toEqual([100, 200]);
    expect(db.getPages().map((p) => p.getWidth())).toEqual([400, 300]);
    expect(da.getTitle()).toBe('Plano');
  });

  it('una página puede estar en varias partes y el original no cambia', async () => {
    const bytes = await make([[100, 100], [200, 100]]);
    const copy = new Uint8Array(bytes);
    const parts = await splitPdf(bytes, [[1], [1], [0, 1]]);
    expect(parts).toHaveLength(3);
    expect((await PDFDocument.load(parts[2])).getPageCount()).toBe(2);
    expect(bytes).toEqual(copy);
  });
});
