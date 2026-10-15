import {
  Markup,
  MarkupPoint,
  STICKY_NOTE_SIZE_PT,
  STICKY_NOTE_COLORS,
} from '../../types/markup';
import {
  DEFAULT_ARC_STEP,
  calculateCalloutGeometry,
  wrapCalloutText,
  CALLOUT_MIN_BOX_WIDTH,
} from '../markup/render';
import { lineEndingShape, lineEndingSize, endpointAngles, shapeExtent, Pt, CALLOUT_ARROW_HALF_ANGLE } from '../markup/lineEndings';
import { dimensionGeometry, dimensionTextBaseline, defaultDimensionLinePoint } from '../markup/dimension';
import { getHelveticaTextWidth } from '../markup/helveticaMetrics';
import { stampLayout } from '../markup/stamps';
import { fieldTypeOf, fieldDisplayText, isFieldChecked } from '../markup/formFields';
import { revisionCloudPathNormalized, cloudParams } from '../markup/revisionCloud';
import { linePatternPrimitives, markupLinePattern, patternOutlineOf } from '../markup/linePatterns';
import { calloutBoxPaint } from '../markup/calloutLayout';
import {
  CaptionText,
  captionStyleOf,
  lineCaptionLayout,
  measureLabelText,
  measureLineEndings,
  pointCaption,
  verticesCenter,
  captionFontOf,
  captionTextWidth,
  captionPdfFont,
  CaptionFont,
  markupFontOf,
  BOX_TEXT_COLOR,
  distanceGeometry,
  MEASURE_LEADER_EXTENSION_PT,
  MEASURE_END_TICK_PT,
} from '../markup/measureCaption';

/** Nombre del recurso de fuente que usan los /AP con texto (Helvetica estándar, WinAnsiEncoding). */
export const AP_FONT_NAME = 'Helv';
export const AP_BOLD_FONT_NAME = 'HeBo';

const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
  '′': 0x27, '″': 0x22,
};

/**
 * Cadena literal PDF en WinAnsiEncoding para el operador Tj. Los caracteres sin equivalente se sustituyen por
 * "?" (el texto íntegro sigue en /Contents, en UTF-16).
 */
export function toWinAnsiPdfLiteral(text: string): string {
  let out = '(';
  for (const ch of text) {
    let code = ch.codePointAt(0) ?? 63;
    if (WIN_ANSI_EXTRA[ch] !== undefined) code = WIN_ANSI_EXTRA[ch];
    else if (code > 0xff || (code >= 0x80 && code < 0xa0)) code = 63;
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + String.fromCharCode(code);
    else if (code < 0x20 || code > 0x7e) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return out + ')';
}

export interface PageTransformInfo {
  rotation: 0 | 90 | 180 | 270;
  widthPt: number;
  heightPt: number;
  originX: number;
  originY: number;
}

export interface EmittedOperatorsResult {
  operators: string;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  extGState?: {
    ca?: number; // Opacidad de relleno (non-stroking)
    CA?: number; // Opacidad de trazo (stroking)
    bm?: string; // BlendMode (e.g. '/Multiply')
  };
  fontName?: string;
  fontSize?: number;
  /** Recurso de Helvetica-Bold si el /AP lo usa (sellos). */
  boldFontName?: string;
  /** Otras fuentes estándar del /AP (texto de medición en Times o Courier, cursivas), nombre → /BaseFont. */
  extraFonts?: Record<string, string>;
}

/**
 * Convierte un punto normalizado (0..1) al espacio de coordenadas nativo de PDF (pt),
 * respetando el origen de CropBox/MediaBox y las 4 rotaciones canónicas (0, 90, 180, 270).
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
 * Función inversa exacta de normalizedToPdfCoordinates.
 * Convierte un punto en puntos nativos de PDF al rango normalizado (0..1).
 */
export function pdfToNormalizedCoordinates(
  point: { x: number; y: number },
  transform: PageTransformInfo
): MarkupPoint {
  const { rotation, widthPt, heightPt, originX, originY } = transform;
  const x = point.x;
  const y = point.y;

  let u = 0;
  let v = 0;

  if (rotation === 0) {
    u = (x - originX) / widthPt;
    v = 1 - (y - originY) / heightPt;
  } else if (rotation === 90) {
    v = (x - originX) / widthPt;
    u = (y - originY) / heightPt;
  } else if (rotation === 180) {
    u = 1 - (x - originX) / widthPt;
    v = (y - originY) / heightPt;
  } else if (rotation === 270) {
    v = 1 - (x - originX) / widthPt;
    u = 1 - (y - originY) / heightPt;
  }

  return { x: u, y: v };
}

/**
 * Parsea cadenas CSS de color a componentes RGB en rango [0, 1].
 */
export function parseCssColorRgb(
  colorStr: string | undefined
): { r: number; g: number; b: number; a?: number } | null {
  if (!colorStr || colorStr === 'transparent') {
    return null;
  }
  const trimmed = colorStr.trim().toLowerCase();

  // Hex 3 dígitos (#rgb)
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const r = parseInt(trimmed[1] + trimmed[1], 16) / 255;
    const g = parseInt(trimmed[2] + trimmed[2], 16) / 255;
    const b = parseInt(trimmed[3] + trimmed[3], 16) / 255;
    return { r, g, b, a: 1 };
  }

  // Hex 6 dígitos (#rrggbb)
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    const r = parseInt(trimmed.slice(1, 3), 16) / 255;
    const g = parseInt(trimmed.slice(3, 5), 16) / 255;
    const b = parseInt(trimmed.slice(5, 7), 16) / 255;
    return { r, g, b, a: 1 };
  }

  // rgba(r, g, b, a)
  const rgbaMatch = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(trimmed);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10) / 255;
    const g = parseInt(rgbaMatch[2], 10) / 255;
    const b = parseInt(rgbaMatch[3], 10) / 255;
    const a = parseFloat(rgbaMatch[4]);
    if (a <= 0) return null;
    return { r, g, b, a };
  }

  // rgb(r, g, b)
  const rgbMatch = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(trimmed);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return { r, g, b, a: 1 };
  }

  return null;
}

