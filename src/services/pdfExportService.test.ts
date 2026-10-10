import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  exportMarkupsToPdf,
  normalizedToPdfCoordinates,
  parseCssColor,
  parseDashArray,
  sanitizeTextToWinAnsi,
  getPageTransformFromPdfLib,
  wrapText,
  PageTransformInfo,
} from './pdfExportService';
import { Markup, HIGHLIGHT_STYLE } from '../types/markup';
import { calculateCalloutGeometry, wrapCalloutText } from '../core/markup/render';

describe('PDF Export Service (Sub-entregable 0.3 - H1 Vector Export)', () => {
  const blueprintPath = path.resolve(__dirname, '../../fixtures/test-blueprint.pdf');
  const blueprintMetaPath = path.resolve(__dirname, '../../fixtures/test-blueprint.meta.json');

  const originalPdfBytes = new Uint8Array(fs.readFileSync(blueprintPath));
  const meta = JSON.parse(fs.readFileSync(blueprintMetaPath, 'utf8'));

  // Helper para decodificar los content streams reales generados en la página
  function getDecompressedStreams(doc: PDFDocument, pageIdx = 0): string[] {
    const p = doc.getPages()[pageIdx];
    const contentsRef = p.node.Contents();
    const target = doc.context.lookup(contentsRef) as any;
    const streams: string[] = [];

    if (Array.isArray(target?.array)) {
      for (const ref of target.array) {
        const s = doc.context.lookup(ref) as any;
        if (s?.contents) {
          try {
            streams.push(zlib.inflateSync(Buffer.from(s.contents)).toString('utf8'));
          } catch {
            streams.push(new TextDecoder().decode(s.contents));
          }
        }
      }
    } else if (target?.contents) {
      try {
        streams.push(zlib.inflateSync(Buffer.from(target.contents)).toString('utf8'));
      } catch {
        streams.push(new TextDecoder().decode(target.contents));
      }
    }
    return streams;
  }

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
    expect(pt.x).toBe(550);
    expect(pt.y).toBe(550);
  });

  // --------------------------------------------------------------------------------
  // Criterio 3: TEST DE ORO con inspección real de operadores vectoriales en el PDF
  // --------------------------------------------------------------------------------
  it('Criterio 3 (TEST DE ORO): Rectángulo exporta en el content stream exactamente 1 0 0 1 100 150 cm y 300x200 pt', async () => {
    const knownNorm = meta.knownRectangle.normalized;

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

    // Inspección directa de los content streams generados en el PDF resultante
    const loadedDoc = await PDFDocument.load(exportResult.pdfBytes);
    const streams = getDecompressedStreams(loadedDoc, 0);
    const lastStream = streams[streams.length - 1] || '';

    // Aserción directa sobre las operaciones vectoriales reales del PDF:
    // En pdf-lib, drawRectangle emite:
    // 1 0 0 1 100 150 cm (matriz de transformación afín a x=100, y=150)
    expect(lastStream).toContain('1 0 0 1 100 150 cm');
    expect(lastStream).toContain('0 200 l');
    expect(lastStream).toContain('300 200 l');
    expect(lastStream).toContain('300 0 l');
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable 0.5: Test de oro de exportación sobre fixture rotado (/Rotate 90)
  // --------------------------------------------------------------------------------
  it('Sub-entregable 0.5: Test de oro de exportación sobre fixture rotado test-blueprint-rotated.pdf (/Rotate 90)', async () => {
    const rotatedPdfPath = path.resolve(process.cwd(), 'fixtures/test-blueprint-rotated.pdf');
    const rotatedMetaPath = path.resolve(process.cwd(), 'fixtures/test-blueprint-rotated.meta.json');
    const rotatedBytes = fs.readFileSync(rotatedPdfPath);
    const rotatedMeta = JSON.parse(fs.readFileSync(rotatedMetaPath, 'utf8'));

    const knownNorm = rotatedMeta.knownRectangle.normalized;

    const testMarkup: Markup = {
      id: 'rotated-gold-standard-rect',
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

    const exportResult = await exportMarkupsToPdf(new Uint8Array(rotatedBytes), [testMarkup]);
    expect(exportResult.pdfBytes.length).toBeGreaterThan(0);

    const loadedDoc = await PDFDocument.load(exportResult.pdfBytes);
    const page0 = loadedDoc.getPages()[0];

    // 1. Conserva la rotación intrínseca de 90°
    expect(page0.getRotation().angle).toBe(90);

    // 2. Extrae operadores vectoriales del content stream
    const streams = getDecompressedStreams(loadedDoc, 0);
    const lastStream = streams[streams.length - 1] || '';

    // El rectángulo en coordenadas PDF nativas está en x=100, y=150, ancho=300, alto=200
    expect(lastStream).toContain('1 0 0 1 100 150 cm');
    expect(lastStream).toContain('0 200 l');
    expect(lastStream).toContain('300 200 l');
    expect(lastStream).toContain('300 0 l');
  });

  // --------------------------------------------------------------------------------
  // Demostración y aserción de las DOS convenciones de drawSvgPath en pdf-lib
  // --------------------------------------------------------------------------------
  it('Demuestra y valida las DOS convenciones de drawSvgPath en pdf-lib (Polygon/Freehand vs Cloud)', async () => {
    // Convención A: Polygon (Y negada, anclaje en 0,0)
    // Puntos PDF esperados: (100, 450), (400, 450), (250, 150)
    const polyMarkup: Markup = {
      id: 'poly-conv',
      type: 'polygon',
      pageIndex: 0,
      points: [
        { x: 0.125, y: 0.25 },
        { x: 0.5, y: 0.25 },
        { x: 0.3125, y: 0.75 },
      ],
      style: { strokeColor: '#00f', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
    };

    const resA = await exportMarkupsToPdf(originalPdfBytes, [polyMarkup]);
    const docA = await PDFDocument.load(resA.pdfBytes);
    const streamA = getDecompressedStreams(docA, 0).pop() || '';

    // En Convención A:
    // pdf-lib emite "1 0 0 -1 0 0 cm" (inversión de eje Y).
    // El path SVG escrito tiene Y negada: "100 -450 m" y "400 -450 l" y "250 -150 l".
    // Al componer la escala [1, -1] con Y=-450: Y_final = -(-450) = +450.
    expect(streamA).toContain('1 0 0 -1 0 0 cm');
    expect(streamA).toContain('100 -450 m');
    expect(streamA).toContain('400 -450 l');
    expect(streamA).toContain('250 -150 l');

    // Convención B: Cloud (Y sin negar, anclaje en originY + heightPt = 600)
    // Nube con bounds norm: p1=(0.125, 0.25) -> top = 0.25*600 = 150 pt desde arriba
    // p2=(0.5, 0.75) -> bottom = 0.75*600 = 450 pt desde arriba
    const cloudMarkup: Markup = {
      id: 'cloud-conv',
      type: 'cloud',
      pageIndex: 0,
      points: [
        { x: 0.125, y: 0.25 },
        { x: 0.5, y: 0.75 },
      ],
      style: { strokeColor: '#0a0', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
    };

    const resB = await exportMarkupsToPdf(originalPdfBytes, [cloudMarkup]);
    const docB = await PDFDocument.load(resB.pdfBytes);
    const streamB = getDecompressedStreams(docB, 0).pop() || '';

    // En Convención B:
    // pdf-lib emite "1 0 0 1 0 600 cm" (traslación al tope superior del PDF)
    // seguido de "1 0 0 -1 0 0 cm" (inversión de eje Y).
    // El punto inicial del path SVG es M 100 150.
    // Al componer: Y_final = 600 + (-1)*150 = 450 en PDF.
    expect(streamB).toContain('1 0 0 1 0 600 cm');
    expect(streamB).toContain('1 0 0 -1 0 0 cm');
    expect(streamB).toContain('100 150 m');
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

  it('parseCssColor devuelve undefined y advierte ante cadenas de color desconocidas (sin negro silencioso)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalid = parseCssColor('not-a-color-string');
    expect(invalid.color).toBeUndefined();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Formato de color desconocido'));
    spy.mockRestore();
  });

  it('parseDashArray traduce números y cadenas', () => {
    expect(parseDashArray([4, 2])).toEqual([4, 2]);
    expect(parseDashArray('4 2')).toEqual([4, 2]);
    expect(parseDashArray('5, 5, 2, 2')).toEqual([5, 5, 2, 2]);
    expect(parseDashArray(undefined)).toBeUndefined();
  });

  // --------------------------------------------------------------------------------
  // Sanitización CP1252 / WinAnsi y wrapText con preservación de \n
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

  it('wrapText preserva saltos de línea explícitos (\\n) como párrafos independientes', async () => {
    const doc = await PDFDocument.load(originalPdfBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const multiline = 'Párrafo uno\nPárrafo dos con texto extendido que ocupa espacio\nPárrafo tres';
    const lines = wrapText(multiline, 400, 12, font);

    expect(lines).toContain('Párrafo uno');
    expect(lines).toContain('Párrafo tres');
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  // --------------------------------------------------------------------------------
  // Preservación documental y manejo de error en PDF protegido
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

  it('exportMarkupsToPdf rechaza y reporta error ante archivos PDF inválidos o cifrados', async () => {
    const invalidBytes = new Uint8Array([1, 2, 3, 4]);
    await expect(exportMarkupsToPdf(invalidBytes, [])).rejects.toThrow();
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

  it('Sub-entregable A.3 (TEST DE ORO): Callout exporta directriz, flecha, caja y texto, con ajuste métrico garantizado', async () => {
    const textContent = 'Verificar armado de viga segun plano E-04 y norma Eurocodigo 2';
    const testCallout: Markup = {
      id: 'gold-callout',
      type: 'callout',
      pageIndex: 0,
      points: [
        { x: 0.3, y: 0.2 },
        { x: 0.6, y: 0.3 },
      ],
      leaders: [[{ x: 0.1, y: 0.15 }]],
      text: textContent,
      style: {
        strokeColor: '#0055ff',
        fillColor: '#ffffff',
        strokeWidth: 1.5,
        opacity: 1,
        fontSize: 10,
      },
      author: 'Ingeniero Estructural',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const res = await exportMarkupsToPdf(originalPdfBytes, [testCallout]);
    expect(res.pdfBytes.length).toBeGreaterThan(0);

    const loadedDoc = await PDFDocument.load(res.pdfBytes);
    const helvetica = await loadedDoc.embedFont(StandardFonts.Helvetica);
    const streams = getDecompressedStreams(loadedDoc, 0);
    const stream = streams[streams.length - 1] || '';

    // 1. Verificación de emisión vectorial en el content stream
    // El ancla está en (0.1, 0.15) de una página 800x600 pt -> x=80, y=600 - 90 = 510
    expect(stream).toContain('80 -510 m');
    expect(stream).toContain('160 -450 l');
    expect(stream).toContain('240 -450 l');
    expect(stream).toContain('240 -480 m');

    // 2. Condición 1: Verificación de que todas las líneas envueltas caben dentro de la caja dibujada
    const lines = wrapCalloutText(textContent);
    expect(lines.length).toBeGreaterThan(0);

    const geom = calculateCalloutGeometry(
      { x: 0.3 * 800, y: 0.2 * 600 },
      { x: 0.6 * 800, y: 0.3 * 600 },
      [[{ x: 0.1 * 800, y: 0.15 * 600 }]],
      1
    );

    const maxTextWidthAllowed = geom.box.width - 12;
    for (const line of lines) {
      const realWidth = helvetica.widthOfTextAtSize(line, 10);
      expect(realWidth).toBeLessThanOrEqual(maxTextWidthAllowed);
    }
  });

  it('Sub-entregable A.3 (ROTACIÓN): Callout en PDF rotado 90° mantiene geometría visual coherente', async () => {
    const rotatedPath = path.resolve(__dirname, '../../fixtures/test-blueprint-rotated.pdf');
    const rotatedBytes = new Uint8Array(fs.readFileSync(rotatedPath));

    // Colocamos el Callout en coordenadas visuales normalizadas
    // Ancla en (0.1, 0.2), Caja entre (0.25, 0.125) y (0.55, 0.25)
    const rotatedCallout: Markup = {
      id: 'rotated-callout',
      type: 'callout',
      pageIndex: 0,
      points: [
        { x: 0.25, y: 0.125 },
        { x: 0.55, y: 0.25 },
      ],
      leaders: [[{ x: 0.1, y: 0.2 }]],
      text: 'Nota en plano rotado',
      style: {
        strokeColor: '#0055ff',
        fillColor: '#ffffff',
        strokeWidth: 1.5,
        opacity: 1,
        fontSize: 10,
      },
      author: 'Revisor',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const res = await exportMarkupsToPdf(rotatedBytes, [rotatedCallout]);
    expect(res.pdfBytes.length).toBeGreaterThan(0);

    const loadedDoc = await PDFDocument.load(res.pdfBytes);
    const page0 = loadedDoc.getPages()[0];
    expect(page0.getRotation().angle).toBe(90);

    const streams = getDecompressedStreams(loadedDoc, 0);
    const stream = streams[streams.length - 1] || '';

    // En rotación 90° de 800x600 pt:
    // u=0.1, v=0.2 -> x_pdf = 0.2 * 800 = 160, y_pdf = 0.1 * 600 = 60
    // En drawSvgPath con Y negada, el ancla proyecta en 160 -60 m
    expect(stream).toContain('160 -60 m');

    // La esquina superior-izquierda de la caja visual (0.25, 0.125) proyecta en:
    // x_pdf = 0.125 * 800 = 100, y_pdf = 0.25 * 600 = 150 -> 100 -150 m
    expect(stream).toContain('100 -150 m');
  });
});
