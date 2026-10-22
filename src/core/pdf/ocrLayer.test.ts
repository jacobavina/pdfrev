import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { addInvisibleTextLayer, displayedToUser, ocrTextOperators, winAnsiHex } from './ocrLayer';

async function blankPdf(w = 400, h = 300, rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([w, h]);
  if (rotation) page.setRotation(degrees(rotation));
  return doc.save();
}

async function textItems(bytes: Uint8Array, pageNo = 1) {
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true }).promise;
  const page = await pdf.getPage(pageNo);
  const content = await page.getTextContent();
  return content.items.filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i && i.str.trim() !== '');
}

const IMAGE = { width: 800, height: 600 };

describe('Capa de texto invisible del OCR (ADR-0102)', () => {
  it('inserta palabras reconocidas por OCR como texto invisible /Tr 3 en la página y permite buscarlas y resaltarlas', async () => {
    const original = await blankPdf();
    const { pdfBytes, written } = await addInvisibleTextLayer(
      original,
      0,
      [
        { text: 'PLANO', x: 100, y: 100, width: 160, height: 40 },
        { text: 'Cota', x: 300, y: 300, width: 100, height: 36 },
        { text: '12°', x: 420, y: 300, width: 80, height: 36 },
      ],
      IMAGE
    );
    expect(written).toBe(3);
    // El texto se puede extraer y buscar
    const items = await textItems(pdfBytes);
    expect(items.map((i) => i.str)).toEqual(['PLANO', 'Cota', '12°']);
    // Cada palabra queda en su sitio: la imagen es el doble de grande que la página
    const plano = items[0].transform;
    expect(plano[4]).toBeCloseTo(50, 0);
    expect(plano[5]).toBeCloseTo((1 - (100 + 40 * 0.82) / 600) * 300, 0);
    // Está dibujada sin trazo ni relleno: el modo de dibujo 3 va en el contenido
    const raw = Buffer.from(pdfBytes).toString('latin1');
    expect(raw).toContain('3 Tr');
    // La página sigue teniendo su tamaño
    expect((await PDFDocument.load(pdfBytes)).getPage(0).getSize()).toEqual({ width: 400, height: 300 });
  });

  it('el texto acentuado se conserva y lo que no cabe en WinAnsi pasa a interrogación', () => {
    expect(winAnsiHex('Ñandú 12°')).toBe('D1616E64FA203132B0');
    expect(winAnsiHex('Ω')).toBe('3F');
  });

  it('en una página girada 90° el texto sigue la orientación del plano y se puede extraer', async () => {
    // Página de 400 × 300 vista a 90°: la imagen mostrada es de 300 × 400
    const original = await blankPdf(400, 300, 90);
    const { pdfBytes } = await addInvisibleTextLayer(original, 0, [{ text: 'GIRADO', x: 30, y: 40, width: 120, height: 30 }], { width: 600, height: 800 });
    const items = await textItems(pdfBytes);
    expect(items.map((i) => i.str)).toEqual(['GIRADO']);
    // El texto no es horizontal en el espacio de usuario: el eje del texto es el eje v de la página
    const [a, b] = items[0].transform;
    expect(Math.abs(a)).toBeLessThan(1e-6);
    expect(Math.abs(b)).toBeGreaterThan(0);
  });

  it('las cuatro rotaciones llevan el origen de la imagen a la esquina correcta de la página', () => {
    const W = 400;
    const H = 300;
    // Esquina superior izquierda de la imagen mostrada
    expect(displayedToUser(0, 0, 0, W, H)).toMatchObject({ u: 0, v: H });
    expect(displayedToUser(0, 0, 90, W, H)).toMatchObject({ u: 0, v: 0 });
    expect(displayedToUser(0, 0, 180, W, H)).toMatchObject({ u: W, v: 0 });
    expect(displayedToUser(0, 0, 270, W, H)).toMatchObject({ u: W, v: H });
    // Esquina inferior derecha
    expect(displayedToUser(1, 1, 0, W, H)).toMatchObject({ u: W, v: 0 });
    expect(displayedToUser(1, 1, 90, W, H)).toMatchObject({ u: W, v: H });
    expect(displayedToUser(1, 1, 180, W, H)).toMatchObject({ u: 0, v: H });
    expect(displayedToUser(1, 1, 270, W, H)).toMatchObject({ u: 0, v: 0 });
  });

  it('descarta palabras vacías o sin caja y no toca el PDF si no queda ninguna', async () => {
    const original = await blankPdf();
    const out = await addInvisibleTextLayer(original, 0, [{ text: '  ', x: 1, y: 1, width: 5, height: 5 }, { text: 'x', x: 1, y: 1, width: 0, height: 5 }], IMAGE);
    expect(out.written).toBe(0);
    expect(out.pdfBytes).toBe(original);
    expect(ocrTextOperators([], IMAGE, 0, 400, 300)).toBe('q\nQ');
  });
});
