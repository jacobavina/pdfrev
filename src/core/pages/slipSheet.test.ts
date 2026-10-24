import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { matchSheets, sheetKey, slipSheetPdf } from './slipSheet';

/** PDF cuyas páginas se distinguen por su ancho: 100 + 10 × el número que se le da. */
async function pdfOf(ids: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const id of ids) doc.addPage([100 + id * 10, 200]);
  return doc.save();
}
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

describe('Slip Sheet (ADR-0129)', () => {
  it('lee el número de lámina del cajetín sin importar guiones, espacios ni mayúsculas', () => {
    expect(sheetKey('PLANTA BAJA  Escala 1:100  A-101')).toBe('A101');
    expect(sheetKey('sheet A 101')).toBe('A101');
    expect(sheetKey('a-101')).toBe('A101');
    expect(sheetKey('S2.01 ESTRUCTURA')).toBe('S2.01');
    expect(sheetKey('E-3')).toBe('E3');
  });

  it('toma el último candidato (el cajetín va al final) e ignora unidades y números sueltos', () => {
    expect(sheetKey('Ver detalle D-12 en la lámina A-301')).toBe('A301');
    expect(sheetKey('Dimensiones de página: 800pt x 600pt')).toBeNull();
    expect(sheetKey('Escala 1:50 REV 3 PT 2 MM 5')).toBeNull();
    expect(sheetKey('')).toBeNull();
    expect(sheetKey('Plano de prueba página 1 de 3')).toBeNull();
  });

  it('empareja por número de lámina aunque la revisión venga en otro orden o con láminas de más', () => {
    const m = matchSheets(['A101', 'A102', 'S201', null], ['S201', 'A103', 'A101', 'A102']);
    expect(m.map((x) => x.newIndex)).toEqual([2, 3, 0, null]);
    expect(m.slice(0, 3).every((x) => x.by === 'sheet')).toBe(true);
    expect(m[3]).toEqual({ oldIndex: 3, newIndex: null, by: null });
  });

  it('cada lámina nueva se usa una sola vez', () => {
    const m = matchSheets(['A101', 'A101'], ['A101']);
    expect(m.map((x) => x.newIndex)).toEqual([0, null]);
  });

  it('si ninguna lámina coincide (sin texto) empareja por posición hasta donde alcance la revisión', () => {
    const m = matchSheets([null, null, null], [null, null]);
    expect(m.map((x) => [x.newIndex, x.by])).toEqual([[0, 'order'], [1, 'order'], [null, null]]);
  });

  it('sustituye cada página en su sitio sin mover las demás', async () => {
    const old = await pdfOf([1, 2, 3, 4]);
    const next = await pdfOf([7, 8, 9]);
    const r = await slipSheetPdf(old, next, [{ oldIndex: 3, newIndex: 0 }, { oldIndex: 1, newIndex: 2 }]);
    expect(await widths(r.bytes)).toEqual([110, 190, 130, 170]);
    expect(r).toMatchObject({ replaced: 2, appended: 0 });
  });

  it('añade al final las láminas nuevas que se piden', async () => {
    const r = await slipSheetPdf(await pdfOf([1, 2]), await pdfOf([5, 6, 7]), [{ oldIndex: 0, newIndex: 1 }], [2]);
    expect(await widths(r.bytes)).toEqual([160, 120, 170]);
    expect(r).toMatchObject({ replaced: 1, appended: 1 });
  });

  it('rechaza lo que no se puede hacer', async () => {
    const old = await pdfOf([1, 2]);
    const next = await pdfOf([5]);
    await expect(slipSheetPdf(old, next, [])).rejects.toThrow(/nothing to replace/);
    await expect(slipSheetPdf(old, next, [{ oldIndex: 5, newIndex: 0 }])).rejects.toThrow(/outside this document/);
    await expect(slipSheetPdf(old, next, [{ oldIndex: 0, newIndex: 3 }])).rejects.toThrow(/outside the other PDF/);
    await expect(slipSheetPdf(old, next, [{ oldIndex: 0, newIndex: 0 }, { oldIndex: 0, newIndex: 0 }])).rejects.toThrow(/replaced twice/);
  });
});
