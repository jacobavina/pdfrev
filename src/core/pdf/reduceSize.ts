/**
 * Reducir el tamaño del archivo (Reduce File Size, ADR-0126): baja la resolución de las imágenes grandes y las recomprime
 * como JPEG, y reescribe el PDF con flujos de objetos. Lo vectorial (líneas, texto) no se toca. Las imágenes se
 * decodifican y codifican con un códec intercambiable: el del navegador usa un lienzo; las pruebas usan uno simulado.
 */

export type ReduceQuality = 'high' | 'medium' | 'low';

export interface QualityPreset {
  /** Lado mayor máximo de una imagen, en píxeles. */
  maxSide: number;
  /** Calidad JPEG (0..1). */
  jpeg: number;
  label: string;
  description: string;
}

export const QUALITY_PRESETS: Record<ReduceQuality, QualityPreset> = {
  high: { maxSide: 3000, jpeg: 0.85, label: 'High quality', description: 'Images above 3000 px are reduced; barely visible change.' },
  medium: { maxSide: 2000, jpeg: 0.72, label: 'Balanced', description: 'Images above 2000 px are reduced; good for screens and most prints.' },
  low: { maxSide: 1200, jpeg: 0.55, label: 'Smallest file', description: 'Images above 1200 px are reduced and compressed harder; fine detail is lost.' },
};

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes por píxel. */
  rgba: Uint8ClampedArray;
}

export interface ImageCodec {
  /** Decodifica un JPEG a píxeles, ya escalado a `target` si es menor que el original. */
  decodeJpeg: (jpeg: Uint8Array, target: { width: number; height: number }) => Promise<RasterImage>;
  /** Escala píxeles RGB(A) a `target` y los codifica como JPEG. */
  encodeJpeg: (image: RasterImage, target: { width: number; height: number }, quality: number) => Promise<Uint8Array>;
}

export interface ReduceReport {
  before: number;
  after: number;
  imagesSeen: number;
  imagesReduced: number;
  /** Imágenes que no se tocaron y por qué (para explicarlo al usuario). */
  skipped: { cause: string; count: number }[];
}

/** Dimensiones a las que se lleva una imagen: iguales si ya cabe, o reducidas con la misma proporción. */
export function targetSize(width: number, height: number, maxSide: number): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height, scaled: false };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

/** Solo se acepta la recompresión si el resultado es claramente menor (un 10 % como mínimo). */
export const worthKeeping = (oldBytes: number, newBytes: number): boolean => newBytes < oldBytes * 0.9;

/** Sin la recompresión, una imagen Flate pequeña no compensa el cambio a JPEG. */
const MIN_FLATE_BYTES = 40 * 1024;

type PdfLib = typeof import('pdf-lib');

function nameOf(obj: unknown, lib: PdfLib): string {
  return obj instanceof lib.PDFName ? obj.decodeText() : '';
}

/** Filtros de la imagen como lista de nombres. */
function filtersOf(dict: import('pdf-lib').PDFDict, lib: PdfLib): string[] {
  const f = dict.lookup(lib.PDFName.of('Filter'));
  if (f instanceof lib.PDFName) return [nameOf(f, lib)];
  if (f instanceof lib.PDFArray) return Array.from({ length: f.size() }, (_, i) => nameOf(f.lookup(i), lib));
  return [];
}

const numberOf = (obj: unknown, lib: PdfLib): number => (obj instanceof lib.PDFNumber ? obj.asNumber() : NaN);

