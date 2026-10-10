import {
  PDFDocument,
  PDFPage,
  PDFFont,
  StandardFonts,
  rgb,
  RGB,
  BlendMode,
  LineCapStyle,
} from 'pdf-lib';
import { Markup, MarkupPoint, HIGHLIGHT_STYLE } from '../types/markup';
import { generateCloudPath } from '../core/markup/render';

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

  return { color: rgb(0, 0, 0), opacity: 1 };
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
 * Divide párrafos de texto en líneas de ajuste manual usando anchos de fuente medidos.
 */
function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
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
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();

  let totalReplacedCharacters = 0;

  // Caché de fuente estándar Helvetica única para todo el proceso
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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
          const p1Norm = markup.points[0] || { x: 0, y: 0 };
          const p2Norm = markup.points[1] || p1Norm;
          const cloudD = generateCloudPath(p1Norm, p2Norm, {
            width: transform.widthPt,
            height: transform.heightPt,
          });

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
          const p1Norm = markup.points[0] || { x: 0, y: 0 };
          const p2Norm = markup.points[1] || p1Norm;
          const cloudD = generateCloudPath(p1Norm, p2Norm, {
            width: transform.widthPt,
            height: transform.heightPt,
          });

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
            const p1 = normalizedToPdfCoordinates(p1Norm, transform);
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

        // 9. Texto / Nota técnica
        case 'text':
        case 'stickyNote': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const width = Math.max(80, Math.abs(p2.x - p1.x));
          const height = Math.max(26, Math.abs(p2.y - p1.y));

          // Fondo
          const isSticky = markup.type === 'stickyNote';
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: isSticky ? rgb(1, 0.96, 0.6) : fillColorParsed.color ?? rgb(1, 0.98, 0.9),
            borderColor: strokeColorParsed.color ?? rgb(0.8, 0.8, 0.8),
            borderWidth: 1,
            opacity: 0.95,
          });

          const rawText = markup.text || (isSticky ? 'Nota' : 'Texto');
          const sanitized = sanitizeTextToWinAnsi(rawText);
          totalReplacedCharacters += sanitized.replacedCount;

          const fontSize = markup.style.fontSize ?? 10;
          const lines = wrapText(sanitized.text, width - 12, fontSize, helveticaFont);

          let lineY = y + height - fontSize - 6;
          for (const line of lines) {
            if (lineY < y + 4) break;
            page.drawText(line, {
              x: x + 6,
              y: lineY,
              size: fontSize,
              font: helveticaFont,
              color: rgb(0.1, 0.1, 0.1),
            });
            lineY -= fontSize + 2;
          }
          break;
        }

        // 10. Callout (Llamada con directriz)
        case 'callout': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const width = Math.max(80, Math.abs(p2.x - p1.x));
          const height = Math.max(26, Math.abs(p2.y - p1.y));

          // Caja de texto
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: fillColorParsed.color ?? rgb(1, 1, 1),
            borderColor: strokeColorParsed.color,
            borderWidth: strokeWidth,
          });

          // Flecha directriz (de leader a centro de caja)
          if (markup.leaders && markup.leaders[0] && markup.leaders[0][0]) {
            const arrowHead = normalizedToPdfCoordinates(markup.leaders[0][0], transform);
            page.drawLine({
              start: { x: arrowHead.x, y: arrowHead.y },
              end: { x: x, y: y + height / 2 },
              thickness: strokeWidth,
              color: strokeColorParsed.color,
            });
          }

          if (markup.text) {
            const sanitized = sanitizeTextToWinAnsi(markup.text);
            totalReplacedCharacters += sanitized.replacedCount;
            page.drawText(sanitized.text, {
              x: x + 6,
              y: y + height - 14,
              size: 10,
              font: helveticaFont,
              color: rgb(0.1, 0.1, 0.1),
            });
          }
          break;
        }

        // 11. Sello técnico (Stamp)
        case 'stamp': {
          const p1 = normalizedToPdfCoordinates(markup.points[0] || { x: 0, y: 0 }, transform);
          const p2 = normalizedToPdfCoordinates(
            markup.points[1] || markup.points[0] || { x: 0, y: 0 },
            transform
          );
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const width = Math.max(100, Math.abs(p2.x - p1.x));
          const height = Math.max(40, Math.abs(p2.y - p1.y));

          // Borde doble de sello
          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderColor: strokeColorParsed.color,
            borderWidth: 2.5,
            color: rgb(1, 1, 1),
            opacity: 0.9,
          });
          page.drawRectangle({
            x: x + 3,
            y: y + 3,
            width: width - 6,
            height: height - 6,
            borderColor: strokeColorParsed.color,
            borderWidth: 1,
          });

          const rawText = (markup.text || 'APROBADO').toUpperCase();
          const sanitized = sanitizeTextToWinAnsi(rawText);
          totalReplacedCharacters += sanitized.replacedCount;

          const textWidth = helveticaBoldFont.widthOfTextAtSize(sanitized.text, 14);
          page.drawText(sanitized.text, {
            x: x + Math.max(6, (width - textWidth) / 2),
            y: y + height / 2 - 5,
            size: 14,
            font: helveticaBoldFont,
            color: strokeColorParsed.color,
          });
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
