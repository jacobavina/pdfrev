/**
 * Formato .btx de Revu (ADR-0101): un Tool Set. Es XML (UTF-8 con BOM y fines de línea CRLF):
 *
 *   <BluebeamRevuToolSet Version="1">
 *     <Title>hex(zlib("nombre"))</Title>
 *     <ToolChestItem Version="1">
 *       <Name>…</Name> <Type>Bluebeam.PDF.Annotations.AnnotationLine</Type>
 *       <Raw>hex(zlib(diccionario de la anotación PDF))</Raw>
 *       <X/> <Y/> <Index/> <Mode>properties|drawing</Mode>
 *     </ToolChestItem> …
 *
 * Este módulo solo lee y escribe esa envoltura. Convertir el diccionario en marca está en `btxConvert.ts`.
 * La estructura se dedujo de Tool Sets reales de Revu 21 en el equipo del usuario; no se copia ningún contenido.
 */

export interface BtxItem {
  /** Nombre interno (Revu usa 16 letras mayúsculas al azar). */
  name: string;
  /** Tipo de anotación de Revu, p. ej. "Bluebeam.PDF.Annotations.AnnotationLine". */
  type: string;
  /** Diccionario de la anotación PDF, tal cual (una cadena por byte). */
  dict: string;
  /** Desplazamiento de la anotación dentro de su rectángulo. */
  x: number;
  y: number;
  /** Posición en el Tool Set (-1 si Revu no la fija). */
  index: number;
  mode: 'properties' | 'drawing';
}

export interface BtxFile {
  title: string;
  items: BtxItem[];
}

export const BTX_TYPE_PREFIX = 'Bluebeam.PDF.Annotations.';

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error('Invalid hexadecimal data in the tool set.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const bytesToHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as unknown as BufferSource);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** zlib (RFC 1950), el mismo envoltorio que usa Revu. */
export const zlibDeflate = (bytes: Uint8Array) => pipeThrough(bytes, new CompressionStream('deflate'));
export const zlibInflate = (bytes: Uint8Array) => pipeThrough(bytes, new DecompressionStream('deflate'));

const latin1ToBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const bytesToLatin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

const textOf = (el: Element, tag: string): string => el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

/** Lee un .btx. Lanza si no es un Tool Set de Revu. */
export async function parseBtx(xml: string): Promise<BtxFile> {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'application/xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'BluebeamRevuToolSet' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('This is not a Bluebeam Revu tool set (.btx).');
  }
  const title = new TextDecoder().decode(await zlibInflate(hexToBytes(textOf(root, 'Title'))));
  const items: BtxItem[] = [];
  for (const el of Array.from(root.getElementsByTagName('ToolChestItem'))) {
    const raw = textOf(el, 'Raw');
    if (!raw) continue;
    const num = (tag: string, fallback: number) => {
      const n = Number(textOf(el, tag));
      return Number.isFinite(n) ? n : fallback;
    };
    items.push({
      name: textOf(el, 'Name'),
      type: textOf(el, 'Type'),
      dict: bytesToLatin1(await zlibInflate(hexToBytes(raw))),
      x: num('X', 0),
      y: num('Y', 0),
      index: num('Index', -1),
      mode: textOf(el, 'Mode') === 'drawing' ? 'drawing' : 'properties',
    });
  }
  return { title, items };
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Escribe un .btx con la misma forma que los de Revu. */
export async function buildBtx(file: BtxFile): Promise<string> {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<BluebeamRevuToolSet Version="1">'];
  lines.push(`  <Title>${bytesToHex(await zlibDeflate(new TextEncoder().encode(file.title)))}</Title>`);
  for (const it of file.items) {
    lines.push(
      '  <ToolChestItem Version="1">',
      `    <Name>${xmlEscape(it.name)}</Name>`,
      `    <Type>${xmlEscape(it.type)}</Type>`,
      `    <Raw>${bytesToHex(await zlibDeflate(latin1ToBytes(it.dict)))}</Raw>`,
      `    <X>${it.x}</X>`,
      `    <Y>${it.y}</Y>`,
      `    <Index>${it.index}</Index>`,
      `    <Mode>${it.mode}</Mode>`,
      '  </ToolChestItem>'
    );
  }
  lines.push('</BluebeamRevuToolSet>');
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** Nombre interno al azar como los de Revu: 16 letras mayúsculas. */
export function randomBtxName(rand: () => number = Math.random): string {
  return Array.from({ length: 16 }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join('');
}
