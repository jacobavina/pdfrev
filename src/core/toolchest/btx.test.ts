import { describe, it, expect } from 'vitest';
import { buildBtx, parseBtx, zlibDeflate, zlibInflate } from './btx';
import { btxItemsToMarkups } from './btxConvert';
import { toolsToBtxItems } from './btxExport';
import type { ToolChestTool } from '../../types/toolChest';

/** Un Tool Set escrito a mano con la estructura de Revu 21 (contenido propio, no copiado de ningún Tool Set). */
const dictOf = (s: string) => s;
const SAMPLE_ITEMS = [
  { name: 'AAAAAAAAAAAAAAAA', type: 'Bluebeam.PDF.Annotations.AnnotationLine', dict: dictOf('<</LE[/None/ClosedArrow]/IT/LineArrow/L[5 5 81.2 86.6]/Subj(Flecha roja)/Subtype/Line/Rect[0 0 86.2 91.6]/F 4/C[1 0 0]/BS<</W 2/S/S/Type/Border>>>>'), x: 5, y: 5, index: 0, mode: 'properties' as const },
  { name: 'BBBBBBBBBBBBBBBB', type: 'Bluebeam.PDF.Annotations.AnnotationPolygon', dict: dictOf('<</IT/PolygonCloud/Vertices[10 10 10 70 90 70 90 10]/Subj(Nube)/Subtype/Polygon/Rect[0 0 100 80]/F 4/C[0 0 1]/BS<</W 1/S/S/Type/Border>>/BE<</S/C/I 2>>>>'), x: 10, y: 10, index: 1, mode: 'drawing' as const },
  { name: 'CCCCCCCCCCCCCCCC', type: 'Bluebeam.PDF.Annotations.AnnotationSquare', dict: dictOf('<</Subj(Cuadro)/Subtype/Square/Rect[0 0 60 40]/F 4/C[0 0.5 0]/IC[1 1 0]/BS<</W 3/S/S/Type/Border>>>>'), x: 1.5, y: 1.5, index: 2, mode: 'properties' as const },
  { name: 'DDDDDDDDDDDDDDDD', type: 'Bluebeam.PDF.Annotations.AnnotationBRXStamp', dict: dictOf('<</Subtype/Stamp/Rect[0 0 10 10]>>'), x: 0, y: 0, index: 3, mode: 'properties' as const },
];

