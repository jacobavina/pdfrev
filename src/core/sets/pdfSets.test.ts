import { describe, it, expect } from 'vitest';
import { MAX_FILES_PER_SET, addFilesToSet, comparablePath, fileNameOf, moveFileInSet, parseStoredSets, removeFileFromSet, serializeSets, uniqueSetName, type PdfSet } from './pdfSets';

const set = (id: string, name: string, paths: string[] = []): PdfSet => ({ id, name, createdAt: '', files: paths.map((p) => ({ path: p, name: fileNameOf(p) })) });

describe('Sets: conjuntos de documentos (ADR-0119)', () => {
  it('el nombre del archivo sale de rutas de Windows y de Unix, y las rutas se comparan sin mayúsculas ni barras', () => {
    expect(fileNameOf('C:\\planos\\A-101.pdf')).toBe('A-101.pdf');
    expect(fileNameOf('/home/u/B.pdf')).toBe('B.pdf');
    expect(comparablePath('C:\\Planos\\A.PDF')).toBe(comparablePath('c:/planos/a.pdf'));
  });

  it('un nombre repetido recibe un número, sin distinguir mayúsculas, y el propio conjunto no cuenta contra sí mismo', () => {
    const sets = [set('1', 'Obra'), set('2', 'obra (2)')];
    expect(uniqueSetName('OBRA', sets)).toBe('OBRA (3)');
    expect(uniqueSetName('Otro', sets)).toBe('Otro');
    expect(uniqueSetName('Obra', sets, '1')).toBe('Obra');
    expect(uniqueSetName('   ', sets)).toBe('New set');
    expect(uniqueSetName('x'.repeat(200), []).length).toBe(80);
  });

  it('añadir archivos los pone al final, sin repetir ni aceptar lo que no es PDF, y cuenta cada caso', () => {
    const s = set('1', 'Obra', ['C:\\p\\a.pdf']);
    const r = addFilesToSet(s, ['c:/P/A.PDF', 'C:\\p\\b.pdf', 'C:\\p\\c.txt', 'C:\\p\\b.pdf']);
    expect(r.set.files.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(r).toMatchObject({ added: 1, duplicates: 2, overflow: 0 });
    expect(s.files).toHaveLength(1); // el original no cambia
  });

  it('no pasa del máximo de archivos por conjunto', () => {
    const full = set('1', 'Grande', Array.from({ length: MAX_FILES_PER_SET }, (_, i) => `C:\\p\\${i}.pdf`));
    const r = addFilesToSet(full, ['C:\\p\\nuevo.pdf']);
    expect(r).toMatchObject({ added: 0, overflow: 1 });
    expect(r.set.files).toHaveLength(MAX_FILES_PER_SET);
  });

  it('quitar y mover archivos', () => {
    const s = set('1', 'Obra', ['C:\\p\\a.pdf', 'C:\\p\\b.pdf', 'C:\\p\\c.pdf']);
    expect(removeFileFromSet(s, 'c:/P/B.pdf').files.map((f) => f.name)).toEqual(['a.pdf', 'c.pdf']);
    expect(moveFileInSet(s, 2, 0).files.map((f) => f.name)).toEqual(['c.pdf', 'a.pdf', 'b.pdf']);
    expect(moveFileInSet(s, 0, 1).files.map((f) => f.name)).toEqual(['b.pdf', 'a.pdf', 'c.pdf']);
    expect(moveFileInSet(s, 0, 9)).toBe(s);
    expect(moveFileInSet(s, 1, 1)).toBe(s);
  });

  it('lo guardado vuelve igual, y lo corrupto o con otra forma se descarta sin romper el resto', () => {
    const sets = [set('1', 'Obra', ['C:\\p\\a.pdf', 'C:\\p\\b.pdf']), set('2', 'Vacío')];
    expect(parseStoredSets(serializeSets(sets))).toEqual(sets);
    expect(parseStoredSets(null)).toEqual([]);
    expect(parseStoredSets('no es json')).toEqual([]);
    expect(parseStoredSets('{"v":1,"sets":"x"}')).toEqual([]);
    const messy = JSON.stringify({
      v: 1,
      sets: [
        { id: 'ok', name: 'Bueno', files: [{ path: 'C:\\p\\a.pdf' }, { path: 'c:/P/A.pdf' }, { nope: 1 }, { path: '' }], createdAt: 5 },
        { id: 7, name: 'sin id válido', files: [] },
        null,
        { id: 'sinfiles', name: 'x' },
      ],
    });
    const parsed = parseStoredSets(messy);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ id: 'ok', name: 'Bueno', files: [{ path: 'C:\\p\\a.pdf', name: 'a.pdf' }], createdAt: '' });
  });
});
