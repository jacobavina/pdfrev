import React from 'react';
import {
  Markup,
  MarkupPoint,
  ViewportTransform,
  LineEndingStyle,
  HIGHLIGHT_STYLE,
  STICKY_NOTE_SIZE_PT,
  STICKY_NOTE_COLORS,
} from '../../types/markup';
import { normalizedToScreen } from '../../utils/coordinates';
import { lineEndingShape, lineEndingSize, endpointAngles, CALLOUT_ARROW_HALF_ANGLE } from './lineEndings';
import {
  CaptionText,
  MEASURE_CAPTION_COLOR,
  MEASURE_CAPTION_PT,
  captionStyleOf,
  lineCaptionLayout,
  pointCaption,
  verticesCenter,
  measureLabelText,
  measureLineEndings,
  captionFontOf,
  captionTextWidth,
  captionCssFamily,
  markupFontOf,
  BOX_TEXT_COLOR,
  CaptionFont,
  distanceGeometry,
  MEASURE_LEADER_EXTENSION_PT,
  MEASURE_END_TICK_PT,
} from './measureCaption';
export { measureLabelText, measureLineEndings } from './measureCaption';
import { dimensionGeometry, dimensionTextBaseline, defaultDimensionLinePoint } from './dimension';
import { revisionCloudPathNormalized, cloudParams } from './revisionCloud';
import { calloutLeaderLayout, CALLOUT_LANDING_PT } from './calloutLayout';
import { linePatternPrimitives, markupLinePattern, patternOutlineOf, PatternLineStyleId } from './linePatterns';
import { stampLayout } from './stamps';
import { fieldTypeOf, fieldDisplayText, isFieldChecked } from './formFields';
import {
  getHelveticaTextWidth,
  getHelveticaCharWidth,
  HELVETICA_AFM_WIDTHS,
} from './helveticaMetrics';

export { getHelveticaTextWidth, getHelveticaCharWidth, HELVETICA_AFM_WIDTHS };

export interface EllipseGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface RectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calcula la geometría de una elipse inscrita en el bounding box de 2 puntos (en píxeles o normalizada).
 */
export function getEllipseGeometry(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): EllipseGeometry {
  const left = Math.min(p1.x, p2.x);
  const top = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);

  return {
    cx: left + width / 2,
    cy: top + height / 2,
    rx: Math.max(0.0001, width / 2),
    ry: Math.max(0.0001, height / 2),
  };
}

/**
 * Calcula la geometría normalizada de un rectángulo a partir de 2 puntos.
 */
export function getRectGeometry(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): RectGeometry {
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.max(0.0001, Math.abs(p2.x - p1.x)),
    height: Math.max(0.0001, Math.abs(p2.y - p1.y)),
  };
}

/**
 * Convierte un array de puntos normalizados a un string de puntos SVG en píxeles de pantalla ("x1,y1 x2,y2 ...").
 */
