import { countSymbolOf } from '../core/markup/countSymbols';
import { revisionCloudPathNormalized, cloudParams } from '../core/markup/revisionCloud';
import { markupLinePattern } from '../core/markup/linePatterns';
import { calloutBoxPaint } from '../core/markup/calloutLayout';
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  StandardFonts,
  rgb,
  RGB,
  BlendMode,
  LineCapStyle,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  setFillingColor,
  setStrokingColor,
  setLineWidth,
  rectangle,
  fillAndStroke,
  moveTo,
  lineTo,
  stroke,
} from 'pdf-lib';
import {
  Markup,
  MarkupPoint,
  HIGHLIGHT_STYLE,
  STICKY_NOTE_SIZE_PT,
  STICKY_NOTE_COLORS,
} from '../types/markup';
import {
  DEFAULT_ARC_STEP,
  calculateCalloutGeometry,
  wrapCalloutText,
  CALLOUT_MIN_BOX_WIDTH,
} from '../core/markup/render';
import { getStickyNoteNormalizedSize } from '../utils/coordinates';
import { lineEndingShape, lineEndingSize, endpointAngles, CALLOUT_ARROW_HALF_ANGLE } from '../core/markup/lineEndings';
import { emitMarkupOperators } from '../core/pdf/operators';
import { PDFName, drawObject } from 'pdf-lib';

/**
 * Extremos de línea en el PDF aplanado (ADR-0018), con la misma geometría que la pantalla y el /AP.
 */
function drawLineEndingsFlat(
  page: PDFPage,
  pdfPts: { x: number; y: number }[],
  markup: Markup,
  color: RGB,
  opacity: number,
  halfAngle?: number
): void {
  const angles = endpointAngles(pdfPts);
  if (!angles) return;
  const size = lineEndingSize(markup.style.strokeWidth ?? 1);
  const width = markup.style.strokeWidth ?? 1;
  const items: [{ x: number; y: number }, number, Markup['style']['lineEndingStart']][] = [
    [pdfPts[0], angles.start, markup.style.lineEndingStart],
    [pdfPts[pdfPts.length - 1], angles.end, markup.style.lineEndingEnd],
  ];
  for (const [tip, angle, ending] of items) {
    const shape = lineEndingShape(tip, angle, ending, size, true, halfAngle);
    if (!shape) continue;
    if (shape.kind === 'circle') {
      page.drawEllipse({
        x: shape.cx,
        y: shape.cy,
        xScale: shape.r,
        yScale: shape.r,
        color: shape.filled ? color : undefined,
        borderColor: color,
        borderWidth: width,
        opacity,
        borderOpacity: opacity,
      });
      continue;
    }
    // drawSvgPath invierte el eje Y: se pasan las Y en negativo
    let d = `M ${shape.points[0].x.toFixed(2)} ${(-shape.points[0].y).toFixed(2)}`;
    for (const p of shape.points.slice(1)) d += ` L ${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`;
    if (shape.kind === 'polygon') d += ' Z';
    page.drawSvgPath(d, {
      x: 0,
      y: 0,
      color: shape.filled ? color : undefined,
      borderColor: color,
      borderWidth: width,
      opacity,
      borderOpacity: opacity,
      borderLineCap: LineCapStyle.Round,
    });
  }
}

/**
 * Tipos sin dibujo propio en el aplanado (polilínea, subrayado, tachado y mediciones): se pintan con el mismo
 * emisor de operadores que genera el /AP de las anotaciones, como Form XObject. Así "Exportar PDF" no pierde
 * ninguna marca y se ve igual que la anotación.
 */