/** Reduce las imágenes del PDF y lo reescribe. Con un códec que no hace nada (null) solo reescribe el archivo. */
export async function reducePdfSize(
  pdfBytes: Uint8Array,
  quality: ReduceQuality,
  codec: ImageCodec | null,
  onProgress?: (done: number, total: number) => void
): Promise<{ bytes: Uint8Array; report: ReduceReport }> {
  const lib = await import('pdf-lib');
  const preset = QUALITY_PRESETS[quality];
  const doc = await lib.PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const skipped = new Map<string, number>();
  const skip = (cause: string) => skipped.set(cause, (skipped.get(cause) ?? 0) + 1);
  let imagesSeen = 0;
  let imagesReduced = 0;

  const images: [import('pdf-lib').PDFRef, import('pdf-lib').PDFRawStream][] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof lib.PDFRawStream)) continue;
    if (nameOf(obj.dict.lookup(lib.PDFName.of('Subtype')), lib) !== 'Image') continue;
    images.push([ref, obj]);
  }

  for (let k = 0; k < images.length; k++) {
    const [ref, stream] = images[k];
    onProgress?.(k, images.length);
    imagesSeen++;
    if (!codec) {
      skip('No image codec available');
      continue;
    }
    const dict = stream.dict;
    const width = numberOf(dict.lookup(lib.PDFName.of('Width')), lib);
    const height = numberOf(dict.lookup(lib.PDFName.of('Height')), lib);
    const filters = filtersOf(dict, lib);
    const isMask = dict.lookup(lib.PDFName.of('ImageMask')) === lib.PDFBool.True;
    const bpc = numberOf(dict.lookup(lib.PDFName.of('BitsPerComponent')), lib);
    const cs = dict.lookup(lib.PDFName.of('ColorSpace'));
    const csName = nameOf(cs, lib);
    if (!(width > 0 && height > 0)) {
      skip('Unreadable size');
      continue;
    }
    if (isMask || bpc === 1) {
      skip('Black and white scans and masks');
      continue;
    }
    const target = targetSize(width, height, preset.maxSide);
    let raster: RasterImage | null = null;
    try {
      if (filters.length === 1 && filters[0] === 'DCTDecode') {
        if (!target.scaled) {
          skip('Already small enough');
          continue;
        }
        raster = await codec.decodeJpeg(stream.getContents(), target);
      } else if ((filters.length === 0 || (filters.length === 1 && filters[0] === 'FlateDecode')) && bpc === 8 && (csName === 'DeviceRGB' || csName === 'DeviceGray')) {
        if (!target.scaled && stream.getContentsSize() < MIN_FLATE_BYTES) {
          skip('Already small enough');
          continue;
        }
        const raw = lib.decodePDFRawStream(stream).decode();
        const channels = csName === 'DeviceRGB' ? 3 : 1;
        if (raw.length < width * height * channels) {
          skip('Unsupported encoding');
          continue;
        }
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0, p = 0; i < width * height; i++) {
          const o = i * channels;
          rgba[p++] = raw[o];
          rgba[p++] = channels === 3 ? raw[o + 1] : raw[o];
          rgba[p++] = channels === 3 ? raw[o + 2] : raw[o];
          rgba[p++] = 255;
        }
        raster = { width, height, rgba };
      } else {
        skip('Unsupported encoding');
        continue;
      }
      const jpeg = await codec.encodeJpeg(raster, target, preset.jpeg);
      if (!worthKeeping(stream.getContentsSize(), jpeg.length)) {
        skip('Would not get smaller');
        continue;
      }
      const newDict = lib.PDFDict.withContext(doc.context);
      newDict.set(lib.PDFName.of('Type'), lib.PDFName.of('XObject'));
      newDict.set(lib.PDFName.of('Subtype'), lib.PDFName.of('Image'));
      newDict.set(lib.PDFName.of('Width'), lib.PDFNumber.of(target.width));
      newDict.set(lib.PDFName.of('Height'), lib.PDFNumber.of(target.height));
      newDict.set(lib.PDFName.of('ColorSpace'), lib.PDFName.of('DeviceRGB'));
      newDict.set(lib.PDFName.of('BitsPerComponent'), lib.PDFNumber.of(8));
      newDict.set(lib.PDFName.of('Filter'), lib.PDFName.of('DCTDecode'));
      // La transparencia de la imagen original se conserva: su máscara puede tener otro tamaño
      for (const key of ['SMask', 'Mask', 'Intent', 'Interpolate']) {
        const v = dict.get(lib.PDFName.of(key));
        if (v) newDict.set(lib.PDFName.of(key), v);
      }
      const replacement = lib.PDFRawStream.of(newDict, jpeg);
      doc.context.assign(ref, replacement);
      imagesReduced++;
    } catch {
      skip('Could not be decoded');
    }
  }
  onProgress?.(images.length, images.length);

  const out = await doc.save({ useObjectStreams: true });
  return {
    bytes: out.length < pdfBytes.length ? out : pdfBytes,
    report: {
      before: pdfBytes.length,
      after: Math.min(out.length, pdfBytes.length),
      imagesSeen,
      imagesReduced,
      skipped: [...skipped.entries()].map(([cause, count]) => ({ cause, count })),
    },
  };
}

/** Códec que usa un lienzo del navegador (o de la ventana de la aplicación). */
export const browserImageCodec: ImageCodec = {
  async decodeJpeg(jpeg, target) {
    const bitmap = await createImageBitmap(new Blob([jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer], { type: 'image/jpeg' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('No canvas');
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);
      return { width: target.width, height: target.height, rgba: ctx.getImageData(0, 0, target.width, target.height).data };
    } finally {
      bitmap.close();
    }
  },
  async encodeJpeg(image, target, quality) {
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const sctx = source.getContext('2d');
    if (!sctx) throw new Error('No canvas');
    sctx.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    // El fondo blanco evita que la transparencia del lienzo salga negra en el JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, target.width, target.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
    if (!blob) throw new Error('Could not encode the image');
    return new Uint8Array(await blob.arrayBuffer());
  },
};
