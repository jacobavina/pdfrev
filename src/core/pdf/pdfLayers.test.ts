import { describe, it, expect } from 'vitest';
import { listPdfLayers, OptionalContentConfigLike } from './pdfLayers';

/** Configuración de contenido opcional mínima con la forma de la de PDF.js. */
const makeConfig = (order: unknown[] | null, groups: Record<string, { name: string; visible: boolean }>) => {
  const state = { ...groups };
  const cfg: OptionalContentConfigLike = {
    getOrder: () => order,
    getGroup: (id) => state[id] ?? null,
    getGroups: () => state,
    setVisibility: (id, visible = true) => {
      state[id] = { ...state[id], visible };
    },
  };
  return cfg;
};

describe('Capas del PDF (ADR-0024)', () => {
  it('lista los grupos en el orden de /Order con su anidación y visibilidad inicial', () => {
    const cfg = makeConfig(
      ['A-WALL', { name: 'Instalaciones', order: ['E-POWR', 'P-PIPE'] }, ['A-DOOR']],
      {
        'A-WALL': { name: 'A-WALL', visible: true },
        'E-POWR': { name: 'E-POWR', visible: false },
        'P-PIPE': { name: 'P-PIPE', visible: true },
        'A-DOOR': { name: 'A-DOOR', visible: true },
      }
    );
    expect(listPdfLayers(cfg)).toEqual([
      { id: 'A-WALL', name: 'A-WALL', depth: 0, visible: true },
      { id: null, name: 'Instalaciones', depth: 0, visible: true },
      { id: 'E-POWR', name: 'E-POWR', depth: 1, visible: false },
      { id: 'P-PIPE', name: 'P-PIPE', depth: 1, visible: true },
      { id: 'A-DOOR', name: 'A-DOOR', depth: 1, visible: true },
    ]);
  });

  it('incluye los grupos que no aparecen en /Order y devuelve vacío sin capas', () => {
    const cfg = makeConfig(['G1'], {
      G1: { name: 'Cotas', visible: true },
      G2: { name: 'Mobiliario', visible: true },
    });
    expect(listPdfLayers(cfg).map((r) => r.name)).toEqual(['Cotas', 'Mobiliario']);
    expect(listPdfLayers(null)).toEqual([]);
  });
});

describe('Capas reales de un PDF leídas con PDF.js (ADR-0024)', () => {
  it('un PDF con /OCProperties muestra sus capas y su visibilidad se puede cambiar', async () => {
    const { PDFDocument, PDFName, PDFString } = await import('pdf-lib');
    const pdfjs = await import('pdfjs-dist');
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const ctx = doc.context;
    const ocg1 = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('A-WALL') }));
    const ocg2 = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of('E-POWR') }));
    doc.catalog.set(
      PDFName.of('OCProperties'),
      ctx.obj({ OCGs: [ocg1, ocg2], D: { Order: [ocg1, ocg2], OFF: [ocg2] } })
    );
    const content = ctx.stream('/OC /L1 BDC 0 0 1 rg 50 50 100 100 re f EMC /OC /L2 BDC 1 0 0 rg 200 50 100 100 re f EMC');
    page.node.set(PDFName.of('Contents'), ctx.register(content));
    page.node.set(PDFName.of('Resources'), ctx.obj({ Properties: { L1: ocg1, L2: ocg2 } }));
    const bytes = await doc.save();

    const pdf = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
    const cfg = (await pdf.getOptionalContentConfig()) as unknown as OptionalContentConfigLike;
    const rows = listPdfLayers(cfg);
    expect(rows.map((r) => [r.name, r.visible])).toEqual([
      ['A-WALL', true],
      ['E-POWR', false],
    ]);
    cfg.setVisibility(rows[1].id!, true);
    expect(listPdfLayers(cfg)[1].visible).toBe(true);
    await pdf.destroy();
  });
});