describe('Tool Sets .btx de Revu (ADR-0101)', () => {
  it('zlib: lo que se comprime se recupera y coincide con el envoltorio de Revu (cabecera 78 9c)', async () => {
    const bytes = new TextEncoder().encode('My Tools');
    const z = await zlibDeflate(bytes);
    expect(z[0]).toBe(0x78);
    expect(Array.from(await zlibInflate(z))).toEqual(Array.from(bytes));
    // El título que Revu escribió para "My Tools" se lee igual
    const revu = Uint8Array.from('789cf3ad5408c9cfcf2906000c7702f8'.match(/../g)!, (h) => parseInt(h, 16));
    expect(new TextDecoder().decode(await zlibInflate(revu))).toBe('My Tools');
  });

  it('lee y escribe un Tool Set con la estructura de Revu y lo recupera tal cual', async () => {
    const xml = await buildBtx({ title: 'Revisión Ñ', items: SAMPLE_ITEMS });
    expect(xml.startsWith('﻿<?xml version="1.0" encoding="utf-8"?>\r\n<BluebeamRevuToolSet Version="1">')).toBe(true);
    expect(xml).toContain('<Type>Bluebeam.PDF.Annotations.AnnotationLine</Type>');
    expect(xml).toContain('<Mode>drawing</Mode>');
    const back = await parseBtx(xml);
    expect(back.title).toBe('Revisión Ñ');
    expect(back.items).toEqual(SAMPLE_ITEMS);
    await expect(parseBtx('<otraCosa/>')).rejects.toThrow(/not a Bluebeam Revu tool set/);
  });

  it('importa las herramientas de un .btx como marcas de REA: línea con flecha, nube, rectángulo con relleno y omite los sellos', async () => {
    const r = await btxItemsToMarkups(SAMPLE_ITEMS);
    expect(r.tools.map((t) => [t.markup.type, t.markup.subject, t.mode])).toEqual([
      ['line', 'Flecha roja', 'properties'],
      ['cloud', 'Nube', 'drawing'],
      ['rectangle', 'Cuadro', 'properties'],
    ]);
    const [arrow, , box] = r.tools.map((t) => t.markup);
    expect(arrow.style).toMatchObject({ strokeColor: '#ff0000', strokeWidth: 2, lineEndingEnd: 'closedArrow' });
    expect(box.style).toMatchObject({ strokeColor: '#008000', fillColor: '#ffff00', strokeWidth: 3 });
    expect(r.skipped).toEqual([{ name: 'DDDDDDDDDDDDDDDD', type: 'AnnotationBRXStamp', reason: expect.stringContaining('Stamps') }]);
  });

  it('exporta las herramientas de REA a un .btx y vuelven iguales al importarlas', async () => {
    const tool = (over: Partial<ToolChestTool>): ToolChestTool => ({
      id: 't',
      paletteId: 'p',
      name: 'x',
      type: 'rectangle',
      style: { strokeColor: '#e02424', fillColor: '#ffff00', strokeWidth: 3, opacity: 1 },
      order: 0,
      mode: 'properties',
      createdAt: '',
      ...over,
    });
    const tools = [
      tool({ name: 'Cuadro rojo', type: 'rectangle', subject: 'Cuadro rojo' }),
      tool({ name: 'Flecha', type: 'line', style: { strokeColor: '#0000ff', strokeWidth: 2, opacity: 1, lineEndingEnd: 'closedArrow' }, mode: 'drawing' }),
      tool({ name: 'Nube', type: 'cloud', style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 } }),
      tool({ name: 'Metros', type: 'area', subject: 'Losa 10 cm', style: { strokeColor: '#800080', fillColor: '#8080ff', strokeWidth: 1, opacity: 1 } }),
      tool({ name: 'Sello', type: 'stamp' }),
    ];
    const exported = await toolsToBtxItems(tools);
    expect(exported.skipped.map((s) => s.name)).toEqual(['Sello']);
    expect(exported.items.map((i) => i.type.replace('Bluebeam.PDF.Annotations.', ''))).toEqual([
      'AnnotationSquare',
      'AnnotationLine',
      'AnnotationPolygon',
      'AnnotationMeasureArea',
    ]);
    // Como los de Revu: rectángulo en el origen, sin página, sin apariencia ni autor
    for (const i of exported.items) {
      expect(i.dict).toMatch(/\/Rect\[0 0 [\d.]+ [\d.]+\]/);
      expect(i.dict).not.toMatch(/\/(P|AP|T|NM|Popup)\b/);
      expect(i.name).toMatch(/^[A-Z]{16}$/);
    }
    const xml = await buildBtx({ title: 'Mis herramientas', items: exported.items });
    const back = await btxItemsToMarkups((await parseBtx(xml)).items);
    expect(back.skipped).toEqual([]);
    expect(back.tools.map((t) => [t.markup.type, t.markup.subject, t.mode])).toEqual([
      ['rectangle', 'Cuadro rojo', 'properties'],
      ['line', 'Flecha', 'drawing'],
      ['cloud', 'Nube', 'properties'],
      ['area', 'Losa 10 cm', 'properties'],
    ]);
    expect(back.tools[0].markup.style).toMatchObject({ strokeColor: '#e02424', fillColor: '#ffff00', strokeWidth: 3 });
    expect(back.tools[1].markup.style).toMatchObject({ strokeColor: '#0000ff', lineEndingEnd: 'closedArrow' });
    expect(back.tools[3].markup.style).toMatchObject({ strokeColor: '#800080' });
  });
});
