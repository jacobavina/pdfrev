/**
 * Slip Sheet (ADR-0129): sustituye las láminas de un juego de planos por las de una revisión nueva, emparejándolas por su
 * número de lámina (A-101, S-2.01...) en lugar de por posición, y conservando las marcas del documento.
 */

/** Un número de lámina: de una a tres letras, guion o punto opcional (un espacio solo si las letras son mayúsculas), y uno a tres dígitos con decimales opcionales (A-101, S2.01, A 101). */
const SHEET_NUMBER = /(?<![A-Za-z0-9])(?:([A-Za-z]{1,3})[-.]?|([A-Z]{1,3}) )(\d{1,3}(?:\.\d{1,2})?)(?![A-Za-z0-9])/g;

/** Palabras que parecen números de lámina pero no lo son (unidades y similares): "PT 2", "PAG 3", "ND 1". */
const NOT_SHEETS = new Set(['PT', 'PAG', 'PG', 'NO', 'ND', 'PX', 'MM', 'CM', 'FT', 'IN', 'KG', 'REV', 'N', 'P', 'NUM', 'DE', 'DEL', 'EN', 'OF', 'PAGE', 'SHEET', 'HOJA']);

/**
 * El número de lámina del texto de una página, normalizado (mayúsculas, sin guiones ni espacios: "a-101" y "A 101" dan
 * "A101"). En una hoja de planos el cajetín suele ir al final, así que se toma el último candidato; null si no hay ninguno.
 */
export function sheetKey(text: string): string | null {
  let last: string | null = null;
  for (const m of text.matchAll(SHEET_NUMBER)) {
    const letters = (m[1] ?? m[2]).toUpperCase();
    if (NOT_SHEETS.has(letters)) continue;
    last = `${letters}${m[3]}`;
  }
  return last;
}

export interface SlipMatch {
  /** Página del documento abierto (0-based). */
  oldIndex: number;
  /** Página de la revisión nueva (0-based) que la sustituye, o null si no se encontró. */
  newIndex: number | null;
  /** Cómo se emparejó. */
  by: 'sheet' | 'order' | null;
}

/**
 * Empareja cada página vieja con la nueva que tiene el mismo número de lámina. Cada página nueva se usa una sola vez. Si
 * ninguna lámina coincide (por ejemplo, PDF sin texto) se empareja por posición.
 */
export function matchSheets(oldKeys: (string | null)[], newKeys: (string | null)[]): SlipMatch[] {
  const used = new Set<number>();
  const bySheet: SlipMatch[] = oldKeys.map((key, oldIndex) => {
    if (!key) return { oldIndex, newIndex: null, by: null };
    const at = newKeys.findIndex((k, i) => k === key && !used.has(i));
    if (at < 0) return { oldIndex, newIndex: null, by: null };
    used.add(at);
    return { oldIndex, newIndex: at, by: 'sheet' };
  });
  if (bySheet.some((m) => m.newIndex !== null)) return bySheet;
  return oldKeys.map((_, oldIndex) => ({ oldIndex, newIndex: oldIndex < newKeys.length ? oldIndex : null, by: oldIndex < newKeys.length ? 'order' : null }));
}

export interface SlipPair {
  oldIndex: number;
  newIndex: number;
}

export interface SlipResult {
  bytes: Uint8Array;
  replaced: number;
  appended: number;
}

/**
 * Sustituye cada página `oldIndex` por la página `newIndex` del PDF `source`, una a una (las posiciones no se mueven), y
 * añade al final las páginas `append` de `source`. Las anotaciones propias de las páginas nuevas viajan con ellas.
 */
export async function slipSheetPdf(pdfBytes: Uint8Array, source: Uint8Array, pairs: SlipPair[], append: number[] = []): Promise<SlipResult> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const incoming = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  if (pairs.length === 0 && append.length === 0) throw new Error('There is nothing to replace.');
  const count = doc.getPageCount();
  if (new Set(pairs.map((p) => p.oldIndex)).size !== pairs.length) throw new Error('A page of this document is replaced twice.');
  if (pairs.some((p) => p.oldIndex < 0 || p.oldIndex >= count)) throw new Error('A page to replace is outside this document.');
  if ([...pairs.map((p) => p.newIndex), ...append].some((i) => i < 0 || i >= incoming.getPageCount())) throw new Error('A new sheet is outside the other PDF.');
  const copied = await doc.copyPages(incoming, pairs.map((p) => p.newIndex));
  pairs.forEach((p, k) => {
    doc.insertPage(p.oldIndex, copied[k]);
    doc.removePage(p.oldIndex + 1);
  });
  if (append.length > 0) for (const page of await doc.copyPages(incoming, append)) doc.addPage(page);
  return { bytes: await doc.save(), replaced: pairs.length, appended: append.length };
}
