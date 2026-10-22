import { describe, it, expect } from 'vitest';
/* eslint-disable @typescript-eslint/no-explicit-any */
import zlib from 'zlib';
import { PDFDocument, degrees } from 'pdf-lib';
import { formatPageNumber, numberAnchor, numberPdfPages, parsePageList, DEFAULT_NUMBER_FORMAT, type NumberPagesOptions } from './pageNumbers';

const base: NumberPagesOptions = {
  format: DEFAULT_NUMBER_FORMAT,
  position: 'bottom-center',
  fontSize: 10,
  margin: 20,
  color: '#000000',
  startAt: 1,
  pages: [0, 1, 2],
  font: 'Helvetica',
};

/** Texto de los operadores de contenido de la página, descomprimido. */
const contentOf = (doc: PDFDocument, index: number): string => {
  const target = doc.context.lookup(doc.getPage(index).node.Contents()) as any;
  const refs: unknown[] = Array.isArray(target?.array) ? target.array : [doc.getPage(index).node.Contents()];
  return refs
    .map((ref) => doc.context.lookup(ref as never) as any)
    .filter((st) => st?.contents)
    .map((st) => {
      try {
        return zlib.inflateSync(Buffer.from(st.contents)).toString('latin1');
      } catch {
        return new TextDecoder('latin1').decode(st.contents);
      }
    })
    .join('\n');
};

/** Textos de los `<hex> Tj` del contenido. */
const shown = (content: string): string[] =>
  [...content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => String.fromCharCode(...(m[1].match(/../g) ?? []).map((h) => parseInt(h, 16))));

/** Matriz de texto de la primera línea: [a, b, c, d, e, f]. */
const textMatrix = (content: string): number[] => {
  const m = /(-?[\d.e+-]+) (-?[\d.e+-]+) (-?[\d.e+-]+) (-?[\d.e+-]+) (-?[\d.e+-]+) (-?[\d.e+-]+) Tm/.exec(content);
  return m ? m.slice(1, 7).map(Number) : [];
};

describe('Number Pages: plantilla, lista de páginas y colocación (ADR-0113)', () => {
  it('la plantilla sustituye número, último número, página física y total', () => {
    expect(formatPageNumber('Plano {n}/{total} (hoja {page} de {pages})', { n: 5, total: 12, page: 3, pages: 9 })).toBe('Plano 5/12 (hoja 3 de 9)');
    expect(formatPageNumber('sin marcas', { n: 1, total: 1, page: 1, pages: 1 })).toBe('sin marcas');
  });

  it('la lista de páginas admite rangos y comas, y rechaza lo que no es válido', () => {
    expect(parsePageList('1-3, 5, 8-9', 10)).toEqual([0, 1, 2, 4, 7, 8]);
    expect(parsePageList('2', 3)).toEqual([1]);
    expect(parsePageList('4-2', 10)).toBeNull();
    expect(parsePageList('0', 10)).toBeNull();
    expect(parsePageList('1-11', 10)).toBeNull();
    expect(parsePageList('abc', 10)).toBeNull();
    expect(parsePageList('', 10)).toBeNull();
  });

  it('el ancla va a la izquierda, al centro o a la derecha y sobre o bajo la página', () => {
    const size = { width: 600, height: 400 };
    expect(numberAnchor(size, 'bottom-left', 50, 10, 20)).toEqual({ x: 20, y: 380 });
    expect(numberAnchor(size, 'bottom-center', 50, 10, 20)).toEqual({ x: 275, y: 380 });
    expect(numberAnchor(size, 'bottom-right', 50, 10, 20)).toEqual({ x: 530, y: 380 });
    const top = numberAnchor(size, 'top-right', 50, 10, 20);
    expect(top.x).toBe(530);
    expect(top.y).toBeCloseTo(27.2, 9);
  });
});

describe('Number Pages: estampado en el PDF (ADR-0113)', () => {
  it('estampa un texto por página elegida con el número que le toca, y deja las demás', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 4; i++) doc.addPage([600, 400]);
    const out = await numberPdfPages(await doc.save(), { ...base, pages: [1, 2, 3], startAt: 5, format: 'Hoja {n} de {total}' });
    const back = await PDFDocument.load(out);
    expect(shown(contentOf(back, 0))).toEqual([]);
    expect(shown(contentOf(back, 1))).toEqual(['Hoja 5 de 7']);
    expect(shown(contentOf(back, 3))).toEqual(['Hoja 7 de 7']);
  });

  it('el texto se centra abajo en una página sin rotar', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    const out = await numberPdfPages(await doc.save(), { ...base, pages: [0], format: '1', position: 'bottom-center' });
    const content = contentOf(await PDFDocument.load(out), 0);
    // Un solo carácter de Helvetica 10 pt mide 5.56: x = (600 - 5.56) / 2 y la línea base a 20 del borde inferior
    const [a, b, c, d, e, f] = textMatrix(content);
    expect([a, b, c, d]).toEqual([1, 0, 0, 1]);
    expect(e).toBeCloseTo(297.22, 2);
    expect(f).toBeCloseTo(20, 6);
  });

  it('en una página rotada 90° el texto se gira para leerse derecho en la vista', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    page.setRotation(degrees(90));
    const out = await numberPdfPages(await doc.save(), { ...base, pages: [0], format: 'X', position: 'bottom-left', margin: 30 });
    const content = contentOf(await PDFDocument.load(out), 0);
    // Matriz de texto girada 90° (cos 0, sen 1), con el origen en la esquina inferior izquierda de la vista
    const [a, b, c, d, e, f] = textMatrix(content);
    expect(a).toBeCloseTo(0, 9);
    expect(b).toBeCloseTo(1, 9);
    expect(c).toBeCloseTo(-1, 9);
    expect(d).toBeCloseTo(0, 9);
    expect(e).toBeCloseTo(570, 6);
    expect(f).toBeCloseTo(30, 6);
  });

  it('los caracteres que la fuente estándar no dibuja se cambian por ? y no rompen el estampado', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    const out = await numberPdfPages(await doc.save(), { ...base, pages: [0], format: '日本 {n}' });
    expect(shown(contentOf(await PDFDocument.load(out), 0))).toEqual(['?? 1']);
  });
});
