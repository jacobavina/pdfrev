import type { NumberPosition } from '../core/pages/pageNumbers';
import type { ReduceQuality } from '../core/pdf/reduceSize';

/**
 * Procesos por lotes (Batch, ADR-0125): una operación aplicada a varios PDF, uno tras otro, sin abrirlos en el visor. Cada
 * archivo se procesa por separado y un fallo no detiene al resto. Las operaciones trabajan sobre los bytes del archivo.
 */

export type BatchOp =
  | { kind: 'flatten' }
  | { kind: 'number'; format: string; position: NumberPosition; fontSize: number; marginPt: number }
  | { kind: 'rotate'; degrees: 90 | 180 | 270 }
  | { kind: 'reduce'; quality: ReduceQuality };

export const MAX_BATCH_FILES = 200;

/** Sufijo del archivo de salida según la operación. */
export function opSuffix(op: BatchOp): string {
  return op.kind === 'flatten' ? 'flattened' : op.kind === 'number' ? 'numbered' : op.kind === 'reduce' ? 'reduced' : `rotated${op.degrees}`;
}

/** Nombre del archivo de salida; si ya hay otro igual en la lista de salidas, lleva un número. */
export function outputName(inputName: string, op: BatchOp, taken: Set<string>): string {
  const base = inputName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '_') || 'document';
  let name = `${base}_${opSuffix(op)}.pdf`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}_${opSuffix(op)}_${i}.pdf`;
  taken.add(name.toLowerCase());
  return name;
}

/** Quita de las páginas las anotaciones cuyo nombre (/NM) esté en `names`; las demás se dejan. Devuelve cuántas quitó. */
export async function removeAnnotationsByName(bytes: Uint8Array, names: Set<string>): Promise<{ bytes: Uint8Array; removed: number }> {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  let removed = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    const kept = [];
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookup(i);
      const nm = dict instanceof PDFDict ? dict.lookup(PDFName.of('NM')) : undefined;
      const name = nm instanceof PDFString || nm instanceof PDFHexString ? nm.decodeText() : undefined;
      if (name !== undefined && names.has(name)) removed++;
      else kept.push(annots.get(i));
    }
    if (kept.length !== annots.size()) page.node.set(PDFName.of('Annots'), doc.context.obj(kept));
  }
  return { bytes: removed > 0 ? await doc.save() : bytes, removed };
}

/** Aplana las marcas de REA del archivo en el contenido de las páginas y quita sus anotaciones, para que no salgan dos veces. */
async function flattenFile(bytes: Uint8Array): Promise<Uint8Array> {
  const { importPdfAnnotations } = await import('../core/pdf/annotationReader');
  const { exportMarkupsToPdf } = await import('./pdfExportService');
  const imported = await importPdfAnnotations(bytes);
  const visible = imported.markups.filter((m) => !m.hidden);
  if (visible.length === 0) throw new Error('This file has no markups to flatten.');
  const flattened = await exportMarkupsToPdf(bytes, visible);
  return (await removeAnnotationsByName(flattened.pdfBytes, new Set(imported.markups.map((m) => m.id)))).bytes;
}

async function rotateFile(bytes: Uint8Array, degrees: 90 | 180 | 270): Promise<Uint8Array> {
  const { PDFDocument, degrees: deg } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  for (const page of doc.getPages()) page.setRotation(deg((((page.getRotation().angle + degrees) % 360) + 360) % 360));
  return doc.save();
}

async function numberFile(bytes: Uint8Array, op: Extract<BatchOp, { kind: 'number' }>): Promise<Uint8Array> {
  const { numberPdfPages, DEFAULT_NUMBER_COLOR } = await import('../core/pages/pageNumbers');
  const { PDFDocument } = await import('pdf-lib');
  const count = (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  return numberPdfPages(bytes, {
    format: op.format,
    position: op.position,
    fontSize: op.fontSize,
    margin: op.marginPt,
    color: DEFAULT_NUMBER_COLOR,
    startAt: 1,
    pages: Array.from({ length: count }, (_, i) => i),
    font: 'Helvetica',
  });
}

async function reduceFile(bytes: Uint8Array, quality: ReduceQuality): Promise<Uint8Array> {
  const { reducePdfSize, browserImageCodec } = await import('../core/pdf/reduceSize');
  const { bytes: out, report } = await reducePdfSize(bytes, quality, browserImageCodec);
  if (report.after >= report.before) throw new Error('This file cannot be made smaller.');
  return out;
}

/** Aplica la operación a los bytes de un archivo. */
export async function runBatchOp(bytes: Uint8Array, op: BatchOp): Promise<Uint8Array> {
  switch (op.kind) {
    case 'flatten':
      return flattenFile(bytes);
    case 'rotate':
      return rotateFile(bytes, op.degrees);
    case 'number':
      return numberFile(bytes, op);
    case 'reduce':
      return reduceFile(bytes, op.quality);
  }
}

export interface BatchInput {
  name: string;
  bytes: Uint8Array;
}

export interface BatchResult {
  input: string;
  ok: boolean;
  output?: string;
  message: string;
}

/**
 * Procesa los archivos de uno en uno. `save` guarda cada resultado (carpeta o descarga); si falla, el archivo se cuenta
 * como fallido y se sigue con el siguiente.
 */
export async function runBatch(
  files: BatchInput[],
  op: BatchOp,
  save: (name: string, bytes: Uint8Array) => Promise<void>,
  onProgress?: (done: number, total: number, last: BatchResult) => void
): Promise<BatchResult[]> {
  const taken = new Set<string>();
  const results: BatchResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let result: BatchResult;
    try {
      const out = await runBatchOp(f.bytes, op);
      const name = outputName(f.name, op, taken);
      await save(name, out);
      result = { input: f.name, ok: true, output: name, message: 'Done' };
    } catch (err) {
      result = { input: f.name, ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    results.push(result);
    onProgress?.(i + 1, files.length, result);
  }
  return results;
}

/** Informe del lote como filas de CSV. */
export function batchReportRows(results: BatchResult[]): string[][] {
  return [['File', 'Result', 'Output', 'Message'], ...results.map((r) => [r.input, r.ok ? 'OK' : 'Failed', r.output ?? '', r.message])];
}
