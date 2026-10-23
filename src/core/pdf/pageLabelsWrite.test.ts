import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { buildPageLabelsMap, extractPageLabelsFromPdfBytes, readPageLabelRanges, writePageLabelRanges, type PageLabelRange } from './pageLabels';

const make = async (n: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([600, 400]);
  return doc.save();
};

describe('Escribir etiquetas de página (ADR-0124)', () => {
  const ranges: PageLabelRange[] = [
    { startPage: 0, style: 'r' },
    { startPage: 2, style: 'D', prefix: 'A-', startNum: 101 },
    { startPage: 5, prefix: 'Anexo' },
  ];

  it('las etiquetas escritas se leen igual al abrir el PDF', async () => {
    const out = await writePageLabelRanges(await make(7), ranges);
    expect(await readPageLabelRanges(out)).toEqual([
      { startPage: 0, style: 'r', prefix: undefined, startNum: undefined },
      { startPage: 2, style: 'D', prefix: 'A-', startNum: 101 },
      { startPage: 5, style: undefined, prefix: 'Anexo', startNum: undefined },
    ]);
    expect(await extractPageLabelsFromPdfBytes(out)).toEqual(buildPageLabelsMap(ranges, 7));
    expect((await extractPageLabelsFromPdfBytes(out))![3]).toBe('A-102');
  });

  it('un PDF sin etiquetas devuelve una lista vacía', async () => {
    expect(await readPageLabelRanges(await make(3))).toEqual([]);
  });

  it('si el primer rango no empieza en la página 1 se añade uno decimal desde 1, como dicta la norma', async () => {
    const out = await writePageLabelRanges(await make(4), [{ startPage: 2, style: 'R' }]);
    const labels = (await extractPageLabelsFromPdfBytes(out))!;
    expect([labels[0], labels[1], labels[2], labels[3]]).toEqual(['1', '2', 'I', 'II']);
  });

  it('sin rangos quita las etiquetas del catálogo', async () => {
    const labelled = await writePageLabelRanges(await make(3), ranges.slice(0, 1));
    expect(await readPageLabelRanges(labelled)).toHaveLength(1);
    const cleared = await writePageLabelRanges(labelled, []);
    expect(await readPageLabelRanges(cleared)).toEqual([]);
    const doc = await PDFDocument.load(cleared);
    expect(doc.catalog.get(PDFName.of('PageLabels'))).toBeUndefined();
  });

  it('un prefijo con acentos viaja bien y dos rangos en la misma página se quedan en uno', async () => {
    const out = await writePageLabelRanges(await make(3), [{ startPage: 0, style: 'D', prefix: 'Planta Baja · ' }, { startPage: 0, style: 'R' }]);
    const ranges2 = await readPageLabelRanges(out);
    expect(ranges2).toHaveLength(1);
    expect(ranges2[0].prefix).toBe('Planta Baja · ');
  });

  it('la escritura no cambia las páginas ni el título del documento', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.setTitle('Plano');
    doc.addPage([600, 400]);
    const out = await writePageLabelRanges(await doc.save(), [{ startPage: 0, style: 'D' }]);
    const back = await PDFDocument.load(out);
    expect(back.getTitle()).toBe('Plano');
    expect(back.getPageCount()).toBe(1);
  });
});
