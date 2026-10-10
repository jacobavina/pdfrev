import React from 'react';
import { Markup, MarkupPoint, ViewportTransform, HIGHLIGHT_STYLE } from '../../types/markup';
import { normalizedToScreen } from '../../utils/coordinates';

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
  scale = 1
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

  const shoulderLength = CALLOUT_SHOULDER_LENGTH * scale;
  const arrowSize = CALLOUT_ARROW_SIZE * scale;
  const boxCenterY = top + height / 2;

  const leaders: CalloutLeaderGeometry[] = (
    leadersPoints && leadersPoints.length > 0
      ? leadersPoints
      : [[{ x: left - shoulderLength * 2, y: boxCenterY }]]
  ).map((leaderPts) => {
    const arrowHead = leaderPts[0] || { x: left - shoulderLength * 2, y: boxCenterY };
    let boxAttachment: { x: number; y: number };
    let elbow: { x: number; y: number };

    // Decisión de quiebre y hombro horizontal CAD según posición del objetivo:
    if (arrowHead.x < left) {
      boxAttachment = { x: left, y: boxCenterY };
      elbow = { x: Math.min(left - shoulderLength, (left + arrowHead.x) / 2), y: boxCenterY };
    } else if (arrowHead.x > left + width) {
      boxAttachment = { x: left + width, y: boxCenterY };
      elbow = { x: Math.max(left + width + shoulderLength, (left + width + arrowHead.x) / 2), y: boxCenterY };
    } else {
      // Directamente arriba o abajo de la caja
      if (arrowHead.y < top) {
        boxAttachment = { x: left + width / 2, y: top };
        elbow = { x: left + width / 2, y: Math.min(top - shoulderLength, (top + arrowHead.y) / 2) };
      } else {
        boxAttachment = { x: left + width / 2, y: top + height };
        elbow = { x: left + width / 2, y: Math.max(top + height + shoulderLength, (top + height + arrowHead.y) / 2) };
      }
    }

    // Cálculo de la cabeza de flecha poligonal (apuntando a arrowHead)
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

  return calculateCalloutGeometry(p1, p2, leadersRaw, transform.scale);
}

/**
 * Calcula las dimensiones normalizadas requeridas por la caja para alojar el texto indicado.
 * Permite que points[1] sea la fuente única de verdad para render, export y hit-testing.
 */
export function estimateCalloutBoxNormalizedSize(
  text: string,
  fontSizePt = 10,
  pageWidthPt = 800,
  pageHeightPt = 600
): { width: number; height: number } {
  const lines = (text || '').split(/\r?\n/);
  const longestLine = Math.max(...lines.map((l) => l.length), 4);
  const charWidthPt = fontSizePt * 0.6;
  const paddingPt = 14;

  const widthPt = Math.max(CALLOUT_MIN_BOX_WIDTH, longestLine * charWidthPt + paddingPt);
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
    baseAttrs.strokeDasharray = style.dashArray.join(' ');
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
      return {
        tag: 'line',
        attrs: {
          ...baseAttrs,
          x1: p1Screen.x,
          y1: p1Screen.y,
          x2: p2Screen.x,
          y2: p2Screen.y,
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
      const arcStep =
        typeof markup.customFields?.arcStep === 'number'
          ? markup.customFields.arcStep
          : DEFAULT_ARC_STEP;

      const pathD = generateCloudPath(
        markup.points,
        { width: transform.width * transform.scale, height: transform.height * transform.scale },
        arcStep * transform.scale
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
      const geom = getCalloutGeometryFromMarkup(markup, transform);
      const children: SvgRenderDescriptor[] = [];

      // 1. Directrices (al fondo detrás de la caja): polilínea de quiebre y punta de flecha poligonal
      for (const leader of geom.leaders) {
        // Línea con quiebre (codo)
        children.push({
          tag: 'polyline',
          attrs: {
            points: `${leader.arrowHead.x.toFixed(1)},${leader.arrowHead.y.toFixed(1)} ${leader.elbow.x.toFixed(1)},${leader.elbow.y.toFixed(1)} ${leader.boxAttachment.x.toFixed(1)},${leader.boxAttachment.y.toFixed(1)}`,
            stroke: style.strokeColor,
            strokeWidth: style.strokeWidth || 1.5,
            fill: 'none',
            strokeLinejoin: 'round',
          },
        });

        // Cabeza de flecha visible en el objetivo (unidades de página escaladas)
        const [tip, b1, b2] = leader.arrowPoints;
        children.push({
          tag: 'polygon',
          attrs: {
            points: `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${b1.x.toFixed(1)},${b1.y.toFixed(1)} ${b2.x.toFixed(1)},${b2.y.toFixed(1)}`,
            fill: style.strokeColor,
            stroke: style.strokeColor,
            strokeWidth: 1,
            strokeLinejoin: 'round',
          },
        });
      }

      // 2. Caja de texto opaca (encima de la entrada de las directrices)
      children.push({
        tag: 'rect',
        attrs: {
          x: geom.box.x,
          y: geom.box.y,
          width: geom.box.width,
          height: geom.box.height,
          fill: style.fillColor || '#ffffff',
          stroke: style.strokeColor,
          strokeWidth: style.strokeWidth || 1.5,
          rx: 2,
        },
      });

      // 3. Texto de la llamada (capa superior dentro de la caja)
      children.push({
        tag: 'text',
        attrs: {
          x: geom.box.x + 6,
          y: geom.box.y + 16,
          fontSize: style.fontSize || 12,
          fill: '#1f2937',
          fontFamily: style.fontFamily || 'sans-serif',
          className: 'font-medium pointer-events-none',
        },
        textNode: markup.text || '',
      });

      return {
        tag: 'g',
        attrs: { className: 'cursor-pointer' },
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
              fontSize: style.fontSize || 12,
              fill: '#1f2937',
              fontFamily: style.fontFamily || 'sans-serif',
              className: 'font-medium pointer-events-none',
            },
            textNode: markup.text || 'Nota',
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