function drawViaAppearanceOperators(
  pdfDoc: PDFDocument,
  page: PDFPage,
  markup: Markup,
  transform: PageTransformInfo
): void {
  const emitted = emitMarkupOperators(markup, transform);
  if (!emitted.operators.trim()) return;
  const pad = 20;
  const [x0, y0, x1, y1] = emitted.bbox;
  const resources = pdfDoc.context.obj({});
  const gs = emitted.extGState;
  if (gs && (gs.bm || gs.ca !== undefined || gs.CA !== undefined)) {
    resources.set(
      PDFName.of('ExtGState'),
      pdfDoc.context.obj({
        GS_HL: {
          Type: 'ExtGState',
          BM: (gs.bm ?? '/Normal').replace(/^\//, ''),
          ca: gs.ca ?? 1,
          CA: gs.CA ?? 1,
        },
      })
    );
  }
  if (emitted.fontName || emitted.boldFontName || emitted.extraFonts) {
    const fonts: Record<string, unknown> = {};
    for (const [name, base] of Object.entries(emitted.extraFonts ?? {})) {
      fonts[name] = { Type: 'Font', Subtype: 'Type1', BaseFont: base, Encoding: 'WinAnsiEncoding' };
    }
    if (emitted.fontName) {
      fonts[emitted.fontName] = { Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' };
    }
    if (emitted.boldFontName) {
      fonts[emitted.boldFontName] = { Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica-Bold', Encoding: 'WinAnsiEncoding' };
    }
    resources.set(PDFName.of('Font'), pdfDoc.context.obj(fonts as never));
  }
  const stream = pdfDoc.context.stream(emitted.operators, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [x0 - pad, y0 - pad, x1 + pad, y1 + pad],
    Resources: resources,
  });
  const ref = pdfDoc.context.register(stream);
  const name: PDFName = page.node.newXObject('REAMarkup', ref);
  page.pushOperators(pushGraphicsState(), drawObject(name), popGraphicsState());
}

/** Etiqueta de valor de las mediciones (longitud, área, conteo) en el aplanado. */
function drawMeasurementLabel(
  page: PDFPage,
  markup: Markup,
  transform: PageTransformInfo,
  font: PDFFont
): void {
  const value = markup.measurement?.formatted;
  if (!value || markup.points.length === 0) return;
  // Radio y diámetro llevan su prefijo, como en pantalla (ADR-0029)
  const label = markup.type === 'radius' ? `R ${value}` : markup.type === 'diameter' ? `Ø ${value}` : value;
  const pts = markup.points.map((p) => normalizedToPdfCoordinates(p, transform));
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const { text } = sanitizeTextToWinAnsi(label);
  const size = 9;
  const w = font.widthOfTextAtSize(text, size);
  page.drawRectangle({
    x: cx - w / 2 - 3,
    y: cy - 3,
    width: w + 6,
    height: size + 5,
    color: rgb(1, 1, 1),
    opacity: 0.9,
    borderColor: rgb(0.85, 0.15, 0.15),
    borderWidth: 0.75,
  });
  page.drawText(text, { x: cx - w / 2, y: cy, size, font, color: rgb(0.1, 0.1, 0.1) });
}

export interface PageTransformInfo {
  rotation: 0 | 90 | 180 | 270;
  widthPt: number;
  heightPt: number;
  originX: number;
  originY: number;
}

export interface PdfExportOptions {
  pageTransforms?: Record<number, PageTransformInfo>;
}

export interface PdfExportResult {
  pdfBytes: Uint8Array;
  warnings: {
    replacedCharactersCount: number;
  };
}

/**
 * Tabla de reemplazo y equivalencia para caracteres y símbolos técnicos comunes
 * que no existen en WinAnsi / StandardFonts.
 */
const WIN_ANSI_REPLACEMENTS: Record<string, string> = {
  '±': '\xb1',
  '°': '\xb0',
  'Ø': '\xd8',
  'ø': '\xf8',
  '×': '\xd7',
  '²': '\xb2',
  '³': '\xb3',
  'µ': '\xb5',
  '·': '\xb7',
  '©': '\xa9',
  '®': '\xae',
  '¼': '\xbc',
  '½': '\xbd',
  '¾': '\xbe',
  '«': '\xab',
  '»': '\xbb',
};

/**
 * Sanitiza texto hacia el juego de caracteres WinAnsi / CP1252.
 * Reemplaza caracteres fuera de norma por '?' e incrementa el contador de avisos,
 * evitando abortos de exportación por excepciones de fuente.
 */
export function sanitizeTextToWinAnsi(input: string): {
  text: string;
  replacedCount: number;
} {
  let replacedCount = 0;
  let result = '';

  for (const char of input) {
    if (WIN_ANSI_REPLACEMENTS[char]) {
      result += WIN_ANSI_REPLACEMENTS[char];
    } else {
      const code = char.charCodeAt(0);
      if (
        (code >= 32 && code <= 126) ||
        (code >= 160 && code <= 255) ||
        code === 10 ||
        code === 13 ||
        code === 9
      ) {
        result += char;
      } else {
        result += '?';
        replacedCount++;
      }
    }
  }

  return { text: result, replacedCount };
}

/**
 * Parsea cadenas de color CSS (hex 3/6, rgba, rgb, transparent) a valores nativos de pdf-lib.
 * Si el color es 'transparent' o tiene opacidad 0, devuelve color undefined para no pintar relleno.
 */
export function parseCssColor(colorStr: string | undefined): {
  color: RGB | undefined;
  opacity?: number;
} {
  if (!colorStr || colorStr === 'transparent') {
    return { color: undefined };
  }
  const trimmed = colorStr.trim().toLowerCase();

  // Hex 3 dígitos (#rgb)
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const r = parseInt(trimmed[1] + trimmed[1], 16) / 255;
    const g = parseInt(trimmed[2] + trimmed[2], 16) / 255;
    const b = parseInt(trimmed[3] + trimmed[3], 16) / 255;
    return { color: rgb(r, g, b), opacity: 1 };
  }

  // Hex 6 dígitos (#rrggbb)
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    const r = parseInt(trimmed.slice(1, 3), 16) / 255;
    const g = parseInt(trimmed.slice(3, 5), 16) / 255;
    const b = parseInt(trimmed.slice(5, 7), 16) / 255;
    return { color: rgb(r, g, b), opacity: 1 };
  }

  // rgba(r, g, b, a)
  const rgbaMatch = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(trimmed);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10) / 255;
    const g = parseInt(rgbaMatch[2], 10) / 255;
    const b = parseInt(rgbaMatch[3], 10) / 255;
    const a = parseFloat(rgbaMatch[4]);
    if (a <= 0) return { color: undefined, opacity: 0 };
    return { color: rgb(r, g, b), opacity: a };
  }

  // rgb(r, g, b)
  const rgbMatch = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(trimmed);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return { color: rgb(r, g, b), opacity: 1 };
  }

  // Fallback: advertir y devolver undefined en vez de negro sólido en silencio
  console.warn(`[parseCssColor] Formato de color desconocido: "${colorStr}". Se omite el color.`);
  return { color: undefined };
}

