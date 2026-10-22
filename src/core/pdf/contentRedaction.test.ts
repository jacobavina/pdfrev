import { describe, it, expect } from 'vitest';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { drawBlackBoxes, redactPageContent } from './contentRedaction';
import { parseContentStream, writeOperation } from './contentStream';
import { getHelveticaTextWidth } from '../markup/helveticaMetrics';

const PNG_1X1 = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
);

/** Todos los flujos de contenido de la página, descomprimidos, como una cadena latin1. */
async function rawContent(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
  let out = '';
  for (const s of streams) {
    if (s instanceof PDFStream) out += Buffer.from(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents()).toString('latin1');
  }
  return out;
}

async function textItems(bytes: Uint8Array) {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  return content.items.filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i && i.str.trim() !== '');
}

const hex = (s: string) => Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();

async function textPage() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Cliente: ACME SA FIN', { x: 50, y: 200, size: 12, font });
  page.drawText('Presupuesto: 12.500 USD', { x: 50, y: 150, size: 12, font });
  return doc.save();
}

describe('Redacción por contenido (ADR-0103)', () => {
  it('TEST DE ORO: aplicar redacción elimina físicamente el texto del content stream y PDF.js ya no puede extraerlo', async () => {
    const original = await textPage();
    expect((await textItems(original)).map((i) => i.str).join(' ')).toContain('ACME SA');
    // Caja sobre "ACME SA" de la primera línea
    const x0 = 50 + getHelveticaTextWidth('Cliente: ', 12);
    const x1 = 50 + getHelveticaTextWidth('Cliente: ACME SA', 12);
    const rect = { x0: x0 - 0.2, y0: 195, x1: x1 + 0.2, y1: 215 };
    const r = await redactPageContent(original, 0, [rect]);
    const final = await drawBlackBoxes(r.pdfBytes, 0, [rect]);
    expect(r.removedGlyphs).toBe('ACME SA'.length);
    expect(r.rasterReasons).toEqual([]);

    // Ni PDF.js ni el contenido en bruto conservan lo redactado
    const text = (await textItems(final)).map((i) => i.str).join(' ');
    expect(text).not.toContain('ACME');
    expect(text).not.toContain('SA');
    expect(text).toContain('Cliente:');
    expect(text).toContain('FIN');
    expect(text).toContain('Presupuesto: 12.500 USD');
    const raw = await rawContent(final);
    for (const secret of ['ACME', 'A', 'C', 'M', 'E'].slice(0, 1)) expect(raw).not.toContain(secret);
    expect(raw.toUpperCase()).not.toContain(hex('ACME'));
    expect(Buffer.from(final).toString('latin1')).not.toContain('ACME');
    // La caja negra opaca está dibujada
    expect(raw).toMatch(/0 0 0 rg[\s\S]*re f/);
  });

  it('el texto que sigue a lo redactado se queda en su sitio y las líneas de fuera no se tocan', async () => {
    const original = await textPage();
    const before = await textItems(original);
    const finIndexBefore = 'Cliente: ACME SA FIN'.indexOf('FIN');
    const finXBefore = 50 + getHelveticaTextWidth('Cliente: ACME SA '.slice(0, finIndexBefore), 12);
    const x0 = 50 + getHelveticaTextWidth('Cliente: ', 12);
    const x1 = 50 + getHelveticaTextWidth('Cliente: ACME SA', 12);
    const { pdfBytes } = await redactPageContent(original, 0, [{ x0: x0 - 0.2, y0: 195, x1: x1 + 0.2, y1: 215 }]);
    const after = await textItems(pdfBytes);
    const fin = after.find((i) => i.str.includes('FIN'))!;
    // pdf.js parte la línea en el ajuste de TJ: el texto "FIN" empieza donde empezaba
    const finStart = fin.transform[4] + getHelveticaTextWidth(fin.str.slice(0, fin.str.indexOf('FIN')), 12);
    expect(finStart).toBeCloseTo(finXBefore, 0);
    // La segunda línea es idéntica
    const line2 = (items: typeof before) => items.find((i) => i.str.startsWith('Presupuesto'))!;
    expect(line2(after).str).toBe(line2(before).str);
    expect(line2(after).transform[4]).toBeCloseTo(line2(before).transform[4], 3);
  });

  it('quita los trazados que caen enteros dentro de la caja y deja los que solo la cruzan', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    page.drawRectangle({ x: 100, y: 100, width: 30, height: 20, borderColor: rgb(1, 0, 0), borderWidth: 1 }); // dentro
    page.drawLine({ start: { x: 20, y: 110 }, end: { x: 380, y: 110 }, thickness: 1, color: rgb(0, 0, 1) }); // cruza
    page.drawRectangle({ x: 300, y: 200, width: 20, height: 20, color: rgb(0, 1, 0) }); // fuera
    const original = await doc.save();
    const r = await redactPageContent(original, 0, [{ x0: 90, y0: 90, x1: 140, y1: 130 }]);
    expect(r.removedPaths).toBe(1);
    const raw = await rawContent(r.pdfBytes);
    // Cada rectángulo de pdf-lib termina en "h": del par de rectángulos solo queda el de fuera, y la línea sigue entera
    const closes = (c: string) => (c.match(/^h$/gm) ?? []).length;
    expect(closes(await rawContent(original))).toBe(2);
    expect(closes(raw)).toBe(1);
    expect(raw).toContain('1 0 0 1 300 200 cm');
    expect(raw).toContain('20 110 m');
    expect(raw).toContain('380 110 l');
  });

  it('una imagen bajo la redacción pide rasterizar la página y una que no la toca, no', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const img = await doc.embedPng(PNG_1X1);
    page.drawImage(img, { x: 100, y: 100, width: 50, height: 50 });
    const original = await doc.save();
    expect((await redactPageContent(original, 0, [{ x0: 110, y0: 110, x1: 130, y1: 130 }])).rasterReasons).toEqual(['an image overlaps the redaction']);
    expect((await redactPageContent(original, 0, [{ x0: 300, y0: 10, x1: 380, y1: 40 }])).rasterReasons).toEqual([]);
  });

  it('con TJ, interletrado y Tz el texto quitado tampoco queda y lo demás conserva su posición', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(' ', { x: 1, y: 1, size: 1, font });
    const fontKey = Array.from(page.node.Resources()!.lookup(PDFName.of('Font'), (await import('pdf-lib')).PDFDict).keys())[0].asString().slice(1);
    const content = `BT /${fontKey} 12 Tf 50 100 Td 1 Tc 80 Tz [(SECRETO) -300 (PUBLICO)] TJ ET`;
    page.node.addContentStream(doc.context.register(doc.context.stream(content)));
    const original = await doc.save();
    // Ancho de "SECRETO" con Tc = 1 y Tz = 80 %
    const w = (getHelveticaTextWidth('SECRETO', 12) + 7 * 1) * 0.8;
    const r = await redactPageContent(original, 0, [{ x0: 49, y0: 95, x1: 50 + w - 0.5, y1: 115 }]);
    expect(r.removedGlyphs).toBe(7);
    const raw = await rawContent(r.pdfBytes);
    expect(raw.toUpperCase()).not.toContain(hex('SECRETO'));
    expect(raw).not.toContain('SECRETO');
    const text = (await textItems(r.pdfBytes)).map((i) => i.str).join(' ');
    expect(text).not.toContain('SECRETO');
    expect(text).toContain('PUBLICO');
  });

  it('el lector del flujo de contenido conserva cadenas con escapes, matrices e imágenes en línea', () => {
    const stream = 'q 1 0 0 1 10 20 cm BT /F1 12 Tf (a\\(b\\)\\101\\n) Tj [(x) -20 <4142>] TJ ET BI /W 1 /H 1 /BPC 8 /CS /G ID \u0001 EI Q';
    const ops = parseContentStream(stream);
    expect(ops.map((o) => o.op)).toEqual(['q', 'cm', 'BT', 'Tf', 'Tj', 'TJ', 'ET', 'BI', 'Q']);
    expect(ops[4].operands[0]).toEqual({ t: 'str', v: 'a(b)A\n' });
    expect(ops[5].operands[0]).toEqual({ t: 'arr', items: [{ t: 'str', v: 'x' }, { t: 'num', v: -20 }, { t: 'str', v: 'AB' }] });
    // Los datos llegan hasta el EI, con el espacio que lo precede
    expect(ops[7].inline?.data.trim()).toBe('\u0001');
    expect(writeOperation('TJ', [ops[5].operands[0]])).toBe('[<78> -20 <4142>] TJ');
  });
});
