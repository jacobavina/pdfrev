import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { getMarkupSvgDescriptor } from '../markup/render';
import { emitMarkupOperators } from './operators';
import { saveIncrementalMarkups } from './incrementalWriter';
import { importPdfAnnotations } from './annotationReader';
import { Markup } from '../../types/markup';

describe('Cuadro de texto (/FreeText) — borde, relleno y alineación (ADR-0074)', () => {
  const blueprintPath = path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf');
  const originalBytes = new Uint8Array(fs.readFileSync(blueprintPath));

  const viewport = {
    width: 800,
    height: 600,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  const pageTransform = {
    widthPt: 800,
    heightPt: 600,
    rotation: 0 as const,
    originX: 0,
    originY: 0,
  };

  const baseTextMarkup = (overrides: Partial<Markup> = {}): Markup => ({
    id: 'ft-box-1',
    type: 'text',
    pageIndex: 0,
    layer: 'default',
    author: 'Estructural',
    createdAt: '2026-10-17T00:00:00Z',
    updatedAt: '2026-10-17T00:00:00Z',
    status: 'pending',
    points: [
      { x: 0.125, y: 0.2 }, // 100, 120 en 800x600
      { x: 0.325, y: 0.3 }, // 260, 180 en 800x600
    ],
    text: 'Viga IPE-300\nAcero S275JR',
    style: {
      strokeColor: '#1d4ed8',
      strokeWidth: 3,
      fillColor: '#dbeafe',
      opacity: 1,
      fontSize: 12,
      fontFamily: 'Courier',
      textColor: '#0f172a',
    },
    textFormat: {
      bold: true,
      italic: false,
      align: 'center',
    },
    ...overrides,
  });

  it('el cuadro de texto dibuja y conserva su borde, color de relleno y alineación en pantalla y en el PDF', async () => {
    const centered = baseTextMarkup({ id: 'ft-center', textFormat: { bold: true, italic: false, align: 'center' } });
    const rightAligned = baseTextMarkup({
      id: 'ft-right',
      points: [
        { x: 0.375, y: 0.2 }, // 300, 120
        { x: 0.575, y: 0.3 }, // 460, 180
      ],
      style: {
        strokeColor: '#dc2626',
        strokeWidth: 0,
        fillColor: 'transparent',
        opacity: 1,
        fontSize: 11,
        fontFamily: 'Times',
        textColor: '#7f1d1d',
      },
      textFormat: { bold: false, italic: true, align: 'right' },
    });

    // 1. Pantalla (SVG descriptor)
    const svgCenter = getMarkupSvgDescriptor(centered, viewport);
    expect(svgCenter.tag).toBe('g');
    const rectCenter = svgCenter.children?.find((e) => e.tag === 'rect');
    expect(rectCenter?.attrs.fill).toBe('#dbeafe');
    expect(rectCenter?.attrs.stroke).toBe('#1d4ed8');
    expect(rectCenter?.attrs.strokeWidth).toBe(3);
    const textCenter = svgCenter.children?.find((e) => e.tag === 'text');
    expect(textCenter?.attrs.textAnchor).toBe('middle');
    expect(textCenter?.attrs.x).toBe(180); // (100 + 260) / 2

    const svgRightNoBorder = getMarkupSvgDescriptor(rightAligned, viewport);
    const rectRight = svgRightNoBorder.children?.find((e) => e.tag === 'rect');
    expect(rectRight?.attrs.fill).toBe('transparent');
    expect(rectRight?.attrs.stroke).toBe('none');
    expect(rectRight?.attrs.strokeWidth).toBe(0);
    const textRight = svgRightNoBorder.children?.find((e) => e.tag === 'text');
    expect(textRight?.attrs.textAnchor).toBe('end');
    expect(Number(textRight?.attrs.x)).toBeCloseTo(460 - 6, 4);

    // 2. Apariencia PDF (/AP /N)
    const apCenter = emitMarkupOperators(centered, pageTransform);
    expect(apCenter.operators).toContain('3.00 w');
    expect(apCenter.operators).toContain('\nh\nB\n');
    const apRight = emitMarkupOperators(rightAligned, pageTransform);
    expect(apRight.operators).toContain('\nh\nn\n');

    // 3. Ida y vuelta en el PDF (/FreeText con /Q, /BS, /IC, /C y diccionario /REA)
    const savedBytes = await saveIncrementalMarkups(originalBytes, [centered, rightAligned], {});
    const pdfText = new TextDecoder('latin1').decode(savedBytes);
    expect(pdfText).toContain('/Subtype /FreeText');
    expect(pdfText).toContain('/Q 1');
    expect(pdfText).toContain('/Q 2');

    const { markups: reimported } = await importPdfAnnotations(savedBytes);
    const recCenter = reimported.find((m) => m.id === 'ft-center');
    expect(recCenter).toBeDefined();
    expect(recCenter!.style.strokeColor).toBe('#1d4ed8');
    expect(recCenter!.style.strokeWidth).toBe(3);
    expect(recCenter!.style.fillColor).toBe('#dbeafe');
    expect(recCenter!.style.fontFamily).toBe('Courier');
    expect(recCenter!.style.textColor).toBe('#0f172a');
    expect(recCenter!.textFormat?.bold).toBe(true);
    expect(recCenter!.textFormat?.align).toBe('center');

    const recRight = reimported.find((m) => m.id === 'ft-right');
    expect(recRight).toBeDefined();
    expect(recRight!.style.strokeWidth).toBe(0);
    expect(recRight!.style.fillColor).toBe('transparent');
    expect(recRight!.style.fontFamily).toBe('Times');
    expect(recRight!.style.textColor).toBe('#7f1d1d');
    expect(recRight!.textFormat?.italic).toBe(true);
    expect(recRight!.textFormat?.align).toBe('right');

    // 4. Si Acrobat/Revu cambia /Q en un FreeText existente, REA respeta el /Q estándar al reabrir
    const doc = await PDFDocument.load(savedBytes);
    const annots = doc.getPages()[0].node.Annots();
    for (let i = 0; i < annots!.size(); i++) {
      const dict = doc.context.lookup(annots!.get(i));
      if (dict instanceof PDFDict && dict.get(PDFName.of('NM'))?.toString() === '(ft-center)') {
        dict.set(PDFName.of('Q'), PDFNumber.of(2)); // Cambiado a alineación derecha en visor externo
      }
    }
    const externallyEditedBytes = await doc.save();
    const { markups: afterExternal } = await importPdfAnnotations(externallyEditedBytes);
    const afterCenter = afterExternal.find((m) => m.id === 'ft-center');
    expect(afterCenter?.textFormat?.align).toBe('right');
  });
});