/**
 * Traduce estilos de línea discontinua (dashArray) a formato borderDashArray de pdf-lib.
 */
export function parseDashArray(dash: number[] | string | undefined): number[] | undefined {
  if (!dash) return undefined;
  if (Array.isArray(dash)) {
    return dash.length > 0 ? dash : undefined;
  }
  if (typeof dash === 'string') {
    const parts = dash
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
}

/**
 * Criterio 1 y 2: Conversión rigurosa de coordenadas normalizadas (0..1)
 * a espacio nativo PDF teniendo en cuenta origen de CropBox/MediaBox y las 4 rotaciones.
 *
 * Contrastado y validado contra page.getViewport({ scale: 1, rotation }).convertToPdfPoint de PDF.js.
 */
export function normalizedToPdfCoordinates(
  point: MarkupPoint,
  transform: PageTransformInfo
): { x: number; y: number } {
  const { rotation, widthPt, heightPt, originX, originY } = transform;
  const u = point.x;
  const v = point.y;

  let x = 0;
  let y = 0;

  if (rotation === 0) {
    x = originX + u * widthPt;
    y = originY + (1 - v) * heightPt;
  } else if (rotation === 90) {
    x = originX + v * widthPt;
    y = originY + u * heightPt;
  } else if (rotation === 180) {
    x = originX + (1 - u) * widthPt;
    y = originY + v * heightPt;
  } else if (rotation === 270) {
    x = originX + (1 - v) * widthPt;
    y = originY + (1 - u) * heightPt;
  }

  return { x, y };
}

/**
 * Criterio 5: Deriva la transformación geométrica directamente de una página de pdf-lib.
 * Nunca asume rotación 0 en silencio.
 */
export function getPageTransformFromPdfLib(page: PDFPage): PageTransformInfo {
  const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const box = page.getCropBox() || page.getMediaBox();
  return {
    rotation: rot,
    widthPt: box.width,
    heightPt: box.height,
    originX: box.x,
    originY: box.y,
  };
}

/**
 * Divide texto en líneas respetando saltos de línea explícitos (\n) y ancho máximo medido.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth || !currentLine) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}

/**
 * Servicio central de exportación vectorial de marcas técnicas a documento PDF (H1).
 */
export async function exportMarkupsToPdf(
  originalBytes: Uint8Array,
  markups: Markup[],
  options?: PdfExportOptions
): Promise<PdfExportResult> {
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.toLowerCase().includes('encrypted') ||
      msg.toLowerCase().includes('password') ||
      msg.toLowerCase().includes('protected')
    ) {
      throw new Error(
        'The PDF document is password-protected or encrypted and cannot be modified.'
      );
    }
    throw err;
  }

  const pages = pdfDoc.getPages();

  let totalReplacedCharacters = 0;

  // Caché de fuente estándar Helvetica única para todo el proceso
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Agrupar marcas por página
  const markupsByPage: Record<number, Markup[]> = {};
  for (const m of markups) {
    if (!markupsByPage[m.pageIndex]) {
      markupsByPage[m.pageIndex] = [];
    }
    markupsByPage[m.pageIndex].push(m);
  }

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const pageMarkups = markupsByPage[pageIdx];
    if (!pageMarkups || pageMarkups.length === 0) {
      continue;
    }

    // Criterio 5: Derivar de options o inspeccionar directamente la página de pdf-lib
    const transform: PageTransformInfo =
      options?.pageTransforms?.[pageIdx] ?? getPageTransformFromPdfLib(page);

    for (const markup of pageMarkups) {
      const strokeColorParsed = parseCssColor(markup.style.strokeColor);
      const fillColorParsed = parseCssColor(markup.style.fillColor);
      const dashArray = parseDashArray(markup.style.dashArray);
      const strokeWidth = markup.style.strokeWidth ?? 1;
      const opacity = markup.style.opacity ?? 1;

      // Tipo de línea con patrón (ADR-0041): el mismo dibujo que el /AP (y la pantalla)
      if (markupLinePattern(markup)) {
        drawViaAppearanceOperators(pdfDoc, page, markup, transform);
        continue;
      }

      switch (markup.type) {
        // 1. Rectángulo
        case 'rectangle': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );
          const x = Math.round(Math.min(p1.x, p2.x) * 100) / 100;
          const y = Math.round(Math.min(p1.y, p2.y) * 100) / 100;
          const width = Math.round(Math.max(1, Math.abs(p2.x - p1.x)) * 100) / 100;
          const height = Math.round(Math.max(1, Math.abs(p2.y - p1.y)) * 100) / 100;

          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderColor: strokeColorParsed.color,
            borderWidth: strokeWidth,
            borderOpacity: strokeColorParsed.opacity ?? opacity,
            borderDashArray: dashArray,
            color: fillColorParsed.color,
            opacity: fillColorParsed.opacity ?? opacity,
          });
          break;
        }

        // 2. Resaltador vectorial (Criterio 4: HIGHLIGHT_STYLE con Multiply)
        case 'highlight':
        case 'highlightVector':
        case 'highlightText': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const width = Math.max(1, Math.abs(p2.x - p1.x));
          const height = Math.max(1, Math.abs(p2.y - p1.y));

          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: rgb(HIGHLIGHT_STYLE.rgb.r, HIGHLIGHT_STYLE.rgb.g, HIGHLIGHT_STYLE.rgb.b),
            opacity: HIGHLIGHT_STYLE.opacity,
            blendMode: BlendMode.Multiply,
          });
          break;
        }

        // 3. Círculo / Elipse
        case 'circle': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );
          const cx = (p1.x + p2.x) / 2;
          const cy = (p1.y + p2.y) / 2;
          const rx = Math.max(0.5, Math.abs(p2.x - p1.x) / 2);
          const ry = Math.max(0.5, Math.abs(p2.y - p1.y) / 2);

          page.drawEllipse({
            x: cx,
            y: cy,
            xScale: rx,
            yScale: ry,
            borderColor: strokeColorParsed.color,
            borderWidth: strokeWidth,
            borderOpacity: strokeColorParsed.opacity ?? opacity,
            borderDashArray: dashArray,
            color: fillColorParsed.color,
            opacity: fillColorParsed.opacity ?? opacity,
          });
          break;
        }

        // 4. Línea
        case 'line': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );

          page.drawLine({
            start: { x: p1.x, y: p1.y },
            end: { x: p2.x, y: p2.y },
            thickness: strokeWidth,
            color: strokeColorParsed.color,
            opacity: strokeColorParsed.opacity ?? opacity,
            dashArray: dashArray,
          });
          if (strokeColorParsed.color) {
            drawLineEndingsFlat(page, [p1, p2], markup, strokeColorParsed.color, strokeColorParsed.opacity ?? opacity);
          }
          break;
        }

        // 5. Polígono
        case 'polygon': {
          if (markup.points.length >= 3) {
            const pdfPts = markup.points.map((pt) => normalizedToPdfCoordinates(pt, transform));
            // En pdf-lib, drawSvgPath tiene scale(1, -1), por lo que punto (X, -Y) proyecta en (X, Y)
            let pathD = `M ${pdfPts[0].x.toFixed(2)} ${(-pdfPts[0].y).toFixed(2)}`;
            for (let i = 1; i < pdfPts.length; i++) {
              pathD += ` L ${pdfPts[i].x.toFixed(2)} ${(-pdfPts[i].y).toFixed(2)}`;
            }
            pathD += ' Z';

            page.drawSvgPath(pathD, {
              x: 0,
              y: 0,
              borderColor: strokeColorParsed.color,
              borderWidth: strokeWidth,
              borderOpacity: strokeColorParsed.opacity ?? opacity,
              borderDashArray: dashArray,
              color: fillColorParsed.color,
              opacity: fillColorParsed.opacity ?? opacity,
            });
          }
          break;
        }

        // 6. Mano alzada (Freehand)
        case 'freehand': {
          if (markup.points.length >= 2) {
            const pdfPts = markup.points.map((pt) => normalizedToPdfCoordinates(pt, transform));
            let pathD = `M ${pdfPts[0].x.toFixed(2)} ${(-pdfPts[0].y).toFixed(2)}`;
            for (let i = 1; i < pdfPts.length; i++) {
              pathD += ` L ${pdfPts[i].x.toFixed(2)} ${(-pdfPts[i].y).toFixed(2)}`;
            }

            page.drawSvgPath(pathD, {
              x: 0,
              y: 0,
              borderColor: strokeColorParsed.color,
              borderWidth: strokeWidth,
              borderOpacity: strokeColorParsed.opacity ?? opacity,
              borderLineCap: LineCapStyle.Round,
            });
          }
          break;
        }

        // 7. Nube de revisión técnica
        case 'cloud': {
          const arcStep =
            typeof markup.customFields?.arcStep === 'number'
              ? markup.customFields.arcStep
              : DEFAULT_ARC_STEP;

          const cloudD = revisionCloudPathNormalized(
            markup.points,
            {
              width: transform.widthPt,
              height: transform.heightPt,
            },
            arcStep,
            cloudParams(markup.customFields, arcStep).invert
          );

          page.drawSvgPath(cloudD, {
            x: transform.originX,
            y: transform.originY + transform.heightPt,
            borderColor: strokeColorParsed.color,
            borderWidth: strokeWidth,
            borderOpacity: strokeColorParsed.opacity ?? opacity,
            color: fillColorParsed.color,
            opacity: fillColorParsed.opacity ?? opacity,
          });
          break;
        }

        // 8. Cloud+ (Nube con directriz y caja de texto)
        case 'cloudPlus': {
          const arcStep =
            typeof markup.customFields?.arcStep === 'number'
              ? markup.customFields.arcStep
              : DEFAULT_ARC_STEP;

          const cloudD = revisionCloudPathNormalized(
            markup.points,
            {
              width: transform.widthPt,
              height: transform.heightPt,
            },
            arcStep,
            cloudParams(markup.customFields, arcStep).invert
          );

          page.drawSvgPath(cloudD, {
            x: transform.originX,
            y: transform.originY + transform.heightPt,
            borderColor: strokeColorParsed.color,
            borderWidth: strokeWidth,
            borderOpacity: strokeColorParsed.opacity ?? opacity,
            color: fillColorParsed.color,
            opacity: fillColorParsed.opacity ?? opacity,
          });

          if (markup.text) {
            const sanitized = sanitizeTextToWinAnsi(markup.text);
            totalReplacedCharacters += sanitized.replacedCount;
            const p1 = normalizedToPdfCoordinates(
              markup.points[0] || { x: 0, y: 0 },
              transform
            );
            page.drawText(sanitized.text, {
              x: p1.x + 8,
              y: p1.y - 14,
              size: 10,
              font: helveticaFont,
              color: rgb(0.1, 0.1, 0.1),
            });
          }
          break;
        }

        // 9. Nota adhesiva técnica (Sub-entregable A.4: Vector plano con operadores re/m/l/f/rg/RG)
        case 'stickyNote': {
          if (!markup.points || markup.points.length === 0) break;

          // Derivar tamaño normalizado en puntos (fuente única de verdad STICKY_NOTE_SIZE_PT = 24)
          const normSize = getStickyNoteNormalizedSize({
            width: transform.widthPt,
            height: transform.heightPt,
          });

          // Proyección de la esquina superior izquierda (points[0]) y esquina opuesta
          const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
          const p2 = normalizedToPdfCoordinates(
            {
              x: markup.points[0].x + normSize.width,
              y: markup.points[0].y + normSize.height,
            },
            transform
          );

          const x = Math.round(Math.min(p1.x, p2.x) * 100) / 100;
          const y = Math.round(Math.min(p1.y, p2.y) * 100) / 100;
          const width = STICKY_NOTE_SIZE_PT;
          const height = STICKY_NOTE_SIZE_PT;

          const defaultPreset = STICKY_NOTE_COLORS.yellow;
          const fillColor =
            fillColorParsed.color ??
            parseCssColor(defaultPreset.fillColor).color ??
            rgb(1, 0.94, 0.54);
          const strokeColor =
            strokeColorParsed.color ??
            parseCssColor(defaultPreset.strokeColor).color ??
            rgb(0.79, 0.54, 0.02);

          // Renderizar icono vectorial plano usando operadores estándar PDF:
          // 're' para el cuerpo cuadrado (24x24 pt), 'm' y 'l' para las líneas internas,
          // 'rg' y 'RG' para color de relleno y trazo. Prohibido /Subtype /Text y /Annots.
          page.pushOperators(
            pushGraphicsState(),
            setFillingColor(fillColor),
            setStrokingColor(strokeColor),
            setLineWidth(1),
            rectangle(x, y, width, height),
            fillAndStroke(),
            // 3 líneas interiores técnicas del icono de nota adhesiva
            moveTo(x + 5, y + height - 7),
            lineTo(x + width - 5, y + height - 7),
            moveTo(x + 5, y + height - 12),
            lineTo(x + width - 5, y + height - 12),
            moveTo(x + 5, y + height - 17),
            lineTo(x + width - 9, y + height - 17),
            stroke(),
            popGraphicsState()
          );
          break;
        }

        // 10. Texto / Nota técnica
        case 'text': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const width = Math.max(80, Math.abs(p2.x - p1.x));
          const height = Math.max(26, Math.abs(p2.y - p1.y));
          const noFill = markup.style.fillColor === 'transparent' || markup.style.fillColor === 'none';

          // Fondo y borde
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: noFill ? undefined : (fillColorParsed.color ?? rgb(1, 0.98, 0.9)),
            borderColor: strokeWidth > 0 ? (strokeColorParsed.color ?? rgb(0.8, 0.8, 0.8)) : undefined,
            borderWidth: strokeWidth > 0 ? strokeWidth : 0,
            borderDashArray: dashArray,
            opacity: 0.95,
          });

          const rawText = markup.text || 'Text';
          const sanitized = sanitizeTextToWinAnsi(rawText);
          totalReplacedCharacters += sanitized.replacedCount;

          const fontSize = markup.style.fontSize ?? 10;
          const lines = wrapText(sanitized.text, width - 12, fontSize, helveticaFont);
          const align = markup.textFormat?.align ?? 'left';

          let lineY = y + height - fontSize - 6;
          for (const line of lines) {
            if (lineY < y + 4) break;
            const lineWidth = helveticaFont.widthOfTextAtSize(line, fontSize);
            const lineX =
              align === 'center'
                ? x + (width - lineWidth) / 2
                : align === 'right'
                  ? x + width - 6 - lineWidth
                  : x + 6;
            page.drawText(line, {
              x: lineX,
              y: lineY,
              size: fontSize,
              font: helveticaFont,
              color: rgb(0.1, 0.1, 0.1),
            });
            lineY -= fontSize + 2;
          }
          break;
        }

        // 10. Callout (Nota técnica con directriz conectada)
        case 'callout': {
          if (!markup.points || markup.points.length === 0) break;

          const isRotated90or270 = transform.rotation === 90 || transform.rotation === 270;
          const visualWidthPt = isRotated90or270 ? transform.heightPt : transform.widthPt;
          const visualHeightPt = isRotated90or270 ? transform.widthPt : transform.heightPt;

          const p1Norm = markup.points[0];
          const p2Norm = markup.points[1] || p1Norm;

          const boxP1Vis = { x: p1Norm.x * visualWidthPt, y: p1Norm.y * visualHeightPt };
          const boxP2Vis = { x: p2Norm.x * visualWidthPt, y: p2Norm.y * visualHeightPt };

          const leadersVis = (markup.leaders || []).map((lead) =>
            lead.map((pt) => ({ x: pt.x * visualWidthPt, y: pt.y * visualHeightPt }))
          );

          // Geometría unificada usando la función pura calculateCalloutGeometry (escala 1 pt)
          const geom = calculateCalloutGeometry(boxP1Vis, boxP2Vis, leadersVis, 1);

          const toNorm = (ptVis: { x: number; y: number }): MarkupPoint => ({
            x: ptVis.x / visualWidthPt,
            y: ptVis.y / visualHeightPt,
          });

          // 1. Dibujar directrices (al fondo detrás de la caja)
          for (const leader of geom.leaders) {
            const pdfArrowHead = normalizedToPdfCoordinates(toNorm(leader.arrowHead), transform);
            const pdfElbow = normalizedToPdfCoordinates(toNorm(leader.elbow), transform);
            const pdfBoxAttachment = normalizedToPdfCoordinates(toNorm(leader.boxAttachment), transform);

            // Línea con quiebre (codo + hombro)
            const leaderD = `M ${pdfArrowHead.x.toFixed(2)} ${(-pdfArrowHead.y).toFixed(2)} L ${pdfElbow.x.toFixed(2)} ${(-pdfElbow.y).toFixed(2)} L ${pdfBoxAttachment.x.toFixed(2)} ${(-pdfBoxAttachment.y).toFixed(2)}`;
            page.drawSvgPath(leaderD, {
              x: 0,
              y: 0,
              borderColor: strokeColorParsed.color,
              borderWidth: strokeWidth,
              borderOpacity: strokeColorParsed.opacity ?? opacity,
            });

            // Flecha del callout (ADR-0042): abierta por defecto, con la geometría compartida de los extremos
            if (strokeColorParsed.color) {
              drawLineEndingsFlat(
                page,
                [pdfArrowHead, pdfElbow],
                { ...markup, style: { ...markup.style, lineEndingStart: markup.style.lineEndingStart ?? 'openArrow', lineEndingEnd: 'none' } },
                strokeColorParsed.color,
                strokeColorParsed.opacity ?? opacity,
                CALLOUT_ARROW_HALF_ANGLE
              );
            }
          }

          // 2. Dibujar caja de llamada (cubriendo la entrada de las directrices)
          const normTL = toNorm({ x: geom.box.x, y: geom.box.y });
          const normTR = toNorm({ x: geom.box.x + geom.box.width, y: geom.box.y });
          const normBR = toNorm({ x: geom.box.x + geom.box.width, y: geom.box.y + geom.box.height });
          const normBL = toNorm({ x: geom.box.x, y: geom.box.y + geom.box.height });

          const pdfTL = normalizedToPdfCoordinates(normTL, transform);
          const pdfTR = normalizedToPdfCoordinates(normTR, transform);
          const pdfBR = normalizedToPdfCoordinates(normBR, transform);
          const pdfBL = normalizedToPdfCoordinates(normBL, transform);

          const boxD = `M ${pdfTL.x.toFixed(2)} ${(-pdfTL.y).toFixed(2)} L ${pdfTR.x.toFixed(2)} ${(-pdfTR.y).toFixed(2)} L ${pdfBR.x.toFixed(2)} ${(-pdfBR.y).toFixed(2)} L ${pdfBL.x.toFixed(2)} ${(-pdfBL.y).toFixed(2)} Z`;
          // Caja solo si tiene relleno: sin él, el callout es texto suelto como en Revu (ADR-0042)
          const boxPaint = calloutBoxPaint(markup);
          if ((boxPaint.fill && fillColorParsed.color) || boxPaint.border) page.drawSvgPath(boxD, {
            x: 0,
            y: 0,
            color: boxPaint.fill ? fillColorParsed.color : undefined,
            borderColor: boxPaint.border ? strokeColorParsed.color : undefined,
            borderWidth: boxPaint.border ? strokeWidth : 0,
            borderOpacity: strokeColorParsed.opacity ?? opacity,
            opacity: opacity,
          });

          // 3. Dibujar texto técnico alineado dentro de la caja
          if (markup.text) {
            const sanitized = sanitizeTextToWinAnsi(markup.text);
            totalReplacedCharacters += sanitized.replacedCount;

            const fontSize = markup.style.fontSize ?? 10;
            const lineHeight = fontSize + 3;
            const textColor = parseCssColor(markup.style.textColor ?? markup.style.strokeColor).color ?? rgb(0.12, 0.16, 0.22);
            const maxTextWidth = Math.max(CALLOUT_MIN_BOX_WIDTH - 16, geom.box.width - 16);
            const lines = wrapCalloutText(sanitized.text, maxTextWidth, fontSize);

            for (let i = 0; i < lines.length; i++) {
              const textPosVis = {
                x: geom.box.x + 6,
                y: geom.box.y + 4 + fontSize + i * lineHeight,
              };
              const textPdfPos = normalizedToPdfCoordinates(toNorm(textPosVis), transform);

              page.drawText(lines[i], {
                x: textPdfPos.x,
                y: textPdfPos.y,
                size: fontSize,
                font: helveticaFont,
                color: textColor,
                rotate: transform.rotation === 0 ? undefined : degrees((360 - transform.rotation) % 360),
              });
            }
          }
          break;
        }

        // 11. Sello técnico (Stamp)
        case 'stamp': {
          // Mismo dibujo que el /AP del sello (ADR-0026)
          drawViaAppearanceOperators(pdfDoc, page, markup, transform);
          break;
        }

        // 12. Imagen / Instantánea Snapshot (ADR-0085)
        case 'image': {
          if (
            markup.points.length >= 2 &&
            typeof markup.customFields?.imageSrc === 'string' &&
            markup.customFields.imageSrc.startsWith('data:image/')
          ) {
            try {
              const src = markup.customFields.imageSrc;
              const isPng = src.startsWith('data:image/png');
              const base64Data = src.split(',')[1];
              if (base64Data) {
                const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
                const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
                const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
                const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const width = Math.max(1, Math.abs(p2.x - p1.x));
                const height = Math.max(1, Math.abs(p2.y - p1.y));
                page.drawImage(embedded, {
                  x,
                  y,
                  width,
                  height,
                  opacity: markup.style.opacity ?? 1,
                });
              }
            } catch {
              // fallback silencioso
            }
          }
          break;
        }

        // Polilínea, subrayado, tachado y mediciones: mismo dibujo que el /AP (antes se omitían)
        case 'polyLine':
        case 'underline':
        case 'strikeOut':
        case 'squiggly':
        case 'length':
        case 'polylineMeasure':
        case 'area':
        case 'count':
        case 'perimeter':
        case 'volume':
        case 'angle':
        case 'radius':
        case 'diameter':
        case 'dimension': {
          drawViaAppearanceOperators(pdfDoc, page, markup, transform);
          // El valor de las mediciones ya forma parte del /AP (ADR-0032); el conteo conserva su número aparte
          if (markup.measurement && markup.type === 'count' && !countSymbolOf(markup)) {
            drawMeasurementLabel(page, markup, transform, helveticaFont);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return {
    pdfBytes,
    warnings: {
      replacedCharactersCount: totalReplacedCharacters,
    },
  };
}
