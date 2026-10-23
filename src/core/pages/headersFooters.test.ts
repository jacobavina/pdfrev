/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { PDFDocument, degrees } from 'pdf-lib';
import { baseFileName, EMPTY_SLOTS, fillFields, formatDate, formatTime, hasAnySlot, resolveSlots, stampHeadersFooters, type HeaderFooterOptions } from './headersFooters';

const NOW = new Date(2026, 9, 22, 8, 5); // 22 oct 2026, 08:05 hora local

const base: HeaderFooterOptions = {
  slots: { ...EMPTY_SLOTS },
  fontSize: 9,
  margin: 20,
  color: '#444444',
  font: 'Helvetica',
  startAt: 1,
  pages: [0, 1, 2],
  fileName: 'C:\\planos\\Obra Norte.pdf',
  title: 'Planta baja',
  now: NOW,
};

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
const shown = (content: string): string[] =>
  [...content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => String.fromCharCode(...(m[1].match(/../g) ?? []).map((h) => parseInt(h, 16))));

describe('Headers & Footers: campos y ranuras (ADR-0114)', () => {
  it('rellena número, total, página, hojas, fecha, hora, archivo y título, y deja intacto lo desconocido', () => {
    const v = { n: 5, total: 12, page: 3, pages: 9, date: '2026-10-22', time: '08:05', file: 'Obra Norte', title: 'Planta baja' };
    expect(fillFields('{file} · {title} · {date} {time} · {n}/{total} · hoja {page} de {pages} · {otro}', v)).toBe(
      'Obra Norte · Planta baja · 2026-10-22 08:05 · 5/12 · hoja 3 de 9 · {otro}'
    );
  });

  it('la fecha y la hora salen con dos dígitos y el archivo sin carpeta ni extensión', () => {
    expect(formatDate(new Date(2026, 0, 3))).toBe('2026-01-03');
    expect(formatTime(new Date(2026, 0, 3, 7, 4))).toBe('07:04');
    expect(baseFileName('C:\\planos\\Obra Norte.PDF')).toBe('Obra Norte');
    expect(baseFileName('/home/u/plano.pdf')).toBe('plano');
  });

  it('solo se estampan las ranuras con contenido, cada una en su sitio', () => {
    const opts = { ...base, slots: { ...EMPTY_SLOTS, headerRight: '{date}', footerCenter: 'Página {page} de {pages}' } };
    expect(hasAnySlot(opts.slots)).toBe(true);
    expect(hasAnySlot(EMPTY_SLOTS)).toBe(false);
    expect(resolveSlots(opts, 1, 1, 3)).toEqual([
      { position: 'top-right', text: '2026-10-22' },
      { position: 'bottom-center', text: 'Página 2 de 3' },
    ]);
  });

  it('el número empieza en el valor pedido y {total} es el último número', () => {
    const opts = { ...base, startAt: 10, pages: [1, 2], slots: { ...EMPTY_SLOTS, footerLeft: '{n}/{total}' } };
    expect(resolveSlots(opts, 0, 1, 3)[0].text).toBe('10/11');
    expect(resolveSlots(opts, 1, 2, 3)[0].text).toBe('11/11');
  });
});

describe('Headers & Footers: estampado en el PDF (ADR-0114)', () => {
  it('estampa las seis ranuras en las páginas elegidas y deja las demás', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([600, 400]);
    const slots = { headerLeft: 'A', headerCenter: 'B', headerRight: 'C', footerLeft: 'D', footerCenter: 'E', footerRight: 'F' };
    const out = await stampHeadersFooters(await doc.save(), { ...base, slots, pages: [0, 2] });
    const back = await PDFDocument.load(out);
    expect(shown(contentOf(back, 0)).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(shown(contentOf(back, 1))).toEqual([]);
    expect(shown(contentOf(back, 2))).toHaveLength(6);
  });

  it('un campo cambia de una página a otra y la página rotada se estampa también', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    doc.addPage([600, 400]).setRotation(degrees(90));
    const out = await stampHeadersFooters(await doc.save(), { ...base, pages: [0, 1], slots: { ...EMPTY_SLOTS, footerCenter: 'Hoja {n}' } });
    const back = await PDFDocument.load(out);
    expect(shown(contentOf(back, 0))).toEqual(['Hoja 1']);
    expect(shown(contentOf(back, 1))).toEqual(['Hoja 2']);
    // La página rotada gira el texto: matriz con coseno 0
    expect(contentOf(back, 1)).toMatch(/0\.0*6\d* 1 -1 0\.0*6\d*|\b0 1 -1 0\b/);
  });

  it('sin ranuras no se escribe nada', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([600, 400]);
    const out = await stampHeadersFooters(await doc.save(), base);
    expect(shown(contentOf(await PDFDocument.load(out), 0))).toEqual([]);
  });
});
