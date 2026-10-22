import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfHeaderVersion, readDocumentProperties, splitKeywords, writeDocumentProperties } from './documentProperties';

const make = async (setup?: (d: PDFDocument) => void) => {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.addPage([612, 792]);
  setup?.(doc);
  return doc.save();
};

describe('Document Properties (ADR-0113)', () => {
  it('lee los metadatos, la versión, el número de páginas, el tamaño y el tamaño del archivo', async () => {
    const bytes = await make((d) => {
      d.setTitle('Plano A-101');
      d.setAuthor('Estudio');
      d.setSubject('Planta baja');
      d.setKeywords(['obra', 'estructura']);
      d.setCreator('REA');
      d.setProducer('pdf-lib');
      d.setCreationDate(new Date('2026-01-02T03:04:05Z'));
      d.addPage([1224, 792]);
    });
    const p = await readDocumentProperties(bytes);
    expect(p).toMatchObject({ title: 'Plano A-101', author: 'Estudio', subject: 'Planta baja', keywords: 'obra estructura', creator: 'REA', pageCount: 2, encrypted: false, fileSize: bytes.length });
    expect(p.created?.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(p.version).toMatch(/^1\.\d$/);
    expect(p.firstPageSize).toEqual({ width: 612, height: 792 });
    expect(p.mixedPageSizes).toBe(true);
  });

  it('un PDF sin metadatos se lee con campos vacíos y sin fechas', async () => {
    const p = await readDocumentProperties(await make());
    expect(p.title).toBe('');
    expect(p.author).toBe('');
    expect(p.modified).toBeNull();
    expect(p.mixedPageSizes).toBe(false);
  });

  it('el tamaño de página tiene en cuenta la rotación', async () => {
    const bytes = await make((d) => d.getPage(0).setRotation({ type: 'degrees', angle: 90 } as never));
    expect((await readDocumentProperties(bytes)).firstPageSize).toEqual({ width: 792, height: 612 });
  });

  it('escribe título, autor, asunto y palabras clave, y un campo vacío se quita', async () => {
    const original = await make((d) => {
      d.setTitle('Viejo');
      d.setAuthor('Alguien');
    });
    const when = new Date('2026-10-22T10:00:00Z');
    const out = await writeDocumentProperties(original, { title: 'Nuevo', author: '', subject: 'Asunto', keywords: 'a, b; a ,, c' }, when);
    const p = await readDocumentProperties(out);
    expect(p.title).toBe('Nuevo');
    expect(p.author).toBe('');
    expect(p.subject).toBe('Asunto');
    expect(p.keywords).toBe('a b c');
    expect(p.modified?.toISOString()).toBe(when.toISOString());
  });

  it('escribir no cambia el productor ni las páginas', async () => {
    const original = await make((d) => d.setProducer('Otro programa'));
    const out = await writeDocumentProperties(original, { title: 'T', author: '', subject: '', keywords: '' });
    const p = await readDocumentProperties(out);
    expect(p.producer).toBe('Otro programa');
    expect(p.pageCount).toBe(1);
  });

  it('la versión sale de la cabecera y las palabras clave se limpian', () => {
    expect(pdfHeaderVersion(new TextEncoder().encode('%PDF-1.4\n...'))).toBe('1.4');
    expect(pdfHeaderVersion(new Uint8Array([1, 2, 3]))).toBe('');
    expect(splitKeywords(' x ; y,x ,, z')).toEqual(['x', 'y', 'z']);
  });
});
