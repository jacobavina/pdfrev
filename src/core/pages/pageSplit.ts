/**
 * Dividir el documento (Split Document, ADR-0114): reparte las páginas en varios PDF. Una parte es una lista de páginas
 * (índices 0-based). Puro salvo `splitPdf`.
 */

export const MAX_SPLIT_PARTS = 200;

/** Partes de N páginas seguidas; la última recoge las que sobren. */
export function partsEvery(n: number, pageCount: number): number[][] | null {
  if (!Number.isInteger(n) || n < 1 || pageCount < 1) return null;
  const parts: number[][] = [];
  for (let start = 0; start < pageCount; start += n) {
    parts.push(Array.from({ length: Math.min(n, pageCount - start) }, (_, i) => start + i));
  }
  return parts.length <= MAX_SPLIT_PARTS ? parts : null;
}

/** Una parte como "1-3, 5" (1-based); null si no es válida. */
function parsePart(text: string, pageCount: number): number[] | null {
  const out: number[] = [];
  for (const piece of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(piece);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a || b > pageCount) return null;
    for (let i = a; i <= b; i++) out.push(i - 1);
  }
  return out.length > 0 ? out : null;
}

/** Partes escritas como "1-3; 4-6; 8, 10" (punto y coma o salto de línea entre partes); null si alguna no es válida. */
export function partsFromRanges(text: string, pageCount: number): number[][] | null {
  const pieces = text.split(/[;\n]/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length === 0 || pieces.length > MAX_SPLIT_PARTS) return null;
  const parts: number[][] = [];
  for (const piece of pieces) {
    const part = parsePart(piece, pageCount);
    if (!part) return null;
    parts.push(part);
  }
  return parts;
}

/** Descripción corta de las páginas de una parte: "1-3", "5" o "1, 4, 7". */
export function describePart(indices: number[]): string {
  const pages = indices.map((i) => i + 1);
  const runs: string[] = [];
  let start = pages[0];
  let prev = pages[0];
  for (let k = 1; k <= pages.length; k++) {
    if (pages[k] === prev + 1) {
      prev = pages[k];
      continue;
    }
    runs.push(start === prev ? String(start) : `${start}-${prev}`);
    start = pages[k];
    prev = pages[k];
  }
  return runs.join(', ');
}

const SAFE = /[\\/:*?"<>|]+/g;

/** Nombres de archivo de las partes: `base_p1-3.pdf`, sin repetirse y sin caracteres que Windows no admite. */
export function partFileNames(base: string, parts: number[][]): string[] {
  const clean = base.replace(SAFE, '_').trim() || 'document';
  const used = new Map<string, number>();
  return parts.map((part, i) => {
    const contiguous = part.every((p, k) => k === 0 || p === part[k - 1] + 1);
    const label = contiguous ? (part.length === 1 ? `p${part[0] + 1}` : `p${part[0] + 1}-${part[part.length - 1] + 1}`) : `part${i + 1}`;
    let name = `${clean}_${label}`;
    const seen = used.get(name) ?? 0;
    used.set(name, seen + 1);
    if (seen > 0) name = `${name}_${seen + 1}`;
    return `${name}.pdf`;
  });
}

/** Un PDF por parte, con las páginas copiadas del original (y sus anotaciones). */
export async function splitPdf(pdfBytes: Uint8Array, parts: number[][]): Promise<Uint8Array[]> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const out: Uint8Array[] = [];
  for (const part of parts) {
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(source, part);
    for (const page of copied) doc.addPage(page);
    const title = source.getTitle();
    if (title) doc.setTitle(title);
    out.push(await doc.save());
  }
  return out;
}
