import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFStream } from 'pdf-lib';
import type { Markup } from '../../types/markup';

/**
 * Aplanar y desaplanar marcas (ADR-0093).
 *
 * Al aplanar se dibujan las marcas en flujos de contenido nuevos de cada página. Para poder deshacerlo se guarda en el
 * diccionario Info del PDF qué flujos añadió REA y las marcas originales; "Unflatten" quita esos flujos y devuelve
 * las marcas. Un PDF aplanado por otra herramienta no tiene el registro y no se puede desaplanar.
 */

export const FLATTEN_INFO_KEY = 'REAFlattened';
const FLATTEN_VERSION = 1;

interface FlattenRecord {
  v: number;
  /** Por página (base 0): referencias "objeto generación" de los flujos de contenido añadidos al aplanar. */
  streams: Record<string, string[]>;
  markups: Markup[];
}

const tag = (ref: PDFRef) => `${ref.objectNumber} ${ref.generationNumber}`;

/** Referencias de los flujos de contenido de una página, en orden. */
function contentRefs(doc: PDFDocument, pageIndex: number): PDFRef[] {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  if (contents instanceof PDFArray) {
    return contents.asArray().filter((o): o is PDFRef => o instanceof PDFRef);
  }
  const raw = page.node.get(PDFName.of('Contents'));
  return raw instanceof PDFRef ? [raw] : [];
}

/** Antes de aplanar: conjunto de flujos de contenido que ya tiene cada página. */
export function snapshotContentStreams(doc: PDFDocument): Set<string>[] {
  return doc.getPages().map((_, i) => new Set(contentRefs(doc, i).map(tag)));
}

/**
 * Después de aplanar: anota en Info los flujos nuevos de cada página y las marcas aplanadas.
 * Sin flujos nuevos (nada que dibujar) no deja registro.
 */
export function recordFlatten(doc: PDFDocument, before: Set<string>[], markups: Markup[]): void {
  const streams: Record<string, string[]> = {};
  before.forEach((existing, i) => {
    const added = contentRefs(doc, i)
      .map(tag)
      .filter((t) => !existing.has(t));
    if (added.length > 0) streams[String(i)] = added;
  });
  if (Object.keys(streams).length === 0) return;
  const record: FlattenRecord = { v: FLATTEN_VERSION, streams, markups };
  const info = (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict();
  info.set(PDFName.of(FLATTEN_INFO_KEY), PDFHexString.fromText(JSON.stringify(record)));
}

function readRecord(doc: PDFDocument): FlattenRecord | null {
  const info = (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict();
  const raw = info.get(PDFName.of(FLATTEN_INFO_KEY));
  if (!(raw instanceof PDFHexString)) return null;
  try {
    const record = JSON.parse(raw.decodeText()) as FlattenRecord;
    return record && record.v === FLATTEN_VERSION && record.streams && Array.isArray(record.markups) ? record : null;
  } catch {
    return null;
  }
}

/** ¿Este PDF fue aplanado por REA y se puede desaplanar? */
export async function canUnflatten(bytes: Uint8Array): Promise<boolean> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return readRecord(doc) !== null;
}

/**
 * Quita los flujos que añadió el aplanado y devuelve el PDF sin ellos junto a las marcas originales.
 * Lanza si el PDF no lo aplanó REA.
 */
export async function unflattenPdf(bytes: Uint8Array): Promise<{ pdfBytes: Uint8Array; markups: Markup[] }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const record = readRecord(doc);
  if (!record) throw new Error('This PDF was not flattened by REA, so its markups cannot be restored.');
  for (const [pageKey, tags] of Object.entries(record.streams)) {
    const i = Number(pageKey);
    if (!Number.isInteger(i) || i < 0 || i >= doc.getPageCount()) continue;
    const page = doc.getPage(i);
    const drop = new Set(tags);
    const kept = contentRefs(doc, i).filter((r) => !drop.has(tag(r)));
    // Los flujos quitados dejan de existir en el documento
    for (const r of contentRefs(doc, i)) {
      if (drop.has(tag(r)) && doc.context.lookup(r) instanceof PDFStream) doc.context.delete(r);
    }
    page.node.set(PDFName.of('Contents'), doc.context.obj(kept));
  }
  (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict().delete(PDFName.of(FLATTEN_INFO_KEY));
  return { pdfBytes: await doc.save({ updateFieldAppearances: false }), markups: record.markups };
}
