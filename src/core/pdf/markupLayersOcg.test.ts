import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from 'pdf-lib';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { Markup } from '../../types/markup';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));

const mk = (id: string, layer: string, y: number): Markup => ({
  id,
  type: 'rectangle',
  pageIndex: 0,
  points: [{ x: 0.1, y }, { x: 0.2, y: y + 0.05 }],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '2026-10-15T12:00:00Z',
  updatedAt: '2026-10-15T12:00:00Z',
  status: 'pending',
  layer,
});

/** Nombres de las capas de /OCProperties /OCGs y de las que /D deja apagadas. */
async function ocInfo(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const oc = doc.catalog.lookup(PDFName.of('OCProperties'), PDFDict);
  const name = (r: unknown) => (doc.context.lookup(r as PDFRef, PDFDict).get(PDFName.of('Name')) as PDFString).decodeText();
  const ocgs = oc.lookup(PDFName.of('OCGs'), PDFArray).asArray().map(name);
  const offArr = oc.lookup(PDFName.of('D'), PDFDict).lookup(PDFName.of('OFF'));
  const off = offArr instanceof PDFArray ? offArr.asArray().map(name) : [];
  const annots = doc.getPages()[0].node.Annots()!.asArray().map((r) => doc.context.lookup(r as PDFRef, PDFDict));
  const annotLayers = annots
    .filter((a) => a.get(PDFName.of('OC')))
    .map((a) => (a.lookup(PDFName.of('OC'), PDFDict).get(PDFName.of('Name')) as PDFString).decodeText());
  return { ocgs, off, annotLayers };
}

/** Plano con una capa propia del CAD ("A-WALL"). */
async function withCadLayer(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(blueprint);
  const ctx = doc.context;
  const wall = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('A-WALL') }));
  doc.catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: [wall], D: ctx.obj({ Order: [wall], ON: [wall] }) }));
  return doc.save({ useObjectStreams: false });
}

describe('Capas de marcas como capas del PDF (/OCG, ADR-0046)', () => {
  it('cada capa de marcas se escribe como /OCG, cada anotación lleva su /OC y las capas ocultas quedan apagadas', async () => {
    const saved = await saveIncrementalMarkups(blueprint, [mk('a', 'Markups', 0.1), mk('b', 'Electrical', 0.3), mk('c', 'Markups', 0.5)], {}, {
      hiddenLayers: ['Electrical'],
    });
    const info = await ocInfo(saved);
    expect(info.ocgs).toEqual(['Markups', 'Electrical']);
    expect(info.off).toEqual(['Electrical']);
    expect(info.annotLayers.sort()).toEqual(['Electrical', 'Markups', 'Markups']);
    // Y vuelven a REA con su capa y su estado de visibilidad
    const back = await importPdfAnnotations(saved);
    expect(back.markups.find((m) => m.id === 'b')!.layer).toBe('Electrical');
    expect(back.hiddenLayers).toEqual(['Electrical']);
  });

  it('al volver a guardar se reemplazan las capas de REA y se conservan las capas propias del plano', async () => {
    const cad = await withCadLayer();
    const first = await saveIncrementalMarkups(cad, [mk('a', 'Markups', 0.1)]);
    const second = await saveIncrementalMarkups(first, [mk('a', 'Review', 0.1)], {}, { importedIds: ['a'] });
    expect((await ocInfo(second)).ocgs).toEqual(['A-WALL', 'Review']);
  });

  it('una anotación de otra aplicación con /OC toma como capa el nombre de su /OCG al abrir el PDF', async () => {
    const doc = await PDFDocument.load(blueprint);
    const ctx = doc.context;
    const ocg = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('Structural') }));
    const annot = ctx.register(
      ctx.obj({ Type: 'Annot', Subtype: 'Square', Rect: [100, 100, 200, 160], C: [1, 0, 0], OC: ocg, NM: PDFString.of('foreign-sq') })
    );
    doc.getPages()[0].node.set(PDFName.of('Annots'), ctx.obj([annot]));
    const back = await importPdfAnnotations(await doc.save({ useObjectStreams: false }));
    expect(back.markups.find((m) => m.id === 'foreign-sq')!.layer).toBe('Structural');
  });
});