export function pointsToSvgPointsString(
  points: MarkupPoint[],
  transform: ViewportTransform
): string {
  if (points.length === 0) return '';
  return points
    .map((pt) => {
      const scr = normalizedToScreen(pt, transform);
      return `${scr.x.toFixed(2)},${scr.y.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * Genera el comando path SVG ("M... L...") para un trazo a mano alzada en pantalla.
 */
export function pointsToFreehandPathD(
  points: MarkupPoint[],
  transform: ViewportTransform
): string {
  if (points.length === 0) return '';
  const first = normalizedToScreen(points[0], transform);
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let i = 1; i < points.length; i++) {
    const pt = normalizedToScreen(points[i], transform);
    d += ` L ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
  }

  return d;
}

export const DEFAULT_ARC_STEP = 20;
export const MIN_SAGITTA = 4;
export const DEFAULT_SAGITTA_RATIO = 0.4;

/**
 * CALLOUT_ARROW_SIZE: Tamaño de la cabeza de flecha en puntos de página PDF (pt).
 * Justificación de diseño (Condición 5): Se define como constante global de ingeniería (8 pt) porque
 * representa el estándar de simbología técnica CAD (equivalente a ~2.8 mm en planos impresos). A
 * diferencia de arcStep (que se persiste por marca para admitir curvaturas de revisión disímiles por
 * disciplina técnica), el tamaño de flecha debe ser estrictamente homogéneo y predecible en todo el
 * visor y entre documentos. En pantalla se escala mediante transform.scale para mantener proporción
 * geométrica con el dibujo, y en PDF se exporta en unidades absolutas de página.
 */
export const CALLOUT_ARROW_SIZE = 8;
export const CALLOUT_ARROW_ANGLE = Math.PI / 6; // 30 grados de semi-apertura
export const CALLOUT_SHOULDER_LENGTH = 12; // 12 pt de quiebre/hombro horizontal CAD
export const CALLOUT_MIN_BOX_WIDTH = 70; // 70 pt ancho mínimo de caja
export const CALLOUT_MIN_BOX_HEIGHT = 24; // 24 pt alto mínimo de caja

export interface CalloutLeaderGeometry {
  arrowHead: { x: number; y: number };
  elbow: { x: number; y: number };
  boxAttachment: { x: number; y: number };
  arrowPoints: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
}

export interface CalloutGeometry {
  box: RectGeometry;
  leaders: CalloutLeaderGeometry[];
}

/**
 * Calcula la geometría completa de un Callout (caja, directrices con quiebre horizontal y cabeza de flecha).
 * Función pura compartida por el renderizador SVG de pantalla y el exportador vectorial PDF.
 */
export function calculateCalloutGeometry(
  boxP1: { x: number; y: number },
  boxP2: { x: number; y: number },
  leadersPoints: Array<{ x: number; y: number }[]>,
  scale = 1,
  landing?: number
): CalloutGeometry {
  const left = Math.min(boxP1.x, boxP2.x);
  const top = Math.min(boxP1.y, boxP2.y);
  const rawWidth = Math.abs(boxP2.x - boxP1.x);
  const rawHeight = Math.abs(boxP2.y - boxP1.y);

  const minW = CALLOUT_MIN_BOX_WIDTH * scale;
  const minH = CALLOUT_MIN_BOX_HEIGHT * scale;
  const width = Math.max(minW, rawWidth);
  const height = Math.max(minH, rawHeight);

  const box: RectGeometry = {
    x: left,
    y: top,
    width,
    height,
  };

  const arrowSize = CALLOUT_ARROW_SIZE * scale;
  const landingLen = (landing ?? CALLOUT_LANDING_PT) * scale;

  // Directriz de Revu/Foxit (ADR-0042): punta → codo → tramo horizontal al lado de la caja que mira al codo
  const leaders: CalloutLeaderGeometry[] = (
    leadersPoints && leadersPoints.length > 0
      ? leadersPoints
      : [[{ x: left - landingLen * 2, y: top + height / 2 }]]
  ).map((leaderPts) => {
    const arrowHead = leaderPts[0] || { x: left - landingLen * 2, y: top + height / 2 };
    const lay = calloutLeaderLayout(arrowHead, leaderPts[1], box, landingLen);
    const elbow = lay.knee;
    const boxAttachment = lay.attach;

    // Barbas de la flecha (compatibilidad; el dibujo usa el extremo de línea de la marca)
    const dx = elbow.x - arrowHead.x;
    const dy = elbow.y - arrowHead.y;
    const len = Math.hypot(dx, dy);

    let barb1 = { ...arrowHead };
    let barb2 = { ...arrowHead };

    if (len > 0.0001) {
      const theta = Math.atan2(dy, dx);
      barb1 = {
        x: arrowHead.x + arrowSize * Math.cos(theta + CALLOUT_ARROW_ANGLE),
        y: arrowHead.y + arrowSize * Math.sin(theta + CALLOUT_ARROW_ANGLE),
      };
      barb2 = {
        x: arrowHead.x + arrowSize * Math.cos(theta - CALLOUT_ARROW_ANGLE),
        y: arrowHead.y + arrowSize * Math.sin(theta - CALLOUT_ARROW_ANGLE),
      };
    }

    return {
      arrowHead,
      elbow,
      boxAttachment,
      arrowPoints: [arrowHead, barb1, barb2],
    };
  });

  return {
    box,
    leaders,
  };
}

/**
 * Helper que calcula CalloutGeometry a partir de un Markup y el ViewportTransform de pantalla.
 */
export function getCalloutGeometryFromMarkup(
  markup: Markup,
  transform: ViewportTransform
): CalloutGeometry {
  const p1 = normalizedToScreen(markup.points[0] || { x: 0, y: 0 }, transform);
  const p2 = normalizedToScreen(markup.points[1] || markup.points[0] || { x: 0, y: 0 }, transform);

  const leadersRaw = (
    markup.leaders && markup.leaders.length > 0
      ? markup.leaders
      : [[{ x: (markup.points[0]?.x ?? 0.1) - 0.05, y: (markup.points[0]?.y ?? 0.1) - 0.05 }]]
  ).map((leader) => leader.map((pt) => normalizedToScreen(pt, transform)));

  // En unidades de página con el zoom del visor: la llamada crece con el plano, como en Revu
  return calculateCalloutGeometry(p1, p2, leadersRaw, transform.zoom ?? transform.scale ?? 1);
}

export const CALLOUT_MAX_LINE_WIDTH_PT = 216;
export const CALLOUT_MAX_CHARS_PER_LINE = 36;

/**
 * Condición 1 (A.3) y Defecto 2: Fuente única para medir y envolver el texto de notas y llamadas.
 * Divide el texto en líneas envolviendo por palabras respetando saltos de línea explícitos,
 * con medición métrica real basada en la tabla AFM de Helvetica para evitar cualquier desbordamiento.
 */
export function wrapCalloutText(
  text: string,
  maxLineWidthPt = CALLOUT_MAX_LINE_WIDTH_PT,
  fontSizePt = 10
): string[] {
  const paragraphs = (text || '').split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const wordWidth = getHelveticaTextWidth(word, fontSizePt);
      // Si la palabra en sí misma supera el ancho máximo de línea, fraccionarla por caracteres
      if (wordWidth > maxLineWidthPt) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        let chunk = '';
        for (const char of word) {
          const testChunk = chunk + char;
          if (getHelveticaTextWidth(testChunk, fontSizePt) <= maxLineWidthPt || !chunk) {
            chunk = testChunk;
          } else {
            lines.push(chunk);
            chunk = char;
          }
        }
        if (chunk) {
          currentLine = chunk;
        }
        continue;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (getHelveticaTextWidth(testLine, fontSizePt) <= maxLineWidthPt || !currentLine) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Calcula las dimensiones normalizadas requeridas por la caja para alojar el texto indicado.
 * Permite que points[1] sea la fuente única de verdad para render, export y hit-testing,
 * garantizando que ninguna línea desborde el ancho de la caja (box.width - 12).
 */
export function estimateCalloutBoxNormalizedSize(
  text: string,
  fontSizePt = 10,
  pageWidthPt = 800,
  pageHeightPt = 600,
  maxLineWidthPt = CALLOUT_MAX_LINE_WIDTH_PT
): { width: number; height: number } {
  const lines = wrapCalloutText(text, maxLineWidthPt, fontSizePt);
  const maxLineMeasuredWidth = Math.max(
    ...lines.map((l) => getHelveticaTextWidth(l, fontSizePt)),
    40
  );
  const paddingPt = 16;

  const widthPt = Math.max(CALLOUT_MIN_BOX_WIDTH, maxLineMeasuredWidth + paddingPt);
  const heightPt = Math.max(CALLOUT_MIN_BOX_HEIGHT, lines.length * (fontSizePt + 4) + paddingPt);

  return {
    width: widthPt / pageWidthPt,
    height: heightPt / pageHeightPt,
  };
}

/**
 * Calcula el área firmada 2D de una polilínea cerrada en coordenadas de pantalla / SVG (y hacia abajo).
 * Retorna > 0 para sentido horario (CW), < 0 para antihorario (CCW).
 */
export function calculateSignedArea(points: { x: number; y: number }[]): number {
  let area2 = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    area2 += points[i].x * points[next].y - points[next].x * points[i].y;
  }
  return area2 / 2;
}

/**
 * C2: Genera el camino SVG para nubes de revisión técnica en unidades de página (puntos).
 * Soporta de forma determinista:
 * 1. Nubes rectangulares de 2 puntos (compatibilidad retroactiva exacta con la salida vectorial previa).
 * 2. Nubes poligonales de N >= 3 puntos con abombamiento determinista hacia el exterior
 *    calculado mediante el área firmada de la figura (independiente del sentido de giro CW / CCW).
 * 3. Sagitta mínima (MIN_SAGITTA = 4) para evitar aplanamiento de aristas cortas.
 * Salida: comando path SVG ("M... Q... Z") en unidades de página (independiente del zoom).
 */
export function generateCloudPath(
  p1OrPoints: MarkupPoint | MarkupPoint[],
  p2OrPageSize: MarkupPoint | { width: number; height: number },
  pageSizeOrStep?: { width: number; height: number } | number,
  stepPt = DEFAULT_ARC_STEP
): string {
  let points: MarkupPoint[];
  let pageSize: { width: number; height: number };
  let step: number;

  if (Array.isArray(p1OrPoints)) {
    points = p1OrPoints;
    pageSize = p2OrPageSize as { width: number; height: number };
    step = typeof pageSizeOrStep === 'number' ? pageSizeOrStep : stepPt;
  } else {
    points = [p1OrPoints, p2OrPageSize as MarkupPoint];
    pageSize = pageSizeOrStep as { width: number; height: number };
    step = typeof stepPt === 'number' ? stepPt : DEFAULT_ARC_STEP;
  }

  if (points.length === 0) return '';

  // Caso A: Nube rectangular de 2 puntos (o polígono con menos de 3 puntos)
  if (points.length <= 2) {
    const p1 = points[0];
    const p2 = points[1] || p1;

    const left = Math.min(p1.x, p2.x) * pageSize.width;
    const top = Math.min(p1.y, p2.y) * pageSize.height;
    const width = Math.max(0.0001, Math.abs(p2.x - p1.x) * pageSize.width);
    const height = Math.max(0.0001, Math.abs(p2.y - p1.y) * pageSize.height);

    const stepsX = Math.max(2, Math.round(width / step));
    const stepsY = Math.max(2, Math.round(height / step));
    const stepW = width / stepsX;
    const stepH = height / stepsY;

    const sagittaX = Math.max(MIN_SAGITTA, stepW * DEFAULT_SAGITTA_RATIO);
    const sagittaY = Math.max(MIN_SAGITTA, stepH * DEFAULT_SAGITTA_RATIO);

    let d = `M ${left.toFixed(2)} ${top.toFixed(2)}`;
    // Borde superior (abombamiento exterior hacia arriba -sagittaX)
    for (let i = 0; i < stepsX; i++) {
      const x1 = left + i * stepW;
      const x2 = x1 + stepW;
      d += ` Q ${(x1 + stepW / 2).toFixed(2)} ${(top - sagittaX).toFixed(2)} ${x2.toFixed(2)} ${top.toFixed(2)}`;
    }
    // Borde derecho (abombamiento exterior hacia derecha +sagittaY)
    for (let i = 0; i < stepsY; i++) {
      const y1 = top + i * stepH;
      const y2 = y1 + stepH;
      d += ` Q ${(left + width + sagittaY).toFixed(2)} ${(y1 + stepH / 2).toFixed(2)} ${(left + width).toFixed(2)} ${y2.toFixed(2)}`;
    }
    // Borde inferior (abombamiento exterior hacia abajo +sagittaX)
    for (let i = stepsX; i > 0; i--) {
      const x2 = left + i * stepW;
      const x1 = x2 - stepW;
      d += ` Q ${(x1 + stepW / 2).toFixed(2)} ${(top + height + sagittaX).toFixed(2)} ${x1.toFixed(2)} ${(top + height).toFixed(2)}`;
    }
    // Borde izquierdo (abombamiento exterior hacia izquierda -sagittaY)
    for (let i = stepsY; i > 0; i--) {
      const y2 = top + i * stepH;
      const y1 = y2 - stepH;
      d += ` Q ${(left - sagittaY).toFixed(2)} ${(y1 + stepH / 2).toFixed(2)} ${left.toFixed(2)} ${y1.toFixed(2)}`;
    }
    d += ' Z';
    return d;
  }

  // Caso B: Nube poligonal de N >= 3 puntos
  const polyPts = points.map((p) => ({
    x: p.x * pageSize.width,
    y: p.y * pageSize.height,
  }));

  const signedArea = calculateSignedArea(polyPts);
  // En SVG (eje Y hacia abajo), signedArea > 0 significa sentido horario (CW)
  const isCW = signedArea >= 0;

  const n = polyPts.length;
  let d = '';

  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const a = polyPts[i];
    const b = polyPts[nextIdx];

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);

    if (len < 1e-4) continue;

    // Normal unitaria exterior:
    // Si CW, el exterior está a la izquierda del vector de avance: (dy / len, -dx / len)
    // Si CCW, el exterior está a la derecha del vector de avance: (-dy / len, dx / len)
    const outNx = isCW ? dy / len : -dy / len;
    const outNy = isCW ? -dx / len : dx / len;

    const numArcs = Math.max(1, Math.round(len / step));
    const chordLen = len / numArcs;
    const sagitta = Math.max(MIN_SAGITTA, chordLen * DEFAULT_SAGITTA_RATIO);

    const stepDx = dx / numArcs;
    const stepDy = dy / numArcs;

    for (let j = 0; j < numArcs; j++) {
      const pStart = {
        x: a.x + j * stepDx,
        y: a.y + j * stepDy,
      };
      const pEnd = {
        x: a.x + (j + 1) * stepDx,
        y: a.y + (j + 1) * stepDy,
      };

      if (d === '') {
        d = `M ${pStart.x.toFixed(2)} ${pStart.y.toFixed(2)}`;
      }

      const pMid = {
        x: (pStart.x + pEnd.x) / 2,
        y: (pStart.y + pEnd.y) / 2,
      };

      const ctrlX = pMid.x + sagitta * outNx;
      const ctrlY = pMid.y + sagitta * outNy;

      d += ` Q ${ctrlX.toFixed(2)} ${ctrlY.toFixed(2)} ${pEnd.x.toFixed(2)} ${pEnd.y.toFixed(2)}`;
    }
  }

  d += ' Z';
  return d;
}

