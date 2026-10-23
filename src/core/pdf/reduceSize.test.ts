import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFArray } from 'pdf-lib';
import { QUALITY_PRESETS, reducePdfSize, targetSize, worthKeeping, type ImageCodec, type RasterImage } from './reduceSize';

/** PNG RGB de `w`×`h` con un degradado y ruido (que casi no se comprime) para tener un flujo Flate grande. */
function makePng(w: number, h: number, alpha = false): Uint8Array {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc((w * channels + 1) * h);
  let seed = 12345;
  for (let y = 0; y < h; y++) {
    raw[y * (w * channels + 1)] = 0;
    for (let x = 0; x < w * channels; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      raw[y * (w * channels + 1) + 1 + x] = (seed >>> 24) & 0xff;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** Códec simulado: el JPEG de salida mide `bytesPerPixel` bytes por píxel de destino, y se anotan las llamadas. */
function fakeCodec(bytesPerPixel: number) {
  const calls: { kind: string; target: { width: number; height: number }; quality?: number }[] = [];
  const codec: ImageCodec = {
    async decodeJpeg(_jpeg, target) {
      calls.push({ kind: 'decodeJpeg', target });
      return { width: target.width, height: target.height, rgba: new Uint8ClampedArray(target.width * target.height * 4) } as RasterImage;
    },
    async encodeJpeg(_img, target, quality) {
      calls.push({ kind: 'encodeJpeg', target, quality });
      return new Uint8Array(Math.max(10, Math.round(target.width * target.height * bytesPerPixel)));
    },
  };
  return { codec, calls };
}

const imagesOf = (doc: PDFDocument) =>
  [...doc.context.enumerateIndirectObjects()].filter(([, o]) => o instanceof PDFRawStream && (o as PDFRawStream).dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image').map(([, o]) => o as PDFRawStream);

const withImage = async (png: Uint8Array) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  page.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: 300, height: 200 });
  return doc.save();
};

describe('Reduce File Size (ADR-0126)', () => {
  it('el tamaño de destino conserva la proporción y no agranda', () => {
    expect(targetSize(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000, scaled: true });
    expect(targetSize(1000, 3000, 1500)).toEqual({ width: 500, height: 1500, scaled: true });
    expect(targetSize(800, 600, 2000)).toEqual({ width: 800, height: 600, scaled: false });
    expect(targetSize(10000, 1, 100).height).toBe(1);
    expect(QUALITY_PRESETS.low.maxSide).toBeLessThan(QUALITY_PRESETS.medium.maxSide);
    expect(QUALITY_PRESETS.medium.maxSide).toBeLessThan(QUALITY_PRESETS.high.maxSide);
    expect(QUALITY_PRESETS.low.jpeg).toBeLessThan(QUALITY_PRESETS.high.jpeg);
  });

  it('solo se acepta una recompresión que ahorra al menos un 10 %', () => {
    expect(worthKeeping(1000, 899)).toBe(true);
    expect(worthKeeping(1000, 900)).toBe(false);
    expect(worthKeeping(1000, 1200)).toBe(false);
  });

  it('una imagen grande se reduce, se recomprime como JPEG y el archivo pesa menos', async () => {
    const original = await withImage(makePng(1600, 1200));
    const { codec, calls } = fakeCodec(0.2);
    const { bytes, report } = await reducePdfSize(original, 'low', codec);
    // low = 1200 px de lado mayor: 1600×1200 pasa a 1200×900
    expect(calls.at(-1)).toMatchObject({ kind: 'encodeJpeg', target: { width: 1200, height: 900 }, quality: QUALITY_PRESETS.low.jpeg });
    expect(report).toMatchObject({ imagesSeen: 1, imagesReduced: 1, before: original.length });
    expect(report.after).toBeLessThan(original.length / 2);
    expect(bytes.length).toBe(report.after);
    const [img] = imagesOf(await PDFDocument.load(bytes));
    expect(img.dict.lookup(PDFName.of('Filter'))?.toString()).toBe('/DCTDecode');
    expect((img.dict.lookup(PDFName.of('Width')) as PDFNumber).asNumber()).toBe(1200);
    expect((img.dict.lookup(PDFName.of('Height')) as PDFNumber).asNumber()).toBe(900);
    expect(img.dict.lookup(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceRGB');
  });

  it('una imagen que ya cabe y es pequeña no se toca; una Flate grande se pasa a JPEG aunque no haya que reducirla', async () => {
    const small = await withImage(makePng(40, 30));
    const r1 = await reducePdfSize(small, 'high', fakeCodec(0.2).codec);
    expect(r1.report).toMatchObject({ imagesSeen: 1, imagesReduced: 0 });
    expect(r1.report.skipped).toEqual([{ cause: 'Already small enough', count: 1 }]);
    const big = await withImage(makePng(500, 400));
    const { calls } = fakeCodec(0.2);
    const r2 = await reducePdfSize(big, 'high', fakeCodec(0.2).codec);
    expect(r2.report.imagesReduced).toBe(1);
    expect(calls).toEqual([]);
  });

  it('si el JPEG saldría más grande se deja la imagen como estaba', async () => {
    const original = await withImage(makePng(1600, 1200));
    const r = await reducePdfSize(original, 'low', fakeCodec(50).codec);
    expect(r.report.imagesReduced).toBe(0);
    expect(r.report.skipped).toEqual([{ cause: 'Would not get smaller', count: 1 }]);
    const [img] = imagesOf(await PDFDocument.load(r.bytes));
    expect(img.dict.lookup(PDFName.of('Width'))?.toString()).toBe('1600');
  });

  it('la transparencia se conserva: la máscara sigue enlazada a la imagen nueva', async () => {
    const original = await withImage(makePng(1600, 1200, true));
    const before = imagesOf(await PDFDocument.load(original));
    expect(before.some((i) => i.dict.get(PDFName.of('SMask')))).toBe(true);
    const { bytes, report } = await reducePdfSize(original, 'low', fakeCodec(0.2).codec);
    expect(report.imagesReduced).toBeGreaterThanOrEqual(1);
    const after = imagesOf(await PDFDocument.load(bytes));
    const main = after.find((i) => i.dict.lookup(PDFName.of('Filter'))?.toString() === '/DCTDecode')!;
    expect(main.dict.get(PDFName.of('SMask'))).toBeDefined();
  });

  it('las imágenes en blanco y negro y las máscaras no se tocan', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const stream = PDFRawStream.of(
      doc.context.obj({ Type: 'XObject', Subtype: 'Image', Width: 5000, Height: 5000, BitsPerComponent: 1, ColorSpace: 'DeviceGray', Filter: 'CCITTFaxDecode' }) as PDFDict,
      new Uint8Array(1000)
    );
    doc.context.register(stream);
    const { report } = await reducePdfSize(await doc.save(), 'low', fakeCodec(0.2).codec);
    expect(report.imagesReduced).toBe(0);
    expect(report.skipped).toEqual([{ cause: 'Black and white scans and masks', count: 1 }]);
  });

  it('un JPEG grande se decodifica ya escalado y se vuelve a codificar', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 100]);
    const dict = doc.context.obj({ Type: 'XObject', Subtype: 'Image', Width: 3000, Height: 2000, BitsPerComponent: 8, ColorSpace: 'DeviceRGB', Filter: 'DCTDecode' }) as PDFDict;
    const ref = doc.context.register(PDFRawStream.of(dict, new Uint8Array(400000)));
    page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Im0: ref } }) as PDFDict);
    const { codec, calls } = fakeCodec(0.05);
    const r = await reducePdfSize(await doc.save(), 'medium', codec);
    expect(calls[0]).toMatchObject({ kind: 'decodeJpeg', target: { width: 2000, height: 1333 } });
    expect(r.report.imagesReduced).toBe(1);
    expect(r.report.after).toBeLessThan(r.report.before / 2);
  });

  it('sin códec solo reescribe el archivo y lo explica; un PDF sin imágenes no crece', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const original = await doc.save();
    const r = await reducePdfSize(original, 'medium', null);
    expect(r.report.imagesSeen).toBe(0);
    expect(r.bytes.length).toBeLessThanOrEqual(original.length);
    const withImg = await withImage(makePng(800, 600));
    const r2 = await reducePdfSize(withImg, 'medium', null);
    expect(r2.report.skipped).toEqual([{ cause: 'No image codec available', count: 1 }]);
  });

  it('el resultado sigue siendo un PDF válido con sus páginas, y el progreso llega al total', async () => {
    const original = await withImage(makePng(1600, 1200));
    const progress: string[] = [];
    const { bytes } = await reducePdfSize(original, 'medium', fakeCodec(0.2).codec, (d, t) => progress.push(`${d}/${t}`));
    const back = await PDFDocument.load(bytes);
    expect(back.getPageCount()).toBe(1);
    expect(back.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)).toBeDefined();
    expect(progress.at(-1)).toBe('1/1');
    expect(back.catalog.lookup(PDFName.of('Pages'))).toBeDefined();
    expect(PDFArray).toBeDefined();
  });
});