/**
 * Emisor PURO de operadores gráficos PDF (ISO 32000-1) para cualquier marca de REA.
 * No depende de ninguna biblioteca externa ni del DOM.
 * Genera el flujo textual exacto de operadores para el content stream o el Form XObject /AP.
 */
export function emitMarkupOperators(
  markup: Markup,
  transform: PageTransformInfo
): EmittedOperatorsResult {
  const strokeParsed = parseCssColorRgb(markup.style.strokeColor);
  const fillParsed = parseCssColorRgb(markup.style.fillColor);
  const strokeWidth = Math.max(1, markup.style.strokeWidth ?? 1);
  const baseOpacity = markup.style.opacity ?? 1;

  const strokeOpacity = strokeParsed?.a !== undefined ? strokeParsed.a * baseOpacity : baseOpacity;
  const fillOpacity = fillParsed?.a !== undefined ? fillParsed.a * baseOpacity : baseOpacity;

  const lines: string[] = ['q'];

  // Configuración de estado gráfico extendido
  const extGState: EmittedOperatorsResult['extGState'] = {};
  if (strokeOpacity < 1) extGState.CA = strokeOpacity;
  if (fillOpacity < 1) extGState.ca = fillOpacity;
  // Sin el operador gs la opacidad declarada en los recursos no se aplica
  if (extGState.CA !== undefined || extGState.ca !== undefined) lines.push('/GS_HL gs');

  // Grosor de línea
  lines.push(`${strokeWidth.toFixed(2)} w`);

  // Estilo de línea discontinua
  if (markup.style.dashArray && markup.style.dashArray.length > 0) {
    const dashStr = markup.style.dashArray.map((d) => d.toFixed(1)).join(' ');
    lines.push(`[${dashStr}] 0 d`);
  }

  // Colores de trazo y relleno
  if (strokeParsed) {
    lines.push(
      `${strokeParsed.r.toFixed(3)} ${strokeParsed.g.toFixed(3)} ${strokeParsed.b.toFixed(3)} RG`
    );
  }
  if (fillParsed) {
    lines.push(
      `${fillParsed.r.toFixed(3)} ${fillParsed.g.toFixed(3)} ${fillParsed.b.toFixed(3)} rg`
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const updateBBox = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const hasFill = fillParsed !== null;
  const opPaint = hasFill ? (strokeParsed ? 'B' : 'f') : 'S';
  const f2 = (n: number) => n.toFixed(2);
  const rgbOp = (c: { r: number; g: number; b: number }, op: 'rg' | 'RG') =>
    `${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)} ${op}`;

  // Espacio "visual" (la página tal como se ve: origen arriba a la izquierda, y hacia abajo, en pt)
  const isRot = transform.rotation === 90 || transform.rotation === 270;
  const visW = isRot ? transform.heightPt : transform.widthPt;
  const visH = isRot ? transform.widthPt : transform.heightPt;
  const visToPdf = (p: Pt) => normalizedToPdfCoordinates({ x: p.x / visW, y: p.y / visH }, transform);
  const toVis = (p: MarkupPoint): Pt => ({ x: p.x * visW, y: p.y * visH });

  /** Trazado poligonal en coordenadas PDF (amplía la caja envolvente). */
  const pathPdf = (pts: Pt[], close: boolean) => {
    pts.forEach((p, i) => {
      updateBBox(p.x, p.y);
      lines.push(`${f2(p.x)} ${f2(p.y)} ${i === 0 ? 'm' : 'l'}`);
    });
    if (close) lines.push('h');
  };

  /** Trazado SVG de solo M/Q/Z en espacio visual → PDF (las cuadráticas pasan a cúbicas exactas). */
  const svgQuadPathToPdf = (d: string) => {
    const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
    let i = 0;
    let current: Pt | null = null;
    const num = () => Number(tokens[i++]);
    while (i < tokens.length) {
      const cmd = tokens[i++].toUpperCase();
      if (cmd === 'M') {
        current = visToPdf({ x: num(), y: num() });
        updateBBox(current.x, current.y);
        lines.push(`${f2(current.x)} ${f2(current.y)} m`);
      } else if (cmd === 'L' && current) {
        current = visToPdf({ x: num(), y: num() });
        updateBBox(current.x, current.y);
        lines.push(`${f2(current.x)} ${f2(current.y)} l`);
      } else if (cmd === 'Q' && current) {
        const q = visToPdf({ x: num(), y: num() });
        const end = visToPdf({ x: num(), y: num() });
        const c1 = { x: current.x + ((q.x - current.x) * 2) / 3, y: current.y + ((q.y - current.y) * 2) / 3 };
        const c2 = { x: end.x + ((q.x - end.x) * 2) / 3, y: end.y + ((q.y - end.y) * 2) / 3 };
        updateBBox(q.x, q.y);
        updateBBox(end.x, end.y);
        lines.push(`${f2(c1.x)} ${f2(c1.y)} ${f2(c2.x)} ${f2(c2.y)} ${f2(end.x)} ${f2(end.y)} c`);
        current = end;
      } else if (cmd === 'C' && current) {
        const c1 = visToPdf({ x: num(), y: num() });
        const c2 = visToPdf({ x: num(), y: num() });
        const end = visToPdf({ x: num(), y: num() });
        updateBBox(c1.x, c1.y);
        updateBBox(c2.x, c2.y);
        updateBBox(end.x, end.y);
        lines.push(`${f2(c1.x)} ${f2(c1.y)} ${f2(c2.x)} ${f2(c2.y)} ${f2(end.x)} ${f2(end.y)} c`);
        current = end;
      } else if (cmd === 'Z') {
        lines.push('h');
      }
    }
  };

  let usesFont = false;
  let usesBold = false;
  /** Fuentes estándar adicionales que usa el /AP (nombre del recurso → /BaseFont), ADR-0035. */
  const extraFonts: Record<string, string> = {};
  /** Una línea de texto Helvetica con origen y ángulo en coordenadas PDF (amplía la caja envolvente). */
  const textPdf = (
    text: string,
    origin: Pt,
    angle: number,
    fontSize: number,
    color: { r: number; g: number; b: number },
    align: 'left' | 'center',
    bold = false,
    fontRes?: { name: string; base: string },
    metrics?: Pick<CaptionFont, 'family' | 'bold'>
  ) => {
    if (!text.trim()) return;
    const width = metrics ? captionTextWidth(text, fontSize, metrics) : getHelveticaTextWidth(text, fontSize) * (bold ? 1.07 : 1);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x0 = align === 'center' ? origin.x - (cos * width) / 2 : origin.x;
    const y0 = align === 'center' ? origin.y - (sin * width) / 2 : origin.y;
    const resName = fontRes?.name ?? (bold ? AP_BOLD_FONT_NAME : AP_FONT_NAME);
    lines.push('q', 'BT', `/${resName} ${f2(fontSize)} Tf`, rgbOp(color, 'rg'));
    lines.push(`${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${f2(x0)} ${f2(y0)} Tm`);
    lines.push(`${toWinAnsiPdfLiteral(text)} Tj`, 'ET', 'Q');
    for (const [dx, dy] of [
      [0, -0.25],
      [width, -0.25],
      [0, 1],
      [width, 1],
    ]) {
      updateBBox(x0 + cos * dx - sin * dy * fontSize, y0 + sin * dx + cos * dy * fontSize);
    }
    if (resName === AP_BOLD_FONT_NAME) usesBold = true;
    else if (resName === AP_FONT_NAME) usesFont = true;
    else if (fontRes) extraFonts[fontRes.name] = fontRes.base;
  };
  /** Texto horizontal en el espacio visual (sigue la rotación de la página). */
  const textVis = (
    text: string,
    originVis: Pt,
    fontSize: number,
    color: { r: number; g: number; b: number },
    align: 'left' | 'center' = 'left',
    bold = false,
    font?: CaptionFont
  ) => {
    const o = visToPdf(originVis);
    const o2 = visToPdf({ x: originVis.x + 1, y: originVis.y });
    textPdf(text, o, Math.atan2(o2.y - o.y, o2.x - o.x), fontSize, color, align, bold, font ? captionPdfFont(font) : undefined, font);
  };
  /** Tipografía de un cuadro de texto o una llamada (ADR-0040) y su color en PDF. */
  const boxFont = (defaultSize: number) => {
    const font = markupFontOf(markup, defaultSize, BOX_TEXT_COLOR);
    return { font, color: parseCssColorRgb(font.color) ?? DARK_TEXT_RGB };
  };
  const DARK_TEXT = { r: 0.12, g: 0.16, b: 0.22 };
  const DARK_TEXT_RGB = DARK_TEXT;

  /** Valor de una medición (con su etiqueta) o '' si no es una medición. */
  const measureCaptionLabel = () => {
    const formatted = markup.measurement?.formatted || '';
    if (!formatted) return '';
    const text = measureLabelText(markup, formatted);
    return markup.type === 'radius' ? `R ${text}` : markup.type === 'diameter' ? `Ø ${text}` : text;
  };
  /**
   * Texto de medición (ADR-0032/0035): fuente estándar, tamaño y color elegidos (Helvetica negra por defecto), con la
   * geometría del espacio visual de la página.
   */
  const capFont = captionFontOf(markup);
  const captionPdf = (c: CaptionText) => {
    const o = visToPdf(c.origin);
    const o2 = visToPdf({ x: c.origin.x + Math.cos(c.angle), y: c.origin.y + Math.sin(c.angle) });
    const color = parseCssColorRgb(capFont.color) ?? { r: 0, g: 0, b: 0 };
    textPdf(c.text, o, Math.atan2(o2.y - o.y, o2.x - o.x), c.fontSize, color, 'center', false, captionPdfFont(capFont), capFont);
  };

  /**
   * Extremos de línea (ADR-0018) con la misma geometría que la pantalla. Se dibujan sólidos (sin el patrón
   * discontinuo de la línea) y rellenos con el color de trazo; amplían la caja envolvente del /AP.
   */
  const emitLineEndings = (
    pdfPts: Pt[],
    endings: Pick<Markup['style'], 'lineEndingStart' | 'lineEndingEnd'> = markup.style,
    halfAngle?: number
  ) => {
    const angles = endpointAngles(pdfPts);
    if (!angles) return;
    const size = lineEndingSize(strokeWidth);
    const items: [Pt, number, Markup['style']['lineEndingStart']][] = [
      [pdfPts[0], angles.start, endings.lineEndingStart],
      [pdfPts[pdfPts.length - 1], angles.end, endings.lineEndingEnd],
    ];
    let prepared = false;
    for (const [tip, angle, ending] of items) {
      const shape = lineEndingShape(tip, angle, ending, size, true, halfAngle);
      if (!shape) continue;
      if (!prepared) {
        lines.push('[] 0 d', '0 j', '0 J');
        if (strokeParsed) {
          lines.push(`${strokeParsed.r.toFixed(3)} ${strokeParsed.g.toFixed(3)} ${strokeParsed.b.toFixed(3)} rg`);
        }
        prepared = true;
      }
      for (const p of shapeExtent(shape)) updateBBox(p.x, p.y);
      if (shape.kind === 'circle') {
        const { cx, cy, r } = shape;
        const k = 0.5522847498 * r;
        lines.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`);
        lines.push(`${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`);
        lines.push(`${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`);
        lines.push(`${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`);
        lines.push(`${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`);
        lines.push(shape.filled ? 'f' : 's');
      } else {
        lines.push(`${shape.points[0].x.toFixed(2)} ${shape.points[0].y.toFixed(2)} m`);
        for (const p of shape.points.slice(1)) lines.push(`${p.x.toFixed(2)} ${p.y.toFixed(2)} l`);
        // Rellenas sin contorno y abiertas con unión en ángulo (ADR-0035): puntas afiladas como en Acrobat
        lines.push(shape.kind === 'polygon' ? (shape.filled ? 'f' : 's') : 'S');
      }
    }
  };

  // Tipo de línea con patrón (ADR-0041): el mismo dibujo que la pantalla, en el espacio visual de la página
  const pattern = markupLinePattern(markup);
  let patternDrawn = false;
  if (pattern) {
    const outline = patternOutlineOf(markup.type, markup.points.map(toVis), { width: 1, height: 1 });
    if (outline) {
      const { step, invert } = cloudParams(markup.customFields, DEFAULT_ARC_STEP);
      const res = linePatternPrimitives(outline.pts, outline.closed, pattern, {
        strokeWidth,
        unitsPerPt: 1,
        cloudStep: step,
        cloudInvert: invert,
      });
      lines.push('[] 0 d', '1 j');
      if (res.fill && fillParsed) {
        svgQuadPathToPdf(res.fill);
        lines.push('f');
      }
      for (const st of res.strokes) {
        if (st.width !== undefined) lines.push(`${f2(st.width)} w`);
        svgQuadPathToPdf(st.d);
        lines.push('S');
        if (st.width !== undefined) lines.push(`${f2(strokeWidth)} w`);
      }
      if (markup.type === 'line' || markup.type === 'polyLine') {
        const ends = markup.type === 'line' ? markup.points.slice(0, 2) : markup.points;
        emitLineEndings(ends.map((p) => normalizedToPdfCoordinates(p, transform)));
      }
      patternDrawn = true;
    }
  }

  if (!patternDrawn) switch (markup.type) {
    case 'rectangle': {
      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        updateBBox(x, y);
        updateBBox(x + w, y + h);

        lines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
        lines.push(opPaint);
      }
      break;
    }

    case 'circle': {
      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        updateBBox(x, y);
        updateBBox(x + w, y + h);

        const cx = x + w / 2;
        const cy = y + h / 2;
        const rx = w / 2;
        const ry = h / 2;
        const k = 0.5522847498; // Constante kappa para aproximación de círculo por 4 splines cúbicos

        lines.push(`${(cx + rx).toFixed(2)} ${cy.toFixed(2)} m`);
        lines.push(
          `${(cx + rx).toFixed(2)} ${(cy + ry * k).toFixed(2)} ${(cx + rx * k).toFixed(2)} ${(cy + ry).toFixed(2)} ${cx.toFixed(2)} ${(cy + ry).toFixed(2)} c`
        );
        lines.push(
          `${(cx - rx * k).toFixed(2)} ${(cy + ry).toFixed(2)} ${(cx - rx).toFixed(2)} ${(cy + ry * k).toFixed(2)} ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} c`
        );
        lines.push(
          `${(cx - rx).toFixed(2)} ${(cy - ry * k).toFixed(2)} ${(cx - rx * k).toFixed(2)} ${(cy - ry).toFixed(2)} ${cx.toFixed(2)} ${(cy - ry).toFixed(2)} c`
        );
        lines.push(
          `${(cx + rx * k).toFixed(2)} ${(cy - ry).toFixed(2)} ${(cx + rx).toFixed(2)} ${(cy - ry * k).toFixed(2)} ${(cx + rx).toFixed(2)} ${cy.toFixed(2)} c`
        );
        lines.push(opPaint);
      }
      break;
    }

    case 'length': {
      // Distancia de Acrobat (ADR-0032): la línea se interrumpe donde va el valor, con flechas abiertas
      if (markup.points.length < 2) break;
      const geom = distanceGeometry(markup.points.map(toVis), MEASURE_LEADER_EXTENSION_PT, MEASURE_END_TICK_PT)!;
      const { a, b } = geom;
      const ends = measureLineEndings(markup.style);
      // Líneas de referencia (Acrobat, ADR-0033): continuas aunque la medida sea discontinua
      if (geom.leaders.length > 0) {
        if (markup.style.dashArray && markup.style.dashArray.length > 0) lines.push('[] 0 d');
        for (const [u, w] of geom.leaders) {
          pathPdf([visToPdf(u), visToPdf(w)], false);
          lines.push('S');
        }
        if (markup.style.dashArray && markup.style.dashArray.length > 0) {
          lines.push(`[${markup.style.dashArray.map((d) => d.toFixed(1)).join(' ')}] 0 d`);
        }
      }
      const label = measureCaptionLabel();
      const layout = label
        ? lineCaptionLayout(
            a,
            b,
            label,
            capFont.size,
            captionStyleOf(markup.customFields?.captionStyle),
            lineEndingSize(strokeWidth),
            (t, size) => captionTextWidth(t, size, capFont)
          )
        : null;
      for (const [u, w] of layout ? layout.pieces : [[a, b] as [Pt, Pt]]) {
        pathPdf([visToPdf(u), visToPdf(w)], false);
        lines.push('S');
      }
      emitLineEndings([visToPdf(a), visToPdf(b)], ends);
      if (layout) captionPdf(layout.caption);
      break;
    }

    case 'line': {
      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);

        updateBBox(p1.x, p1.y);
        updateBBox(p2.x, p2.y);

        lines.push(`${p1.x.toFixed(2)} ${p1.y.toFixed(2)} m`);
        lines.push(`${p2.x.toFixed(2)} ${p2.y.toFixed(2)} l`);
        lines.push('S');
        if (markup.type === 'line') emitLineEndings([p1, p2]);
      }
      break;
    }

    case 'polyLine':
    case 'polylineMeasure': {
      if (markup.points.length >= 2) {
        const pdfPts = markup.points.map((p) => normalizedToPdfCoordinates(p, transform));
        for (const pt of pdfPts) updateBBox(pt.x, pt.y);

        lines.push(`${pdfPts[0].x.toFixed(2)} ${pdfPts[0].y.toFixed(2)} m`);
        for (let i = 1; i < pdfPts.length; i++) {
          lines.push(`${pdfPts[i].x.toFixed(2)} ${pdfPts[i].y.toFixed(2)} l`);
        }
        lines.push('S');
        if (markup.type === 'polyLine') emitLineEndings(pdfPts);
      }
      break;
    }

    case 'underline': {
      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        updateBBox(minX, minY);
        updateBBox(maxX, minY);
        lines.push(`${minX.toFixed(2)} ${minY.toFixed(2)} m`);
        lines.push(`${maxX.toFixed(2)} ${minY.toFixed(2)} l`);
        lines.push('S');
      }
      break;
    }

    case 'strikeOut': {
      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const midY = (p1.y + p2.y) / 2;
        updateBBox(minX, midY);
        updateBBox(maxX, midY);
        lines.push(`${minX.toFixed(2)} ${midY.toFixed(2)} m`);
        lines.push(`${maxX.toFixed(2)} ${midY.toFixed(2)} l`);
        lines.push('S');
      }
      break;
    }

    case 'polygon': {
      if (markup.points.length >= 2) {
        const pdfPts = markup.points.map((p) => normalizedToPdfCoordinates(p, transform));
        for (const pt of pdfPts) updateBBox(pt.x, pt.y);

        lines.push(`${pdfPts[0].x.toFixed(2)} ${pdfPts[0].y.toFixed(2)} m`);
        for (let i = 1; i < pdfPts.length; i++) {
          lines.push(`${pdfPts[i].x.toFixed(2)} ${pdfPts[i].y.toFixed(2)} l`);
        }
        lines.push('h'); // Cerrar camino
        lines.push(opPaint);
      }
      break;
    }

    case 'area': {
      if (markup.points.length === 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        updateBBox(x, y);
        updateBBox(x + w, y + h);

        lines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
        lines.push(opPaint);
      } else if (markup.points.length > 2) {
        const pdfPts = markup.points.map((p) => normalizedToPdfCoordinates(p, transform));
        for (const pt of pdfPts) updateBBox(pt.x, pt.y);

        lines.push(`${pdfPts[0].x.toFixed(2)} ${pdfPts[0].y.toFixed(2)} m`);
        for (let i = 1; i < pdfPts.length; i++) {
          lines.push(`${pdfPts[i].x.toFixed(2)} ${pdfPts[i].y.toFixed(2)} l`);
        }
        lines.push('h');
        lines.push(opPaint);
      }
      break;
    }

    case 'count': {
      if (markup.points.length >= 1) {
        const center = normalizedToPdfCoordinates(markup.points[0], transform);
        const r = 10;
        const cx = center.x;
        const cy = center.y;
        updateBBox(cx - r, cy - r);
        updateBBox(cx + r, cy + r);
        const k = 0.5522847498;

        lines.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`);
        lines.push(
          `${(cx + r).toFixed(2)} ${(cy + r * k).toFixed(2)} ${(cx + r * k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`
        );
        lines.push(
          `${(cx - r * k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + r * k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`
        );
        lines.push(
          `${(cx - r).toFixed(2)} ${(cy - r * k).toFixed(2)} ${(cx - r * k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`
        );
        lines.push(
          `${(cx + r * k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - r * k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`
        );
        lines.push(opPaint);
      }
      break;
    }

    case 'freehand': {
      if (markup.points.length >= 2) {
        const pdfPts = markup.points.map((p) => normalizedToPdfCoordinates(p, transform));
        for (const pt of pdfPts) updateBBox(pt.x, pt.y);

        lines.push('1 J'); // Round line cap
        lines.push(`${pdfPts[0].x.toFixed(2)} ${pdfPts[0].y.toFixed(2)} m`);
        for (let i = 1; i < pdfPts.length; i++) {
          lines.push(`${pdfPts[i].x.toFixed(2)} ${pdfPts[i].y.toFixed(2)} l`);
        }
        lines.push('S');
      }
      break;
    }

    case 'highlightVector':
    case 'highlightText': {
      extGState.bm = '/Multiply';
      extGState.ca = 0.5;
      lines.push('/GS_HL gs'); // Selector de ExtGState con Multiply

      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        updateBBox(x, y);
        updateBBox(x + w, y + h);

        lines.push('1 1 0 rg'); // Amarillo puro
        lines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
        lines.push('f');
      }
      break;
    }

    case 'stickyNote': {
      // 24x24 pt en espacio de usuario
      const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
      const size = STICKY_NOTE_SIZE_PT;
      const x = p1.x;
      const y = p1.y - size;

      updateBBox(x, y);
      updateBBox(x + size, y + size);

      const preset = STICKY_NOTE_COLORS.yellow;
      const bg = parseCssColorRgb(preset.fillColor);
      const border = parseCssColorRgb(preset.strokeColor);

      if (bg) lines.push(`${bg.r.toFixed(3)} ${bg.g.toFixed(3)} ${bg.b.toFixed(3)} rg`);
      if (border) lines.push(`${border.r.toFixed(3)} ${border.g.toFixed(3)} ${border.b.toFixed(3)} RG`);

      lines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${size} ${size} re`);
      lines.push('B');
      break;
    }

    case 'cloud':
    case 'cloudPlus': {
      const arcStep =
        typeof markup.customFields?.arcStep === 'number'
          ? markup.customFields.arcStep
          : DEFAULT_ARC_STEP;

      // Mismo festón que la pantalla y el aplanado, en el espacio visual de la página
      const { invert } = cloudParams(markup.customFields, arcStep);
      const cloudD = revisionCloudPathNormalized(markup.points, { width: visW, height: visH }, arcStep, invert);
      if (cloudD) {
        svgQuadPathToPdf(cloudD);
        lines.push(opPaint);
      }
      break;
    }

    case 'text': {
      if (markup.points.length === 0) break;
      const a = toVis(markup.points[0]);
      const b = toVis(markup.points[1] ?? markup.points[0]);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.max(80, Math.abs(b.x - a.x));
      const h = Math.max(26, Math.abs(b.y - a.y));
      lines.push('1 w', rgbOp(fillParsed ?? { r: 1, g: 0.984, b: 0.91 }, 'rg'));
      pathPdf([visToPdf({ x, y }), visToPdf({ x: x + w, y }), visToPdf({ x: x + w, y: y + h }), visToPdf({ x, y: y + h })], true);
      lines.push(strokeParsed ? 'B' : 'f');
      const tb = boxFont(12);
      const fontSize = tb.font.size;
      wrapCalloutText(markup.text || '', w - 12, fontSize).forEach((line, i) => {
        const baseline = y + 4 + fontSize + i * (fontSize + 2);
        if (baseline <= y + h) textVis(line, { x: x + 6, y: baseline }, fontSize, tb.color, 'left', false, tb.font);
      });
      break;
    }

    case 'callout': {
      if (markup.points.length === 0) break;
      // Callout de Revu/Foxit (ADR-0042): misma geometría que la pantalla; flecha abierta por defecto y caja solo
      // si tiene relleno
      const geom = calculateCalloutGeometry(
        toVis(markup.points[0]),
        toVis(markup.points[1] ?? markup.points[0]),
        (markup.leaders || []).map((lead) => lead.map(toVis)),
        1
      );
      const bx = geom.box;
      const paint = calloutBoxPaint(markup);
      const boxFill = paint.fill && fillParsed;
      const boxBorder = paint.border && strokeParsed;
      if (boxFill || boxBorder) {
        if (boxFill) lines.push(rgbOp(fillParsed!, 'rg'));
        pathPdf(
          [
            visToPdf({ x: bx.x, y: bx.y }),
            visToPdf({ x: bx.x + bx.width, y: bx.y }),
            visToPdf({ x: bx.x + bx.width, y: bx.y + bx.height }),
            visToPdf({ x: bx.x, y: bx.y + bx.height }),
          ],
          true
        );
        lines.push(boxFill && boxBorder ? 'B' : boxFill ? 'f' : 'S');
      } else {
        // Caja sin dibujo: la caja envolvente la incluye igualmente (Revu y Acrobat la editan con /RD)
        updateBBox(visToPdf({ x: bx.x, y: bx.y }).x, visToPdf({ x: bx.x, y: bx.y }).y);
        updateBBox(visToPdf({ x: bx.x + bx.width, y: bx.y + bx.height }).x, visToPdf({ x: bx.x + bx.width, y: bx.y + bx.height }).y);
      }
      const startEnding = markup.style.lineEndingStart ?? 'openArrow';
      for (const leader of geom.leaders) {
        const pts = [visToPdf(leader.arrowHead), visToPdf(leader.elbow), visToPdf(leader.boxAttachment)];
        lines.push('0 j');
        pathPdf(pts, false);
        lines.push('S');
        emitLineEndings(pts, { lineEndingStart: startEnding, lineEndingEnd: 'none' }, CALLOUT_ARROW_HALF_ANGLE);
      }
      const cf = markupFontOf(markup, 10, markup.style.strokeColor);
      const cColor = parseCssColorRgb(cf.color) ?? DARK_TEXT_RGB;
      const fontSize = cf.size;
      const maxTextWidth = Math.max(CALLOUT_MIN_BOX_WIDTH - 16, bx.width - 16);
      wrapCalloutText(markup.text || '', maxTextWidth, fontSize).forEach((line, i) => {
        textVis(line, { x: bx.x + 6, y: bx.y + 4 + fontSize + i * (fontSize + 3) }, fontSize, cColor, 'left', false, cf);
      });
      break;
    }

    // Campo de formulario (ADR-0027): fondo, borde y valor; casillas y opciones con su marca si están activas
    case 'formField': {
      if (markup.points.length < 2) break;
      const a = toVis(markup.points[0]);
      const b = toVis(markup.points[1]);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      const ft = fieldTypeOf(markup);
      const border = { r: 0.39, g: 0.45, b: 0.55 };
      const bg = ft === 'button' ? { r: 0.886, g: 0.91, b: 0.941 } : { r: 0.933, g: 0.957, b: 1 };
      lines.push('1 w', rgbOp(border, 'RG'), rgbOp(bg, 'rg'));
      if (ft === 'radio') {
        const c = visToPdf({ x: x + w / 2, y: y + h / 2 });
        const r = Math.min(w, h) / 2;
        const k = 0.5522847498 * r;
        updateBBox(c.x - r, c.y - r);
        updateBBox(c.x + r, c.y + r);
        const circle = (rr: number, kk: number) => [
          `${f2(c.x + rr)} ${f2(c.y)} m`,
          `${f2(c.x + rr)} ${f2(c.y + kk)} ${f2(c.x + kk)} ${f2(c.y + rr)} ${f2(c.x)} ${f2(c.y + rr)} c`,
          `${f2(c.x - kk)} ${f2(c.y + rr)} ${f2(c.x - rr)} ${f2(c.y + kk)} ${f2(c.x - rr)} ${f2(c.y)} c`,
          `${f2(c.x - rr)} ${f2(c.y - kk)} ${f2(c.x - kk)} ${f2(c.y - rr)} ${f2(c.x)} ${f2(c.y - rr)} c`,
          `${f2(c.x + kk)} ${f2(c.y - rr)} ${f2(c.x + rr)} ${f2(c.y - kk)} ${f2(c.x + rr)} ${f2(c.y)} c`,
        ];
        lines.push(...circle(r, k), 'B');
        if (isFieldChecked(markup)) {
          lines.push('0 0 0 rg', ...circle(r * 0.5, k * 0.5), 'f');
        }
        break;
      }
      pathPdf([visToPdf({ x, y }), visToPdf({ x: x + w, y }), visToPdf({ x: x + w, y: y + h }), visToPdf({ x, y: y + h })], true);
      lines.push('B');
      if (ft === 'checkbox') {
        if (isFieldChecked(markup)) {
          lines.push(`${f2(Math.max(1, w * 0.12))} w`, '0 0 0 RG');
          pathPdf([visToPdf({ x: x + w * 0.2, y: y + h * 0.55 }), visToPdf({ x: x + w * 0.42, y: y + h * 0.78 }), visToPdf({ x: x + w * 0.82, y: y + h * 0.25 })], false);
          lines.push('S');
        }
        break;
      }
      const fs = Math.max(6, Math.min(h * 0.6, 12));
      const txt = fieldDisplayText(markup);
      if (txt) {
        const centered = ft === 'button' || ft === 'signature';
        const color = ft === 'signature' ? { r: 0.39, g: 0.45, b: 0.55 } : { r: 0.07, g: 0.09, b: 0.15 };
        const baseY = ft === 'listbox' ? y + fs + 2 : y + h / 2 + fs * 0.35;
        textVis(txt, { x: centered ? x + w / 2 : x + 3, y: baseY }, fs, color, centered ? 'center' : 'left');
      }
      break;
    }

    // Adjunto (ADR-0027): clip sobre fondo amarillo
    case 'fileAttachment': {
      if (markup.points.length < 2) break;
      const a = toVis(markup.points[0]);
      const b = toVis(markup.points[1]);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      const color = strokeParsed ?? { r: 0.706, g: 0.325, b: 0.035 };
      lines.push('1 w', rgbOp(color, 'RG'), '0.996 0.953 0.78 rg');
      pathPdf([visToPdf({ x, y }), visToPdf({ x: x + w, y }), visToPdf({ x: x + w, y: y + h }), visToPdf({ x, y: y + h })], true);
      lines.push('B');
      // Clip estilizado: dos trazos paralelos inclinados unidos por arcos simplificados
      const s = Math.min(w, h) / 24;
      const ox = x + (w - Math.min(w, h)) / 2;
      const oy = y + (h - Math.min(w, h)) / 2;
      lines.push(`${f2(Math.max(1, 1.6 * s))} w`);
      pathPdf(
        [
          visToPdf({ x: ox + 15 * s, y: oy + 7 * s }),
          visToPdf({ x: ox + 9 * s, y: oy + 13 * s }),
          visToPdf({ x: ox + 11 * s, y: oy + 16 * s }),
          visToPdf({ x: ox + 19 * s, y: oy + 8 * s }),
          visToPdf({ x: ox + 15 * s, y: oy + 4 * s }),
          visToPdf({ x: ox + 6 * s, y: oy + 13 * s }),
          visToPdf({ x: ox + 11 * s, y: oy + 20 * s }),
          visToPdf({ x: ox + 18 * s, y: oy + 13 * s }),
        ],
        false
      );
      lines.push('S');
      break;
    }

    // Enlace: invisible en el PDF (como los de Revu/Acrobat); solo ocupa su rectángulo
    case 'link': {
      for (const p of markup.points.slice(0, 2)) {
        const q = normalizedToPdfCoordinates(p, transform);
        updateBBox(q.x, q.y);
      }
      break;
    }

    case 'stamp': {
      if (markup.points.length < 2) break;
      const a = toVis(markup.points[0]);
      const b = toVis(markup.points[1]);
      const label = (markup.text || 'APPROVED').toUpperCase();
      const sub = typeof markup.customFields?.stampSubtitle === 'string' ? markup.customFields.stampSubtitle : '';
      const L = stampLayout(
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
        label,
        sub
      );
      const color = strokeParsed ?? { r: 0.08, g: 0.5, b: 0.24 };
      const { x, y, w, h } = L.outer;
      const r = L.radius;
      // Marco único redondeado sin relleno (ADR-0040), con la misma forma que en pantalla
      lines.push(`${f2(L.outerStroke)} w`, rgbOp(color, 'RG'));
      svgQuadPathToPdf(
        `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} ` +
          `Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
          `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
      );
      lines.push('S');
      textVis(label, L.titleBaseline, L.titleSize, color, 'center', true);
      if (L.subBaseline && sub) {
        textVis(sub, L.subBaseline, L.subSize, color, 'center', false, { family: 'Helvetica', size: L.subSize, color: '#000000', bold: false, italic: true });
      }
      break;
    }

    // Mediciones adicionales (ADR-0029): misma geometría que en pantalla
    case 'perimeter':
    case 'volume': {
      if (markup.points.length < 2) break;
      const pdfPts = markup.points.map((p) => normalizedToPdfCoordinates(p, transform));
      if (markup.type === 'volume' && !hasFill) {
        // Relleno violeta translúcido por defecto, como en pantalla
        if (extGState.ca === undefined) {
          if (extGState.CA === undefined) lines.push('/GS_HL gs');
          extGState.ca = 0.15;
        }
        lines.push('0.486 0.227 0.929 rg');
        pathPdf(pdfPts, true);
        lines.push('B');
      } else {
        pathPdf(pdfPts, true);
        lines.push(markup.type === 'volume' ? opPaint : 'S');
      }
      break;
    }

    case 'angle': {
      if (markup.points.length < 2) break;
      const vis = markup.points.slice(0, 3).map(toVis);
      pathPdf(vis.map(visToPdf), false);
      lines.push('S');
      if (vis.length === 3) {
        const [a, v, b] = vis;
        const r = Math.max(12, Math.min(28, Math.hypot(a.x - v.x, a.y - v.y) / 3, Math.hypot(b.x - v.x, b.y - v.y) / 3));
        const t1 = Math.atan2(a.y - v.y, a.x - v.x);
        let d = Math.atan2(b.y - v.y, b.x - v.x) - t1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const arc: Pt[] = [];
        for (let i = 0; i <= 16; i++) {
          const t = t1 + (d * i) / 16;
          arc.push(visToPdf({ x: v.x + r * Math.cos(t), y: v.y + r * Math.sin(t) }));
        }
        lines.push('q', '1 w', '[] 0 d');
        pathPdf(arc, false);
        lines.push('S', 'Q');
      }
      break;
    }

    case 'radius':
    case 'diameter': {
      if (markup.points.length < 2) break;
      const a = normalizedToPdfCoordinates(markup.points[0], transform);
      const b = normalizedToPdfCoordinates(markup.points[1], transform);
      const c = markup.type === 'radius' ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = Math.hypot(b.x - a.x, b.y - a.y) / (markup.type === 'radius' ? 1 : 2);
      const k = 0.5522847498;
      const circle = (cx: number, cy: number, rr: number) => {
        updateBBox(cx - rr, cy - rr);
        updateBBox(cx + rr, cy + rr);
        lines.push(`${f2(cx + rr)} ${f2(cy)} m`);
        lines.push(`${f2(cx + rr)} ${f2(cy + rr * k)} ${f2(cx + rr * k)} ${f2(cy + rr)} ${f2(cx)} ${f2(cy + rr)} c`);
        lines.push(`${f2(cx - rr * k)} ${f2(cy + rr)} ${f2(cx - rr)} ${f2(cy + rr * k)} ${f2(cx - rr)} ${f2(cy)} c`);
        lines.push(`${f2(cx - rr)} ${f2(cy - rr * k)} ${f2(cx - rr * k)} ${f2(cy - rr)} ${f2(cx)} ${f2(cy - rr)} c`);
        lines.push(`${f2(cx + rr * k)} ${f2(cy - rr)} ${f2(cx + rr)} ${f2(cy - rr * k)} ${f2(cx + rr)} ${f2(cy)} c`);
      };
      circle(c.x, c.y, r);
      lines.push('S');
      pathPdf([a, b], false);
      lines.push('S');
      // Punto del centro
      lines.push('q', strokeParsed ? rgbOp(strokeParsed, 'rg') : '0 0 0 rg');
      circle(c.x, c.y, 1.5);
      lines.push('f', 'Q');
      break;
    }

    case 'dimension': {
      if (markup.points.length < 2) break;
      const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
      const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
      // Sin tercer punto (marca antigua o incompleta) la línea de cota va a 15 pt, por encima
      const p3 = markup.points[2]
        ? normalizedToPdfCoordinates(markup.points[2], transform)
        : visToPdf(defaultDimensionLinePoint(toVis(markup.points[0]), toVis(markup.points[1]), 15));
      const geom = dimensionGeometry(p1, p2, p3);
      if (!geom) break;
      // Líneas de referencia siempre continuas; la línea de cota lleva el tipo de línea elegido
      if (markup.style.dashArray && markup.style.dashArray.length > 0) lines.push('[] 0 d');
      for (const [a, b] of geom.extensions) {
        pathPdf([a, b], false);
        lines.push('S');
      }
      if (markup.style.dashArray && markup.style.dashArray.length > 0) {
        lines.push(`[${markup.style.dashArray.map((d) => d.toFixed(1)).join(' ')}] 0 d`);
      }
      pathPdf([geom.dimStart, geom.dimEnd], false);
      lines.push('S');
      emitLineEndings([geom.dimStart, geom.dimEnd]);
      const fontSize = markup.style.fontSize ?? 10;
      if (markup.text) {
        textPdf(
          markup.text,
          dimensionTextBaseline(geom, fontSize, true),
          geom.textAngle,
          fontSize,
          strokeParsed ?? DARK_TEXT,
          'center'
        );
      }
      break;
    }

    default: {
      // Para otros tipos con puntos básicos
      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);
        updateBBox(p1.x, p1.y);
        updateBBox(p2.x, p2.y);
      }
      break;
    }
  }

  // Valor de las mediciones (ADR-0032): forma parte del /AP, así que se ve igual en Revu, Acrobat y el aplanado
  {
    const label = markup.type === 'length' ? '' : measureCaptionLabel();
    const vis = markup.points.map(toVis);
    if (label && vis.length >= 1) {
      if (markup.type === 'area' || markup.type === 'perimeter' || markup.type === 'volume') {
        captionPdf(pointCaption(verticesCenter(vis), label, capFont.size));
      } else if (markup.type === 'polylineMeasure' && vis.length >= 2) {
        captionPdf(lineCaptionLayout(vis[vis.length - 2], vis[vis.length - 1], label, capFont.size, 'top').caption);
      } else if ((markup.type === 'radius' || markup.type === 'diameter') && vis.length >= 2) {
        captionPdf(lineCaptionLayout(vis[0], vis[1], label, capFont.size, 'top').caption);
      } else if (markup.type === 'angle' && vis.length >= 3) {
        const [p, v, q] = vis;
        const r = Math.max(12, Math.min(28, Math.hypot(p.x - v.x, p.y - v.y) / 3, Math.hypot(q.x - v.x, q.y - v.y) / 3));
        const t1 = Math.atan2(p.y - v.y, p.x - v.x);
        let d = Math.atan2(q.y - v.y, q.x - v.x) - t1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const mid = t1 + d / 2;
        const fs = capFont.size;
        captionPdf(pointCaption({ x: v.x + (r + fs * 1.6) * Math.cos(mid), y: v.y + (r + fs * 1.1) * Math.sin(mid) }, label, fs));
      }
    }
  }

  lines.push('Q');

  // Ajuste de bbox seguro en caso de degenerado
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  } else {
    // Añadir margen mínimo para grosor de trazo
    const pad = strokeWidth;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = maxX + pad;
    maxY = maxY + pad;
  }

  return {
    operators: lines.join('\n'),
    bbox: [minX, minY, maxX, maxY],
    extGState,
    ...(usesFont ? { fontName: AP_FONT_NAME } : {}),
    ...(usesBold ? { boldFontName: AP_BOLD_FONT_NAME } : {}),
    ...(Object.keys(extraFonts).length > 0 ? { extraFonts } : {}),
  };
}

/**
 * Directriz y caja de un callout en coordenadas PDF (ADR-0042), para /CL y /RD del FreeText de tipo callout: así
 * Revu y Acrobat lo reconocen como callout y al mover la caja la punta se queda donde estaba.
 */
export function calloutPdfLayout(
  markup: Markup,
  transform: PageTransformInfo
): { line: Pt[]; box: [number, number, number, number] } | null {
  if (markup.type !== 'callout' || markup.points.length === 0) return null;
  const isRot = transform.rotation === 90 || transform.rotation === 270;
  const visW = isRot ? transform.heightPt : transform.widthPt;
  const visH = isRot ? transform.widthPt : transform.heightPt;
  const toVis = (p: MarkupPoint): Pt => ({ x: p.x * visW, y: p.y * visH });
  const visToPdf = (p: Pt) => normalizedToPdfCoordinates({ x: p.x / visW, y: p.y / visH }, transform);
  const geom = calculateCalloutGeometry(
    toVis(markup.points[0]),
    toVis(markup.points[1] ?? markup.points[0]),
    (markup.leaders || []).map((lead) => lead.map(toVis)),
    1
  );
  const b = geom.box;
  const c1 = visToPdf({ x: b.x, y: b.y });
  const c2 = visToPdf({ x: b.x + b.width, y: b.y + b.height });
  const box: [number, number, number, number] = [Math.min(c1.x, c2.x), Math.min(c1.y, c2.y), Math.max(c1.x, c2.x), Math.max(c1.y, c2.y)];
  const l = geom.leaders[0];
  return { line: [visToPdf(l.arrowHead), visToPdf(l.elbow), visToPdf(l.boxAttachment)], box };
}