export interface SvgRenderDescriptor {
  tag: 'rect' | 'ellipse' | 'line' | 'polygon' | 'polyline' | 'path' | 'text' | 'g';
  attrs: Record<string, string | number>;
  style?: React.CSSProperties;
  children?: SvgRenderDescriptor[];
  textNode?: string;
}

/**
 * Descriptor SVG de un extremo de línea a partir de la geometría compartida (ADR-0018).
 * Las formas cerradas se rellenan con el color de la línea (una flecha "cerrada" nunca sale hueca).
 */
function createLineEndingDescriptor(
  pt: { x: number; y: number },
  angleRad: number,
  ending: LineEndingStyle,
  strokeColor: string,
  strokeWidthScreen: number,
  sizeScreen: number,
  halfAngle?: number
): SvgRenderDescriptor | null {
  const shape = lineEndingShape(pt, angleRad, ending, sizeScreen, false, halfAngle);
  if (!shape) return null;
  // Extremos de diseñador (ADR-0035): las formas rellenas no llevan contorno (un trazo redondeaba y engordaba las
  // puntas) y las abiertas se unen en ángulo vivo
  const common: Record<string, string | number> = shape.filled
    ? { fill: strokeColor, stroke: 'none' }
    : { stroke: strokeColor, strokeWidth: strokeWidthScreen, fill: 'none', strokeLinejoin: 'miter', strokeLinecap: 'butt' };
  if (shape.kind === 'circle') {
    return { tag: 'ellipse', attrs: { ...common, cx: shape.cx, cy: shape.cy, rx: shape.r, ry: shape.r } };
  }
  return {
    tag: shape.kind,
    attrs: { ...common, points: shape.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') },
  };
}

/** Añade los extremos (inicio/final) de una línea o polilínea en coordenadas de pantalla. */
function withLineEndings(
  main: SvgRenderDescriptor,
  screenPts: { x: number; y: number }[],
  style: Markup['style'],
  transform: ViewportTransform,
  opacity: string | number
): SvgRenderDescriptor {
  const angles = endpointAngles(screenPts);
  const hasStart = style.lineEndingStart && style.lineEndingStart !== 'none';
  const hasEnd = style.lineEndingEnd && style.lineEndingEnd !== 'none';
  if (!angles || (!hasStart && !hasEnd)) return main;

  // Puntas en unidades de página (ADR-0032): con el zoom crecen igual que en el PDF de Acrobat
  const pxPerPt = transform.zoom ?? transform.scale ?? 1;
  const widthScreen = (style.strokeWidth || 1) * (transform.scale || 1);
  const size = lineEndingSize(style.strokeWidth || 1) * pxPerPt;
  const children: SvgRenderDescriptor[] = [main];
  if (hasStart) {
    const d = createLineEndingDescriptor(screenPts[0], angles.start, style.lineEndingStart!, style.strokeColor, widthScreen, size);
    if (d) children.push(d);
  }
  if (hasEnd) {
    const last = screenPts[screenPts.length - 1];
    const d = createLineEndingDescriptor(last, angles.end, style.lineEndingEnd!, style.strokeColor, widthScreen, size);
    if (d) children.push(d);
  }
  return { tag: 'g', attrs: { opacity }, children };
}

/**
 * Marca con tipo de línea con patrón (ADR-0041): relleno del contorno y trazos del patrón, con la misma geometría
 * que el /AP. Los tamaños del patrón van en pt de página y crecen con el zoom, como las puntas de flecha.
 */
function patternDescriptor(
  markup: Markup,
  pattern: PatternLineStyleId,
  transform: ViewportTransform,
  baseAttrs: Record<string, string | number>
): SvgRenderDescriptor | null {
  const screenPts = markup.points.map((p) => normalizedToScreen(p, transform));
  const outline = patternOutlineOf(markup.type, screenPts, { width: 1, height: 1 });
  if (!outline) return null;
  const pxPerPt = transform.zoom ?? transform.scale ?? 1;
  const { step, invert } = cloudParams(markup.customFields, DEFAULT_ARC_STEP);
  const res = linePatternPrimitives(outline.pts, outline.closed, pattern, {
    strokeWidth: markup.style.strokeWidth || 1,
    unitsPerPt: pxPerPt,
    cloudStep: step,
    cloudInvert: invert,
  });
  const style = markup.style;
  const children: SvgRenderDescriptor[] = [];
  if (res.fill && style.fillColor && style.fillColor !== 'transparent') {
    children.push({ tag: 'path', attrs: { d: res.fill, fill: style.fillColor, stroke: 'none' } });
  }
  for (const st of res.strokes) {
    children.push({
      tag: 'path',
      attrs: {
        d: st.d,
        fill: 'none',
        stroke: style.strokeColor,
        strokeWidth: st.width ?? baseAttrs.strokeWidth,
        strokeLinejoin: 'round',
        strokeLinecap: 'butt',
      },
    });
  }
  const opacity = baseAttrs.opacity ?? 1;
  const main: SvgRenderDescriptor = { tag: 'g', attrs: {}, children };
  if (markup.type === 'line' || markup.type === 'polyLine') {
    const withEnds = withLineEndings(main, markup.type === 'line' ? screenPts.slice(0, 2) : screenPts, style, transform, opacity);
    if (withEnds !== main) return withEnds;
  }
  return { tag: 'g', attrs: { opacity }, children };
}

/** Atributos SVG de una tipografía: color, familia, negrita y cursiva (ADR-0040). */
function fontAttrs(font: CaptionFont): Record<string, string> {
  return {
    fill: font.color,
    fontFamily: captionCssFamily(font.family),
    ...(font.bold ? { fontWeight: 'bold' } : {}),
    ...(font.italic ? { fontStyle: 'italic' } : {}),
  };
}

/** Tamaño en px del texto de las mediciones: 10 pt de página con el zoom del visor (ADR-0032). */
function captionPx(transform: ViewportTransform, markup?: Markup): number {
  const size = markup ? captionFontOf(markup).size : MEASURE_CAPTION_PT;
  return size * (transform.zoom ?? transform.scale ?? 1);
}

/** Texto de una medición en pantalla: Helvetica negra sin recuadro, girada con la línea si hace falta. */
function captionDescriptor(c: CaptionText, opacity: string | number, markup?: Markup): SvgRenderDescriptor {
  const deg = (c.angle * 180) / Math.PI;
  // Tipografía elegida en Propiedades (ADR-0035): familia, color, negrita y cursiva
  const font = markup ? captionFontOf(markup) : null;
  return {
    tag: 'text',
    attrs: {
      x: c.origin.x,
      y: c.origin.y,
      fontSize: c.fontSize,
      fill: font?.color ?? MEASURE_CAPTION_COLOR,
      fontFamily: captionCssFamily(font?.family ?? 'Helvetica'),
      ...(font?.bold ? { fontWeight: 'bold' } : {}),
      ...(font?.italic ? { fontStyle: 'italic' } : {}),
      textAnchor: 'middle',
      opacity,
      ...(Math.abs(deg) > 0.01 ? { transform: `rotate(${deg.toFixed(2)} ${c.origin.x.toFixed(2)} ${c.origin.y.toFixed(2)})` } : {}),
    },
    textNode: c.text,
  };
}



/**
 * Función pura que calcula los descriptores de renderizado SVG para cualquier Markup
 * en espacio de pantalla según el ViewportTransform.
 */
export function getMarkupSvgDescriptor(
  markup: Markup,
  transform: ViewportTransform
): SvgRenderDescriptor {
  const style = markup.style;
  const baseAttrs: Record<string, string | number> = {
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidth,
    fill: style.fillColor || 'transparent',
    opacity: style.opacity ?? 1,
  };

  if (style.dashArray && style.dashArray.length > 0) {
    baseAttrs.strokeDasharray = style.dashArray.map((d) => d * (transform.scale || 1)).join(' ');
  }

  // Tipo de línea con patrón (ADR-0041): nube, valla, gas, vías... sobre líneas, polígonos, rectángulos y elipses
  const pattern = markupLinePattern(markup);
  if (pattern) {
    const desc = patternDescriptor(markup, pattern, transform, baseAttrs);
    if (desc) return desc;
  }

  const p1Screen = markup.points[0]
    ? normalizedToScreen(markup.points[0], transform)
    : { x: 0, y: 0 };
  const p2Screen = markup.points[1]
    ? normalizedToScreen(markup.points[1], transform)
    : p1Screen;

  switch (markup.type) {
    case 'rectangle': {
      const rect = getRectGeometry(p1Screen, p2Screen);
      return {
        tag: 'rect',
        attrs: {
          ...baseAttrs,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    }

    // Criterio 4: Resaltador compartido con HIGHLIGHT_STYLE y mix-blend-mode: multiply
    case 'highlight':
    case 'highlightVector':
    case 'highlightText': {
      const rect = getRectGeometry(p1Screen, p2Screen);
      return {
        tag: 'rect',
        attrs: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fill: HIGHLIGHT_STYLE.colorHex,
          opacity: HIGHLIGHT_STYLE.opacity,
          stroke: 'transparent',
          strokeWidth: 0,
        },
        style: {
          mixBlendMode: HIGHLIGHT_STYLE.mixBlendMode,
        },
      };
    }

    case 'circle': {
      const ell = getEllipseGeometry(p1Screen, p2Screen);
      return {
        tag: 'ellipse',
        attrs: {
          ...baseAttrs,
          cx: ell.cx,
          cy: ell.cy,
          rx: ell.rx,
          ry: ell.ry,
        },
      };
    }

    case 'line': {
      const mainLine: SvgRenderDescriptor = {
        tag: 'line',
        attrs: {
          ...baseAttrs,
          x1: p1Screen.x,
          y1: p1Screen.y,
          x2: p2Screen.x,
          y2: p2Screen.y,
        },
      };
      return withLineEndings(mainLine, [p1Screen, p2Screen], style, transform, baseAttrs.opacity ?? 1);
    }

    case 'polyLine': {
      const polyline: SvgRenderDescriptor = {
        tag: 'polyline',
        attrs: {
          ...baseAttrs,
          fill: style.fillColor || 'none',
          points: pointsToSvgPointsString(markup.points, transform),
        },
      };
      const screenPts = markup.points.map((p) => normalizedToScreen(p, transform));
      return withLineEndings(polyline, screenPts, style, transform, baseAttrs.opacity ?? 1);
    }

    case 'underline': {
      const rect = getRectGeometry(p1Screen, p2Screen);
      return {
        tag: 'line',
        attrs: {
          ...baseAttrs,
          x1: rect.x,
          y1: rect.y + rect.height,
          x2: rect.x + rect.width,
          y2: rect.y + rect.height,
          stroke: style.strokeColor || '#e02424',
          strokeWidth: style.strokeWidth || 2,
        },
      };
    }

    case 'strikeOut': {
      const rect = getRectGeometry(p1Screen, p2Screen);
      return {
        tag: 'line',
        attrs: {
          ...baseAttrs,
          x1: rect.x,
          y1: rect.y + rect.height / 2,
          x2: rect.x + rect.width,
          y2: rect.y + rect.height / 2,
          stroke: style.strokeColor || '#e02424',
          strokeWidth: style.strokeWidth || 2,
        },
      };
    }

    case 'polygon': {
      return {
        tag: 'polygon',
        attrs: {
          ...baseAttrs,
          points: pointsToSvgPointsString(markup.points, transform),
        },
      };
    }

    // Enlace (ADR-0027): recuadro azul discontinuo (en el PDF es invisible, como los enlaces de Revu/Acrobat)
    case 'link': {
      const r = getRectGeometry(p1Screen, p2Screen);
      const target =
        typeof markup.customFields?.linkUri === 'string'
          ? markup.customFields.linkUri
          : typeof markup.customFields?.linkPage === 'number'
          ? `Page ${markup.customFields.linkPage}`
          : '';
      return {
        tag: 'g',
        attrs: { 'data-testid': `markup-link-${markup.id}` },
        children: [
          {
            tag: 'rect',
            attrs: { x: r.x, y: r.y, width: r.width, height: r.height, fill: 'rgba(37, 99, 235, 0.08)', stroke: '#2563eb', strokeWidth: 1, strokeDasharray: '4 3' },
          },
          ...(target
            ? [
                {
                  tag: 'text' as const,
                  attrs: { x: r.x + 3, y: r.y - 3, fontSize: 9, fill: '#2563eb', fontFamily: 'Helvetica, Arial, sans-serif' },
                  textNode: `🔗 ${target}`,
                },
              ]
            : []),
        ],
      };
    }

    // Adjunto (ADR-0027): clip sobre fondo amarillo, como el ícono de Revu/Acrobat
    case 'fileAttachment': {
      const r = getRectGeometry(p1Screen, p2Screen);
      const s = Math.min(r.width, r.height);
      const k = s / 24;
      const ox = r.x + (r.width - s) / 2;
      const oy = r.y + (r.height - s) / 2;
      return {
        tag: 'g',
        attrs: { 'data-testid': `markup-attachment-${markup.id}` },
        children: [
          { tag: 'rect', attrs: { x: r.x, y: r.y, width: r.width, height: r.height, rx: 3, fill: '#fef3c7', stroke: style.strokeColor || '#b45309', strokeWidth: 1 } },
          {
            tag: 'path',
            attrs: {
              d: `M${ox + 15 * k} ${oy + 7 * k}l${-6 * k} ${6 * k}a${2 * k} ${2 * k} 0 0 0 ${3 * k} ${3 * k}l${7 * k} ${-7 * k}a${3.5 * k} ${3.5 * k} 0 0 0 ${-5 * k} ${-5 * k}l${-7 * k} ${7 * k}a${5 * k} ${5 * k} 0 0 0 ${7 * k} ${7 * k}l${6 * k} ${-6 * k}`,
              fill: 'none',
              stroke: style.strokeColor || '#b45309',
              strokeWidth: Math.max(1, 1.6 * k),
              strokeLinecap: 'round',
            },
          },
        ],
      };
    }

    // Campo de formulario (ADR-0027): misma presentación que su /AP
    case 'formField': {
      const r = getRectGeometry(p1Screen, p2Screen);
      const ft = fieldTypeOf(markup);
      const name = String(markup.customFields?.fieldName ?? '');
      const children: SvgRenderDescriptor[] = [
        {
          tag: ft === 'radio' ? 'ellipse' : 'rect',
          attrs:
            ft === 'radio'
              ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2, rx: r.width / 2, ry: r.height / 2, fill: '#eef4ff', stroke: '#64748b', strokeWidth: 1 }
              : { x: r.x, y: r.y, width: r.width, height: r.height, rx: ft === 'button' ? 4 : 0, fill: ft === 'button' ? '#e2e8f0' : '#eef4ff', stroke: '#64748b', strokeWidth: 1 },
        },
      ];
      const fs = Math.max(6, Math.min(r.height * 0.6, 12));
      const txt = fieldDisplayText(markup);
      if (ft === 'checkbox' && isFieldChecked(markup)) {
        children.push({ tag: 'path', attrs: { d: `M${r.x + r.width * 0.2} ${r.y + r.height * 0.55}L${r.x + r.width * 0.42} ${r.y + r.height * 0.78}L${r.x + r.width * 0.82} ${r.y + r.height * 0.25}`, fill: 'none', stroke: '#111827', strokeWidth: Math.max(1, r.width * 0.12) } });
      } else if (ft === 'radio' && isFieldChecked(markup)) {
        children.push({ tag: 'ellipse', attrs: { cx: r.x + r.width / 2, cy: r.y + r.height / 2, rx: r.width * 0.25, ry: r.height * 0.25, fill: '#111827' } });
      } else if (txt) {
        children.push({
          tag: 'text',
          attrs: {
            x: ft === 'button' || ft === 'signature' ? r.x + r.width / 2 : r.x + 3,
            y: ft === 'listbox' ? r.y + fs + 2 : r.y + r.height / 2 + fs * 0.35,
            fontSize: fs,
            fill: ft === 'signature' ? '#64748b' : '#111827',
            fontFamily: 'Helvetica, Arial, sans-serif',
            textAnchor: ft === 'button' || ft === 'signature' ? 'middle' : 'start',
          },
          textNode: txt,
        });
      }
      if (ft === 'dropdown') {
        children.push({ tag: 'path', attrs: { d: `M${r.x + r.width - 12} ${r.y + r.height / 2 - 2}l4 4 4-4`, fill: 'none', stroke: '#475569', strokeWidth: 1.2 } });
      }
      // Rótulo con el nombre del campo (solo en pantalla, como el modo de edición de formularios de Revu)
      // Los botones de opción muestran su valor a la derecha (el nombre del grupo está en Propiedades)
      children.push({
        tag: 'text',
        attrs:
          ft === 'radio'
            ? { x: r.x + r.width + 3, y: r.y + r.height / 2 + 3, fontSize: 8, fill: '#64748b', fontFamily: 'Helvetica, Arial, sans-serif' }
            : { x: r.x, y: r.y - 2, fontSize: 8, fill: '#64748b', fontFamily: 'Helvetica, Arial, sans-serif' },
        textNode: ft === 'radio' ? String(markup.customFields?.radioValue ?? '') : name,
      });
      return { tag: 'g', attrs: { 'data-testid': `markup-field-${markup.id}` }, children };
    }

    // Sello (ADR-0026): doble marco, título en negrita y autor/fecha; misma distribución que el /AP
    case 'stamp': {
      const r = getRectGeometry(p1Screen, p2Screen);
      const label = (markup.text || 'APPROVED').toUpperCase();
      const sub = typeof markup.customFields?.stampSubtitle === 'string' ? markup.customFields.stampSubtitle : '';
      const L = stampLayout({ x: r.x, y: r.y, w: Math.max(1, r.width), h: Math.max(1, r.height) }, label, sub);
      const color = style.strokeColor || '#15803d';
      const opacity = style.opacity ?? 1;
      const children: SvgRenderDescriptor[] = [
        {
          tag: 'rect',
          attrs: { x: L.outer.x, y: L.outer.y, width: L.outer.w, height: L.outer.h, rx: L.radius, ry: L.radius, fill: 'none', stroke: color, strokeWidth: L.outerStroke, opacity },
        },
        {
          tag: 'text',
          attrs: { x: L.titleBaseline.x, y: L.titleBaseline.y, fontSize: L.titleSize, fontWeight: 'bold', fontFamily: 'Helvetica, Arial, sans-serif', textAnchor: 'middle', fill: color, opacity },
          textNode: label,
        },
      ];
      if (L.subBaseline && sub) {
        children.push({
          tag: 'text',
          attrs: { x: L.subBaseline.x, y: L.subBaseline.y, fontSize: L.subSize, fontFamily: 'Helvetica, Arial, sans-serif', fontStyle: 'italic', textAnchor: 'middle', fill: color, opacity },
          textNode: sub,
        });
      }
      return { tag: 'g', attrs: { 'data-testid': `markup-stamp-${markup.id}` }, children };
    }

    // Cota con texto propio (ADR-0020): misma geometría que el /AP
    case 'dimension': {
      const s3 = markup.points[2]
        ? normalizedToScreen(markup.points[2], transform)
        : defaultDimensionLinePoint(p1Screen, p2Screen, 15 * (transform.scale || 1));
      const geom = dimensionGeometry(p1Screen, p2Screen, s3);
      const opacity = baseAttrs.opacity ?? 1;
      if (!geom) {
        return { tag: 'line', attrs: { ...baseAttrs, x1: p1Screen.x, y1: p1Screen.y, x2: p2Screen.x, y2: p2Screen.y } };
      }
      const children: SvgRenderDescriptor[] = geom.extensions.map(([a, b]) => ({
        tag: 'line' as const,
        attrs: { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: style.strokeColor, strokeWidth: style.strokeWidth, opacity },
      }));
      const dimLine: SvgRenderDescriptor = {
        tag: 'line',
        attrs: {
          ...baseAttrs,
          fill: 'none',
          x1: geom.dimStart.x,
          y1: geom.dimStart.y,
          x2: geom.dimEnd.x,
          y2: geom.dimEnd.y,
        },
      };
      children.push(withLineEndings(dimLine, [geom.dimStart, geom.dimEnd], style, transform, opacity));
      if (markup.text) {
        const fontSize = (style.fontSize ?? 10) * (transform.scale || 1);
        const base = dimensionTextBaseline(geom, fontSize, false);
        const deg = (geom.textAngle * 180) / Math.PI;
        children.push({
          tag: 'text',
          attrs: {
            x: base.x,
            y: base.y,
            fontSize,
            fill: style.strokeColor,
            fontFamily: 'Helvetica, Arial, sans-serif',
            textAnchor: 'middle',
            opacity,
            transform: `rotate(${deg.toFixed(2)} ${base.x.toFixed(2)} ${base.y.toFixed(2)})`,
          },
          textNode: markup.text,
        });
      }
      return { tag: 'g', attrs: { 'data-testid': `markup-dimension-${markup.id}` }, children };
    }

    // Mediciones al estilo de Acrobat (ADR-0029/0032): trazo de la marca y su valor en Helvetica negra, sin recuadro
    case 'perimeter':
    case 'volume': {
      const pts = markup.points.map((p) => normalizedToScreen(p, transform));
      const shape: SvgRenderDescriptor = {
        tag: 'polygon',
        attrs: {
          ...baseAttrs,
          fill:
            markup.type === 'volume'
              ? style.fillColor && style.fillColor !== 'transparent' && style.fillColor !== 'none'
                ? style.fillColor
                : 'rgba(124, 58, 237, 0.15)'
              : 'none',
          points: pointsToSvgPointsString(markup.points, transform),
          strokeLinejoin: 'round',
        },
      };
      const label = measureLabelText(markup, markup.measurement?.formatted || markup.text || '');
      const showLabel = !transform.hideMeasureLabels && Boolean(label);
      return {
        tag: 'g',
        attrs: { 'data-testid': `markup-${markup.type}-${markup.id}` },
        children: showLabel
          ? [shape, captionDescriptor(pointCaption(verticesCenter(pts), label, captionPx(transform, markup)), baseAttrs.opacity, markup)]
          : [shape],
      };
    }

    case 'angle': {
      const pts = markup.points.map((p) => normalizedToScreen(p, transform));
      const children: SvgRenderDescriptor[] = [
        { tag: 'polyline', attrs: { ...baseAttrs, fill: 'none', points: pointsToSvgPointsString(markup.points.slice(0, 3), transform) } },
      ];
      if (pts.length >= 3) {
        const [a, v, b] = pts;
        const r = Math.max(12, Math.min(28, Math.hypot(a.x - v.x, a.y - v.y) / 3, Math.hypot(b.x - v.x, b.y - v.y) / 3));
        const t1 = Math.atan2(a.y - v.y, a.x - v.x);
        const t2 = Math.atan2(b.y - v.y, b.x - v.x);
        let d = t2 - t1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const s1 = { x: v.x + r * Math.cos(t1), y: v.y + r * Math.sin(t1) };
        const s2 = { x: v.x + r * Math.cos(t1 + d), y: v.y + r * Math.sin(t1 + d) };
        children.push({
          tag: 'path',
          attrs: { d: `M ${s1.x} ${s1.y} A ${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${s2.x} ${s2.y}`, fill: 'none', stroke: style.strokeColor, strokeWidth: 1 },
        });
        const label = measureLabelText(markup, markup.measurement?.formatted || markup.text || '');
        if (!transform.hideMeasureLabels && label) {
          // Sobre la bisectriz, por fuera del arco
          const mid = t1 + d / 2;
          const fs = captionPx(transform, markup);
          const at = { x: v.x + (r + fs * 1.6) * Math.cos(mid), y: v.y + (r + fs * 1.1) * Math.sin(mid) };
          children.push(captionDescriptor(pointCaption(at, label, fs), baseAttrs.opacity, markup));
        }
      }
      return { tag: 'g', attrs: { 'data-testid': `markup-angle-${markup.id}` }, children };
    }

    case 'radius':
    case 'diameter': {
      const a = p1Screen;
      const b = p2Screen;
      const c = markup.type === 'radius' ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = markup.type === 'radius' ? Math.hypot(b.x - a.x, b.y - a.y) : Math.hypot(b.x - a.x, b.y - a.y) / 2;
      const children: SvgRenderDescriptor[] = [
        { tag: 'ellipse', attrs: { ...baseAttrs, fill: 'none', cx: c.x, cy: c.y, rx: r, ry: r } },
        { tag: 'line', attrs: { stroke: style.strokeColor, strokeWidth: style.strokeWidth, x1: a.x, y1: a.y, x2: b.x, y2: b.y } },
        { tag: 'ellipse', attrs: { cx: c.x, cy: c.y, rx: 2, ry: 2, fill: style.strokeColor } },
      ];
      const label = measureLabelText(markup, markup.measurement?.formatted || markup.text || '');
      if (!transform.hideMeasureLabels && label) {
        const text = `${markup.type === 'radius' ? 'R ' : 'Ø '}${label}`;
        children.push(captionDescriptor(lineCaptionLayout(a, b, text, captionPx(transform, markup), 'top').caption, baseAttrs.opacity, markup));
      }
      return { tag: 'g', attrs: { 'data-testid': `markup-${markup.type}-${markup.id}` }, children };
    }

    // Distancia (Distance de Acrobat): flecha abierta en ambos extremos y el valor dentro o encima de la línea
    case 'length': {
      const label = measureLabelText(markup, markup.measurement?.formatted || markup.text || '');
      const ends = measureLineEndings(style);
      const pxPerPt = transform.zoom ?? transform.scale ?? 1;
      const inset = lineEndingSize(style.strokeWidth || 1) * pxPerPt;
      const geom = distanceGeometry(
        markup.points.map((p) => normalizedToScreen(p, transform)),
        MEASURE_LEADER_EXTENSION_PT * pxPerPt,
        MEASURE_END_TICK_PT * pxPerPt
      ) ?? { a: p1Screen, b: p2Screen, leaders: [] };
      const layout =
        !transform.hideMeasureLabels && label
          ? lineCaptionLayout(
              geom.a,
              geom.b,
              label,
              captionPx(transform, markup),
              captionStyleOf(markup.customFields?.captionStyle),
              inset,
              (t, size) => captionTextWidth(t, size, captionFontOf(markup))
            )
          : null;
      const pieces = layout ? layout.pieces : [[geom.a, geom.b] as [{ x: number; y: number }, { x: number; y: number }]];
      const segment = ([u, w]: [{ x: number; y: number }, { x: number; y: number }], testId?: string): SvgRenderDescriptor => ({
        tag: 'line',
        attrs: { ...baseAttrs, fill: 'none', x1: u.x, y1: u.y, x2: w.x, y2: w.y, ...(testId ? { 'data-testid': testId } : {}) },
      });
      const lineGroup: SvgRenderDescriptor = { tag: 'g', attrs: {}, children: pieces.map((p) => segment(p)) };
      const withEnds = withLineEndings(lineGroup, [geom.a, geom.b], ends, transform, baseAttrs.opacity);
      // Líneas de referencia continuas aunque la medida sea discontinua
      const leaders = geom.leaders.map((p) => {
        const d = segment(p, 'distance-leader');
        delete d.attrs.strokeDasharray;
        return d;
      });
      return {
        tag: 'g',
        attrs: { 'data-testid': `markup-length-${markup.id}` },
        children: [...leaders, withEnds, ...(layout ? [captionDescriptor(layout.caption, baseAttrs.opacity, markup)] : [])],
      };
    }

    case 'polylineMeasure': {
      const polylineDesc: SvgRenderDescriptor = {
        tag: 'polyline',
        attrs: {
          ...baseAttrs,
          fill: 'none',
          points: pointsToSvgPointsString(markup.points, transform),
          strokeLinejoin: 'round',
        },
      };
      const label = measureLabelText(markup, markup.measurement?.formatted || markup.text || '');
      const pts = markup.points.map((p) => normalizedToScreen(p, transform));
      const children: SvgRenderDescriptor[] = [polylineDesc];
      if (!transform.hideMeasureLabels && label && pts.length >= 2) {
        // Encima del último tramo, como el perímetro abierto de Acrobat
        const caption = lineCaptionLayout(pts[pts.length - 2], pts[pts.length - 1], label, captionPx(transform, markup), 'top').caption;
        children.push(captionDescriptor(caption, baseAttrs.opacity, markup));
      }
      return {
        tag: 'g',
        attrs: { 'data-testid': `markup-polyline-measure-${markup.id}` },
        children,
      };
    }

    case 'area': {
      let shapeDesc: SvgRenderDescriptor;
      let centerPt: { x: number; y: number };

      if (markup.points.length <= 2) {
        const rect = getRectGeometry(p1Screen, p2Screen);
        shapeDesc = {
          tag: 'rect',
          attrs: {
            ...baseAttrs,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            fill: style.fillColor || 'rgba(59, 130, 246, 0.25)',
          },
        };
        centerPt = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      } else {
        shapeDesc = {
          tag: 'polygon',
          attrs: {
            ...baseAttrs,
            points: pointsToSvgPointsString(markup.points, transform),
            fill: style.fillColor || 'rgba(59, 130, 246, 0.25)',
          },
        };
        centerPt = verticesCenter(markup.points.map((p) => normalizedToScreen(p, transform)));
      }

      const label = measureLabelText(markup, markup.measurement?.formatted || markup.text || '');
      return {
        tag: 'g',
        attrs: { 'data-testid': `markup-area-${markup.id}` },
        children:
          transform.hideMeasureLabels || !label
            ? [shapeDesc]
            : [shapeDesc, captionDescriptor(pointCaption(centerPt, label, captionPx(transform, markup)), baseAttrs.opacity, markup)],
      };
    }

    case 'count': {
      const radius = 14;
      const countIndex = markup.measurement?.countIndex || markup.text || '1';

      const circleDesc: SvgRenderDescriptor = {
        tag: 'ellipse',
        attrs: {
          ...baseAttrs,
          cx: p1Screen.x,
          cy: p1Screen.y,
          rx: radius,
          ry: radius,
          fill: style.fillColor || '#3b82f6',
          stroke: style.strokeColor || '#1d4ed8',
          strokeWidth: style.strokeWidth || 2,
        },
      };

      const textNode: SvgRenderDescriptor = {
        tag: 'text',
        attrs: {
          x: p1Screen.x,
          y: p1Screen.y + 5,
          fill: '#ffffff',
          fontSize: 13,
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          textAnchor: 'middle',
        },
        textNode: String(countIndex),
      };

      return {
        tag: 'g',
        attrs: {
          'data-testid': `markup-count-${markup.id}`,
        },
        children: [circleDesc, textNode],
      };
    }

    case 'freehand': {
      return {
        tag: 'path',
        attrs: {
          ...baseAttrs,
          fill: 'none',
          d: pointsToFreehandPathD(markup.points, transform),
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
      };
    }

    // C2: Nube con pasos derivados en unidades de página independientes del zoom
    case 'cloud':
    case 'cloudPlus': {
      // Lóbulos en pt de página: en pantalla se escalan con el zoom real del visor (ADR-0021)
      const { step, invert } = cloudParams(markup.customFields, DEFAULT_ARC_STEP);
      const pxPerPt = transform.zoom ?? transform.scale ?? 1;
      const pathD = revisionCloudPathNormalized(
        markup.points,
        { width: transform.width * transform.scale, height: transform.height * transform.scale },
        step * pxPerPt,
        invert
      );
      return {
        tag: 'path',
        attrs: {
          ...baseAttrs,
          fill: style.fillColor || 'rgba(230, 240, 255, 0.2)',
          d: pathD,
        },
      };
    }

    // Callout (Llamada con directriz y caja de texto)
    case 'callout': {
      // Callout de Revu/Foxit (ADR-0042): directriz fina con flecha abierta, tramo horizontal y texto del color
      // de la línea; la caja solo se dibuja si tiene relleno
      const geom = getCalloutGeometryFromMarkup(markup, transform);
      const pxPerPt = transform.zoom ?? transform.scale ?? 1;
      const children: SvgRenderDescriptor[] = [];
      const lineW = style.strokeWidth || 1;
      const opacity = baseAttrs.opacity ?? 1;
      const ending = style.lineEndingStart && style.lineEndingStart !== 'none' ? style.lineEndingStart : style.lineEndingStart === 'none' ? null : 'openArrow';

      for (const leader of geom.leaders) {
        children.push({
          tag: 'polyline',
          attrs: {
            points: `${leader.arrowHead.x.toFixed(1)},${leader.arrowHead.y.toFixed(1)} ${leader.elbow.x.toFixed(1)},${leader.elbow.y.toFixed(1)} ${leader.boxAttachment.x.toFixed(1)},${leader.boxAttachment.y.toFixed(1)}`,
            stroke: style.strokeColor,
            strokeWidth: lineW,
            fill: 'none',
            strokeLinejoin: 'miter',
          },
        });
        const angles = endpointAngles([leader.arrowHead, leader.elbow]);
        if (ending && angles) {
          const d = createLineEndingDescriptor(
            leader.arrowHead,
            angles.start,
            ending,
            style.strokeColor,
            lineW,
            lineEndingSize(lineW) * pxPerPt,
            CALLOUT_ARROW_HALF_ANGLE
          );
          if (d) children.push(d);
        }
      }

      const boxed = Boolean(style.fillColor && style.fillColor !== 'transparent');
      children.push({
        tag: 'rect',
        attrs: {
          x: geom.box.x,
          y: geom.box.y,
          width: geom.box.width,
          height: geom.box.height,
          fill: boxed ? style.fillColor! : 'transparent',
          stroke: boxed ? style.strokeColor : 'none',
          strokeWidth: lineW,
        },
      });

      // Texto en pt de página con el zoom, con su tipografía (ADR-0040); por defecto del color de la línea
      const calloutFont = markupFontOf(markup, 10, style.strokeColor);
      const fontPx = calloutFont.size * pxPerPt;
      const maxTextWidth = Math.max(CALLOUT_MIN_BOX_WIDTH - 16, geom.box.width / pxPerPt - 16) * pxPerPt;
      const calloutLines = wrapCalloutText(markup.text || '', maxTextWidth, fontPx);
      calloutLines.forEach((line, i) => {
        children.push({
          tag: 'text',
          attrs: {
            x: geom.box.x + 6 * pxPerPt,
            y: geom.box.y + (4 + calloutFont.size + i * (calloutFont.size + 3)) * pxPerPt,
            fontSize: fontPx,
            ...fontAttrs(calloutFont),
            className: 'pointer-events-none',
          },
          textNode: line,
        });
      });

      return {
        tag: 'g',
        attrs: { className: 'cursor-pointer', opacity },
        children,
      };
    }

    // C1: Rama text devuelve tag 'text' válido
    case 'text': {
      const rect = getRectGeometry(p1Screen, p2Screen);
      const width = Math.max(80, rect.width);
      const height = Math.max(26, rect.height);
      return {
        tag: 'g',
        attrs: { className: 'cursor-text' },
        children: [
          {
            tag: 'rect',
            attrs: {
              x: rect.x,
              y: rect.y,
              width,
              height,
              fill: style.fillColor || '#fffbe8',
              stroke: style.strokeColor,
              strokeWidth: 1,
              rx: 2,
            },
          },
          {
            tag: 'text',
            attrs: {
              x: rect.x + 6,
              y: rect.y + 16,
              fontSize: markupFontOf(markup, 12, BOX_TEXT_COLOR).size,
              ...fontAttrs(markupFontOf(markup, 12, BOX_TEXT_COLOR)),
              className: 'pointer-events-none',
            },
            textNode: markup.text || 'Note',
          },
        ],
      };
    }

    // Sub-entregable A.4: Nota adhesiva técnica (cuadrada en puntos STICKY_NOTE_SIZE_PT = 24)
    case 'stickyNote': {
      const scale = transform.scale || 1.0;
      const sizePx = STICKY_NOTE_SIZE_PT * scale;
      const x = p1Screen.x;
      const y = p1Screen.y;
      const fillColor =
        style.fillColor && style.fillColor !== 'transparent' && style.fillColor !== 'none'
          ? style.fillColor
          : STICKY_NOTE_COLORS.yellow.fillColor;
      const strokeColor = style.strokeColor || STICKY_NOTE_COLORS.yellow.strokeColor;
      const strokeWidth = style.strokeWidth || 1;

      return {
        tag: 'g',
        attrs: {
          className: 'cursor-pointer',
        },
        children: [
          {
            tag: 'rect',
            attrs: {
              x,
              y,
              width: sizePx,
              height: sizePx,
              fill: fillColor,
              stroke: strokeColor,
              strokeWidth,
              rx: 2 * scale,
              opacity: style.opacity ?? 1,
            },
          },
          // 3 líneas interiores que representan el glifo de bloc de notas
          {
            tag: 'line',
            attrs: {
              x1: x + 5 * scale,
              y1: y + 7 * scale,
              x2: x + 19 * scale,
              y2: y + 7 * scale,
              stroke: strokeColor,
              strokeWidth: 1 * scale,
              strokeLinecap: 'round',
              opacity: 0.75,
            },
          },
          {
            tag: 'line',
            attrs: {
              x1: x + 5 * scale,
              y1: y + 12 * scale,
              x2: x + 19 * scale,
              y2: y + 12 * scale,
              stroke: strokeColor,
              strokeWidth: 1 * scale,
              strokeLinecap: 'round',
              opacity: 0.75,
            },
          },
          {
            tag: 'line',
            attrs: {
              x1: x + 5 * scale,
              y1: y + 17 * scale,
              x2: x + 14 * scale,
              y2: y + 17 * scale,
              stroke: strokeColor,
              strokeWidth: 1 * scale,
              strokeLinecap: 'round',
              opacity: 0.75,
            },
          },
        ],
      };
    }

    default: {
      const rect = getRectGeometry(p1Screen, p2Screen);
      return {
        tag: 'rect',
        attrs: {
          ...baseAttrs,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    }
  }
}

/**
 * Mapeo explícito de atributos SVG de kebab-case a camelCase para propiedades DOM de React.
 */
export const SVG_ATTR_CAMEL_MAP: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'font-size': 'fontSize',
  'font-family': 'fontFamily',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'text-anchor': 'textAnchor',
  'dominant-baseline': 'dominantBaseline',
  'alignment-baseline': 'alignmentBaseline',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'pointer-events': 'pointerEvents',
  'letter-spacing': 'letterSpacing',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
};

/**
 * Normaliza las claves de un objeto de atributos SVG a camelCase para React.createElement.
 * Conserva atributos data-* y aria-* intactos.
 */
export function normalizeSvgAttrs(
  attrs: Record<string, string | number>
): Record<string, string | number> {
  const normalized: Record<string, string | number> = {};
  for (const [key, val] of Object.entries(attrs)) {
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      normalized[key] = val;
    } else if (SVG_ATTR_CAMEL_MAP[key]) {
      normalized[SVG_ATTR_CAMEL_MAP[key]] = val;
    } else if (key.includes('-')) {
      const camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      normalized[camelKey] = val;
    } else {
      normalized[key] = val;
    }
  }
  return normalized;
}

/**
 * Renderizador de componentes SVG a partir del SvgRenderDescriptor.
 * Una sola ruta de render sin bifurcaciones de código.
 * Normaliza todos los attrs a camelCase para eliminar warnings de DOM property en React.
 */
export function renderSvgDescriptor(
  descriptor: SvgRenderDescriptor,
  key = 'svg-desc'
): React.ReactElement {
  const children = descriptor.children
    ? descriptor.children.map((child, idx) => renderSvgDescriptor(child, `${key}-${idx}`))
    : descriptor.textNode ?? null;

  const normalizedAttrs = normalizeSvgAttrs(descriptor.attrs);

  return React.createElement(
    descriptor.tag,
    {
      key,
      ...normalizedAttrs,
      style: descriptor.style,
    },
    children
  );
}
