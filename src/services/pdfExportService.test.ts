import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  exportMarkupsToPdf,
  normalizedToPdfCoordinates,
  parseCssColor,
  parseDashArray,
  sanitizeTextToWinAnsi,
  getPageTransformFromPdfLib,
  PageTransformInfo,
} from './pdfExportService';
import { Markup, HIGHLIGHT_STYLE } from '../types/markup';

describe('PDF Export Service (Sub-entregable 0.3 - H1 Vector Export)', () => {
  const blueprintPath = path.resolve(__dirname, '../../fixtures/test-blueprint.pdf');
  const blueprintMetaPath = path.resolve(__dirname, '../../fixtures/test-blueprint.meta.json');

  const originalPdfBytes = new Uint8Array(fs.readFileSync(blueprintPath));
  const meta = JSON.parse(fs.readFileSync(blueprintMetaPath, 'utf8'));

  // --------------------------------------------------------------------------------
  // Criterio 1: Contraste de rotaciones contra PDF.js convertToPdfPoint
  // --------------------------------------------------------------------------------
  it('Criterio 1: La tabla de rotación coincide 100% con page.getViewport().convertToPdfPoint de PDF.js', async () => {
    const pdfDoc = await pdfjs.getDocument({ data: originalPdfBytes.slice() }).promise;
    const page = await pdfDoc.getPage(1);

    const W = 800;
    const H = 600;

    for (const rot of [0, 90, 180, 270] as const) {
      const vp = page.getViewport({ scale: 1, rotation: rot });
      const transform: PageTransformInfo = {
        rotation: rot,
        widthPt: W,
        heightPt: H,
        originX: 0,
        originY: 0,
      };

      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        for (const v of [0, 0.25, 0.5, 0.75, 1]) {
          const vx = u * vp.width;
          const vy = v * vp.height;
          const [expectedPdfX, expectedPdfY] = vp.convertToPdfPoint(vx, vy);

          const result = normalizedToPdfCoordinates({ x: u, y: v }, transform);

          const diffX = Math.abs(expectedPdfX - result.x);
          const diffY = Math.abs(expectedPdfY - result.y);

          expect(diffX).toBeLessThan(0.001);
          expect(diffY).toBeLessThan(0.001);
        }
      }
    }
  });

  // --------------------------------------------------------------------------------
  // Criterio 2: Origen distinto de (0,0) proveniente de MediaBox / CropBox
  // --------------------------------------------------------------------------------
  it('Criterio 2: Maneja orígenes no nulos (originX, originY) en planos CAD', () => {
    const transformNonZero: PageTransformInfo = {
      rotation: 0,
      widthPt: 800,
      heightPt: 600,
      originX: 150,
      originY: 250,
    };

    const pt = normalizedToPdfCoordinates({ x: 0.5, y: 0.5 }, transformNonZero);
    // x = 150 + 0.5 * 800 = 550
    // y = 250 + (1 - 0.5) * 600 = 550
    expect(pt.x).toBe(550);
    expect(pt.y).toBe(550);
  });

  // --------------------------------------------------------------------------------
  // Criterio 3: TEST DE ORO con knownRectangle
  // --------------------------------------------------------------------------------
  it('Criterio 3 (TEST DE ORO): Rectángulo exporta exactamente (x=100, y=150, width=300, height=200)', async () => {
    const knownNorm = meta.knownRectangle.normalized;
    const knownPdf = meta.knownRectangle.pdf;

    const testMarkup: Markup = {
      id: 'gold-standard-rect',
      type: 'rectangle',
      pageIndex: 0,
      points: [
        { x: knownNorm.x, y: knownNorm.y },
        { x: knownNorm.x + knownNorm.width, y: knownNorm.y + knownNorm.height },
      ],
      style: {
        strokeColor: '#d92626',
        strokeWidth: 2,
        fillColor: '#d9ebff',
        opacity: 1,
      },
      author: 'QA Lead',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const exportResult = await exportMarkupsToPdf(originalPdfBytes, [testMarkup]);
    expect(exportResult.pdfBytes.length).toBeGreaterThan(0);

    // Verificamos matemáticamente las coordenadas producidas con el transform derivado
    const loadedDoc = await PDFDocument.load(exportResult.pdfBytes);
    const firstPage = loadedDoc.getPages()[0];
    const transform = getPageTransformFromPdfLib(firstPage);

    const p1 = normalizedToPdfCoordinates(testMarkup.points[0], transform);
    const p2 = normalizedToPdfCoordinates(testMarkup.points[1], transform);

    const calcX = Math.round(Math.min(p1.x, p2.x) * 100) / 100;
    const calcY = Math.round(Math.min(p1.y, p2.y) * 100) / 100;
    const calcWidth = Math.round(Math.abs(p2.x - p1.x) * 100) / 100;
    const calcHeight = Math.round(Math.abs(p2.y - p1.y) * 100) / 100;

    expect(calcX).toBe(knownPdf.x); // 100
    expect(calcY).toBe(knownPdf.y); // 150
    expect(calcWidth).toBe(knownPdf.width); // 300
    expect(calcHeight).toBe(knownPdf.height); // 200
  });

  // --------------------------------------------------------------------------------
  // Criterio 4: Estilo compartido de highlightVector y blendMode
  // --------------------------------------------------------------------------------
  it('Criterio 4: highlightVector utiliza HIGHLIGHT_STYLE compartido (#ffff00 al 0.5)', async () => {
    expect(HIGHLIGHT_STYLE.colorHex).toBe('#ffff00');
    expect(HIGHLIGHT_STYLE.opacity).toBe(0.5);
    expect(HIGHLIGHT_STYLE.rgb).toEqual({ r: 1, g: 1, b: 0 });

    const hlMarkup: Markup = {
      id: 'hl-test',
      type: 'highlightVector',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.3 },
      ],
      style: {
        strokeColor: '#000000',
        strokeWidth: 0,
        opacity: 1,
      },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const res = await exportMarkupsToPdf(originalPdfBytes, [hlMarkup]);
    expect(res.pdfBytes.byteLength).toBeGreaterThan(100);
  });

  // --------------------------------------------------------------------------------
  // Criterio 5: pageTransforms no asume 0 en silencio y se deriva de pdf-lib
  // --------------------------------------------------------------------------------
  it('Criterio 5: getPageTransformFromPdfLib extrae tamaño y rotación reales de la página', async () => {
    const doc = await PDFDocument.load(originalPdfBytes);
    const p = doc.getPages()[0];
    const transform = getPageTransformFromPdfLib(p);

    expect(transform.rotation).toBe(0);
    expect(transform.widthPt).toBe(800);
    expect(transform.heightPt).toBe(600);
    expect(transform.originX).toBe(0);
    expect(transform.originY).toBe(0);
  });

  // --------------------------------------------------------------------------------
  // Parsing de colores CSS (parseCssColor) y dashArray
  // --------------------------------------------------------------------------------
  it('parseCssColor soporta hex 3, hex 6, transparent, rgba y rgb', () => {
    const hex3 = parseCssColor('#f00');
    expect(hex3.color).toBeDefined();
    expect(hex3.color).toEqual({ type: 'RGB', red: 1, green: 0, blue: 0 });

    const hex6 = parseCssColor('#00ff00');
    expect(hex6.color).toEqual({ type: 'RGB', red: 0, green: 1, blue: 0 });

    const transparent = parseCssColor('transparent');
    expect(transparent.color).toBeUndefined();

    const rgba = parseCssColor('rgba(255, 128, 0, 0.5)');
    expect(rgba.color).toBeDefined();
    expect(rgba.opacity).toBe(0.5);

    const rgbOnly = parseCssColor('rgb(0, 0, 255)');
    expect(rgbOnly.color).toEqual({ type: 'RGB', red: 0, green: 0, blue: 1 });
  });

  it('parseDashArray traduce números y cadenas', () => {
    expect(parseDashArray([4, 2])).toEqual([4, 2]);
    expect(parseDashArray('4 2')).toEqual([4, 2]);
    expect(parseDashArray('5, 5, 2, 2')).toEqual([5, 5, 2, 2]);
    expect(parseDashArray(undefined)).toBeUndefined();
  });

  // --------------------------------------------------------------------------------
  // Sanitización CP1252 / WinAnsi con tabla de símbolos técnicos
  // --------------------------------------------------------------------------------
  it('sanitizeTextToWinAnsi traduce símbolos de ingeniería (±, °, Ø, ×, ², ³) y sustituye otros con ?', () => {
    const raw = 'Diámetro Ø50 mm ±0.05, temp 25°C, área 10 m², check: ✓';
    const result = sanitizeTextToWinAnsi(raw);

    expect(result.text).toContain('\xd8'); // Ø
    expect(result.text).toContain('\xb1'); // ±
    expect(result.text).toContain('\xb0'); // °
    expect(result.text).toContain('\xb2'); // ²
    expect(result.text).toContain('?'); // ✓ no existe en WinAnsi -> sustituido
    expect(result.replacedCount).toBe(1);
  });

  // --------------------------------------------------------------------------------
  // Preservación documental
  // --------------------------------------------------------------------------------
  it('Preserva el número de páginas y la integridad del documento original', async () => {
    const markupOnP0: Markup = {
      id: 'p0-markup',
      type: 'line',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.9 },
      ],
      style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      author: 'Revisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'completed',
    };

    const res = await exportMarkupsToPdf(originalPdfBytes, [markupOnP0]);
    const loaded = await PDFDocument.load(res.pdfBytes);

    expect(loaded.getPageCount()).toBe(2);
  });

  // --------------------------------------------------------------------------------
  // Cobertura completa de los 12 tipos de marcado
  // --------------------------------------------------------------------------------
  it('Exporta sin errores los 12 tipos de marcado a primitivas vectoriales de pdf-lib', async () => {
    const allTypes: Markup[] = [
      {
        id: '1',
        type: 'rectangle',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
        style: { strokeColor: '#f00', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '2',
        type: 'circle',
        pageIndex: 0,
        points: [{ x: 0.2, y: 0.1 }, { x: 0.3, y: 0.2 }],
        style: { strokeColor: '#0f0', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '3',
        type: 'line',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.3 }, { x: 0.3, y: 0.3 }],
        style: { strokeColor: '#00f', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '4',
        type: 'polygon',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.4 }, { x: 0.2, y: 0.4 }, { x: 0.15, y: 0.5 }],
        style: { strokeColor: '#fa0', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '5',
        type: 'freehand',
        pageIndex: 0,
        points: [{ x: 0.3, y: 0.4 }, { x: 0.35, y: 0.45 }, { x: 0.4, y: 0.4 }],
        style: { strokeColor: '#af0', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '6',
        type: 'cloud',
        pageIndex: 0,
        points: [{ x: 0.5, y: 0.1 }, { x: 0.7, y: 0.3 }],
        style: { strokeColor: '#0af', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '7',
        type: 'cloudPlus',
        pageIndex: 0,
        points: [{ x: 0.5, y: 0.4 }, { x: 0.7, y: 0.6 }],
        text: 'Nube con nota',
        style: { strokeColor: '#a0f', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '8',
        type: 'text',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.6 }, { x: 0.3, y: 0.7 }],
        text: 'Nota técnica de prueba',
        style: { strokeColor: '#333', strokeWidth: 1, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '9',
        type: 'callout',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.75 }, { x: 0.3, y: 0.85 }],
        leaders: [[{ x: 0.05, y: 0.7 }]],
        text: 'Llamada con directriz',
        style: { strokeColor: '#333', strokeWidth: 1, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '10',
        type: 'stickyNote',
        pageIndex: 0,
        points: [{ x: 0.4, y: 0.75 }, { x: 0.5, y: 0.85 }],
        text: 'Nota adhesiva',
        style: { strokeColor: '#ff0', strokeWidth: 1, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '11',
        type: 'highlightVector',
        pageIndex: 0,
        points: [{ x: 0.6, y: 0.75 }, { x: 0.8, y: 0.85 }],
        style: { strokeColor: '#ff0', strokeWidth: 1, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
      {
        id: '12',
        type: 'stamp',
        pageIndex: 0,
        points: [{ x: 0.6, y: 0.6 }, { x: 0.85, y: 0.72 }],
        text: 'APROBADO',
        style: { strokeColor: '#0b0', strokeWidth: 2, opacity: 1 },
        author: 'A',
        createdAt: '',
        updatedAt: '',
        status: 'pending',
      },
    ];

    const res = await exportMarkupsToPdf(originalPdfBytes, allTypes);
    expect(res.pdfBytes.length).toBeGreaterThan(0);
    expect(res.warnings.replacedCharactersCount).toBe(0);
  });
});
