import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';
import { MAX_BATCH_FILES, batchReportRows, opSuffix, outputName, removeAnnotationsByName, runBatch, runBatchOp, type BatchOp } from './batchOps';
import { saveIncrementalMarkups } from '../core/pdf/incrementalWriter';
import { importPdfAnnotations } from '../core/pdf/annotationReader';
import type { Markup } from '../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf')));

const rect = (id: string): Markup =>
  ({ id, type: 'rectangle', pageIndex: 0, points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.4 }], style: { strokeColor: '#e02424', fillColor: '#ffeb3b', strokeWidth: 2, opacity: 1 }, author: 'a', createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z', status: 'pending' }) as Markup;

const annotCount = async (bytes: Uint8Array, pageIndex = 0) => {
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPage(pageIndex).node.lookup(PDFName.of('Annots'));
  return annots instanceof PDFArray ? annots.size() : 0;
};

describe('Batch: operaciones sobre varios PDF (ADR-0125)', () => {
  it('los nombres de salida llevan el sufijo de la operación y no se repiten', () => {
    const taken = new Set<string>();
    const flat: BatchOp = { kind: 'flatten' };
    expect(opSuffix(flat)).toBe('flattened');
    expect(opSuffix({ kind: 'rotate', degrees: 90 })).toBe('rotated90');
    expect(outputName('A-101.pdf', flat, taken)).toBe('A-101_flattened.pdf');
    expect(outputName('a-101.PDF', flat, taken)).toBe('a-101_flattened_2.pdf');
    expect(outputName('b/c:d.pdf', { kind: 'number', format: '{n}', position: 'bottom-center', fontSize: 9, marginPt: 20 }, taken)).toBe('b_c_d_numbered.pdf');
    expect(MAX_BATCH_FILES).toBe(200);
  });

  it('rotar suma los grados a la rotación de cada página', async () => {
    const out = await runBatchOp(blueprint, { kind: 'rotate', degrees: 90 });
    const before = await PDFDocument.load(blueprint);
    const after = await PDFDocument.load(out);
    after.getPages().forEach((p, i) => expect(p.getRotation().angle).toBe((before.getPage(i).getRotation().angle + 90) % 360));
    const again = await PDFDocument.load(await runBatchOp(out, { kind: 'rotate', degrees: 270 }));
    expect(again.getPage(0).getRotation().angle).toBe(before.getPage(0).getRotation().angle % 360);
  });

  it('numerar estampa "Page n of total" en todas las páginas', async () => {
    const out = await runBatchOp(blueprint, { kind: 'number', format: 'Hoja {n} de {total}', position: 'bottom-right', fontSize: 9, marginPt: 20 });
    expect(out.length).toBeGreaterThan(blueprint.length);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(3);
  });

  it('quitar anotaciones por nombre deja las demás y no reescribe el archivo si no hay nada que quitar', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [rect('uno'), rect('dos')]);
    expect(await annotCount(saved)).toBe(2);
    const r = await removeAnnotationsByName(saved, new Set(['uno']));
    expect(r.removed).toBe(1);
    expect(await annotCount(r.bytes)).toBe(1);
    const none = await removeAnnotationsByName(saved, new Set(['otro']));
    expect(none.removed).toBe(0);
    expect(none.bytes).toBe(saved);
  });

  it('aplanar dibuja las marcas en la página y quita sus anotaciones, así que no salen dos veces', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [rect('uno')]);
    const out = await runBatchOp(saved, { kind: 'flatten' });
    expect(await annotCount(out)).toBe(0);
    expect(out.length).toBeGreaterThan(blueprint.length);
    // Ya no hay marcas editables que importar
    expect((await importPdfAnnotations(out)).markups.filter((m) => m.id === 'uno')).toHaveLength(0);
  });

  it('aplanar un archivo sin marcas falla con un mensaje claro', async () => {
    await expect(runBatchOp(blueprint, { kind: 'flatten' })).rejects.toThrow(/no markups to flatten/);
  });

  it('el lote sigue tras un fallo, guarda cada resultado y avisa del progreso', async () => {
    const saved: { name: string; size: number }[] = [];
    const progress: string[] = [];
    const results = await runBatch(
      [
        { name: 'bueno.pdf', bytes: blueprint },
        { name: 'roto.pdf', bytes: new Uint8Array([1, 2, 3]) },
        { name: 'otro.pdf', bytes: blueprint },
      ],
      { kind: 'rotate', degrees: 180 },
      async (name, bytes) => void saved.push({ name, size: bytes.length }),
      (done, total, last) => progress.push(`${done}/${total}:${last.ok ? 'ok' : 'fail'}`)
    );
    expect(results.map((r) => [r.input, r.ok])).toEqual([['bueno.pdf', true], ['roto.pdf', false], ['otro.pdf', true]]);
    expect(saved.map((s) => s.name)).toEqual(['bueno_rotated180.pdf', 'otro_rotated180.pdf']);
    expect(progress).toEqual(['1/3:ok', '2/3:fail', '3/3:ok']);
    expect(results[1].message.length).toBeGreaterThan(0);
  });

  it('si guardar falla, ese archivo se cuenta como fallido y se sigue', async () => {
    let calls = 0;
    const results = await runBatch(
      [{ name: 'a.pdf', bytes: blueprint }, { name: 'b.pdf', bytes: blueprint }],
      { kind: 'rotate', degrees: 90 },
      async () => {
        if (calls++ === 0) throw new Error('disco lleno');
      }
    );
    expect(results.map((r) => r.ok)).toEqual([false, true]);
    expect(results[0].message).toBe('disco lleno');
  });

  it('el informe lleva archivo, resultado, salida y mensaje', () => {
    expect(
      batchReportRows([
        { input: 'a.pdf', ok: true, output: 'a_numbered.pdf', message: 'Done' },
        { input: 'b.pdf', ok: false, message: 'Invalid PDF' },
      ])
    ).toEqual([
      ['File', 'Result', 'Output', 'Message'],
      ['a.pdf', 'OK', 'a_numbered.pdf', 'Done'],
      ['b.pdf', 'Failed', '', 'Invalid PDF'],
    ]);
  });
});
