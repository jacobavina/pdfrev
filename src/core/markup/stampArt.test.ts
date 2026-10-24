import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { STAMPS, STAMP_GROUPS, stampById } from './stamps';
import { stampArt, stampTexts, stampDefaultSize } from './stampArt';
import { emitMarkupOperators, PageTransformInfo } from '../pdf/operators';
import { saveIncrementalMarkups } from '../pdf/incrementalWriter';
import { importPdfAnnotations } from '../pdf/annotationReader';
import { Markup } from '../../types/markup';

const ISO = '2026-10-15T16:18:40';
const box = { x: 0, y: 0, w: 120, h: 36 };

describe('Sellos de Revu y Foxit (ADR-0045)', () => {
  it('el catálogo tiene los sellos de Revu, los dinámicos, estándar y de firma de Foxit, y los de obra', () => {
    expect(STAMP_GROUPS).toEqual(['Revu', 'Dynamic', 'Standard', 'Sign Here', 'Construction']);
    const labels = (g: string) => STAMPS.filter((s) => s.group === g).map((s) => s.label);
    expect(labels('Revu')).toEqual(
      expect.arrayContaining(['For Review', 'APPROVED', 'Date', 'Draft Print', 'Preliminary', 'Released'.toUpperCase(), 'Revised', 'Sample Text', 'Watermark'])
    );
    expect(labels('Dynamic')).toEqual(['APPROVED', 'REVISED', 'REVIEWED', 'RECEIVED', 'CONFIDENTIAL']);
    expect(labels('Standard')).toHaveLength(12);
    expect(labels('Sign Here')).toEqual(['ACCEPTED', 'WITNESS', 'SIGN HERE', 'REJECTED', 'INITIAL']);
    expect(labels('Construction')).toContain('NOT FOR CONSTRUCTION');
    expect(new Set(STAMPS.map((s) => s.id)).size).toBe(STAMPS.length);
  });

  it('texto dinámico al colocarlo: Foxit con autor, fecha y hora; Revu con fecha y hora; sellos de fecha', () => {
    expect(stampTexts(stampById('dyn-approved'), 'reviewer', ISO).subtitle).toBe('reviewer, 15/10/2026, 04:18:40 pm');
    expect(stampTexts(stampById('rv-for-review'), 'Ana', ISO)).toEqual({ title: 'For Review', subtitle: '15/10/2026 04:18:40 pm' });
    expect(stampTexts(stampById('rv-date'), 'Ana', ISO).title).toBe('15/10/2026');
    expect(stampTexts(stampById('rv-eu-date'), 'Ana', ISO).title).toBe('15.10.2026');
    expect(stampTexts(stampById('rv-datetime'), 'Ana', ISO).title).toBe('15/10/2026 04:18 pm');
    expect(stampTexts(stampById('rv-released'), 'Ana', ISO).subtitle).toBe('Ana\n15/10/2026');
    expect(stampTexts(stampById('std-void'), 'Ana', ISO).subtitle).toBe('');
    expect(stampTexts(stampById('approved'), 'Ana', ISO).subtitle).toBe('By Ana at 4:18 pm, Oct 15, 2026');
  });

  it('Foxit: caja del color del sello, marco blanco interior, icono y texto blancos', () => {
    const def = stampById('std-reviewed');
    const prims = stampArt(def, box, 'REVIEWED', '', def.color);
    expect(prims[0]).toMatchObject({ t: 'path', fill: def.color });
    expect(prims[1]).toMatchObject({ t: 'path', stroke: '#ffffff' });
    expect(prims[2]).toMatchObject({ t: 'path', stroke: '#ffffff' }); // lupa
    expect(prims[3]).toMatchObject({ t: 'text', text: 'REVIEWED', color: '#ffffff' });
    // Dinámico: título y línea en negrita alineados a la izquierda
    const dyn = stampArt(stampById('dyn-received'), box, 'RECEIVED', 'Ana, 15/10/2026, 04:18:40 pm', '#3f9a73');
    expect(dyn.filter((p) => p.t === 'text').map((p) => p.t === 'text' && p.align)).toEqual(['left', 'left']);
  });

  it('Revu: título en negrita del color del sello y línea de fecha gris, sin marco (Approved sí lo lleva)', () => {
    const fr = stampArt(stampById('rv-for-review'), box, 'For Review', '15/10/2026 04:18:40 pm', '#7cb342');
    expect(fr.some((p) => p.t === 'path')).toBe(false);
    expect(fr[0]).toMatchObject({ t: 'text', text: 'For Review', bold: true, color: '#7cb342' });
    expect(fr[1]).toMatchObject({ t: 'text', color: '#374151' });
    expect(stampArt(stampById('rv-approved'), box, 'APPROVED', '', '#1f2937')[0]).toMatchObject({ t: 'path', stroke: '#1f2937' });
    // Etiqueta en flecha con texto en cursiva negrita; sello circular con doble anillo
    const tag = stampArt(stampById('rv-tag'), box, 'Sample Text', '', '#e02424');
    expect(tag[1]).toMatchObject({ bold: true, italic: true });
    expect(stampArt(stampById('rv-seal'), { x: 0, y: 0, w: 64, h: 64 }, 'SEAL', '', '#1f2937').filter((p) => p.t === 'path')).toHaveLength(3);
    // El título largo se reduce para caber en la caja
    const tight = stampArt(stampById('rv-preliminary'), { x: 0, y: 0, w: 40, h: 36 }, 'Preliminary', '', '#8b1a1a');
    expect(tight[0].t === 'text' && tight[0].size).toBeLessThan(36 * 0.6);
    expect(stampDefaultSize(stampById('rv-seal'), 'SEAL', '')).toEqual({ width: 64, height: 64 });
  });

  it('el /AP dibuja el mismo sello (caja rellena, cursiva negrita) y el sello vuelve igual al abrir el PDF', async () => {
    const transform: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
    const mk = (id: string, title: string, subtitle: string): Markup => ({
      id: `m-${id}`,
      type: 'stamp',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.16 }],
      text: title,
      style: { strokeColor: stampById(id).color, strokeWidth: 2, opacity: 1 },
      author: 'Ana',
      createdAt: ISO,
      updatedAt: ISO,
      status: 'pending',
      customFields: { stampId: id, stampSubtitle: subtitle },
    });
    const filled = emitMarkupOperators(mk('std-approved', 'APPROVED', ''), transform);
    expect(filled.operators).toMatch(/^f$/m);
    expect(filled.operators).toContain('1.000 1.000 1.000 RG'); // marco blanco
    const tag = emitMarkupOperators(mk('rv-tag', 'Sample Text', ''), transform);
    expect(tag.extraFonts).toEqual({ HeBO: 'Helvetica-BoldOblique' });
    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
    const back = await importPdfAnnotations(await saveIncrementalMarkups(blueprint, [mk('rv-for-review', 'For Review', '15/10/2026 04:18:40 pm')]));
    const m = back.markups.find((x) => x.id === 'm-rv-for-review')!;
    expect(m.customFields?.stampId).toBe('rv-for-review');
    expect(m.text).toBe('For Review');
  });
});
