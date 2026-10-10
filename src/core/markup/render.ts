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

/**
 * C2: Genera el camino SVG para nubes de revisión técnica en unidades de página (puntos).
 * Entrada: puntos normalizados (0..1) y dimensiones de la página.
 * Salida: comando path SVG ("M... Q... Z") en unidades de página (independiente del zoom).
 */
export function generateCloudPath(
  p1: MarkupPoint,
  p2: MarkupPoint,
  pageSize: { width: number; height: number },
  stepPt = 20
): string {
  const left = Math.min(p1.x, p2.x) * pageSize.width;
  const top = Math.min(p1.y, p2.y) * pageSize.height;
  const width = Math.max(0.0001, Math.abs(p2.x - p1.x) * pageSize.width);
  const height = Math.max(0.0001, Math.abs(p2.y - p1.y) * pageSize.height);

  const stepsX = Math.max(2, Math.round(width / stepPt));
  const stepsY = Math.max(2, Math.round(height / stepPt));
  const stepW = width / stepsX;
  const stepH = height / stepsY;

  let d = `M ${left.toFixed(2)} ${top.toFixed(2)}`;
  // Borde superior
  for (let i = 0; i < stepsX; i++) {
    const x1 = left + i * stepW;
    const x2 = x1 + stepW;
    d += ` Q ${(x1 + stepW / 2).toFixed(2)} ${(top - 8).toFixed(2)} ${x2.toFixed(2)} ${top.toFixed(2)}`;
  }
  // Borde derecho
  for (let i = 0; i < stepsY; i++) {
    const y1 = top + i * stepH;
    const y2 = y1 + stepH;
    d += ` Q ${(left + width + 8).toFixed(2)} ${(y1 + stepH / 2).toFixed(2)} ${(left + width).toFixed(2)} ${y2.toFixed(2)}`;
  }
  // Borde inferior
  for (let i = stepsX; i > 0; i--) {
    const x2 = left + i * stepW;
    const x1 = x2 - stepW;
    d += ` Q ${(x1 + stepW / 2).toFixed(2)} ${(top + height + 8).toFixed(2)} ${x1.toFixed(2)} ${(top + height).toFixed(2)}`;
  }
  // Borde izquierdo
  for (let i = stepsY; i > 0; i--) {
    const y2 = top + i * stepH;
    const y1 = y2 - stepH;
    d += ` Q ${(left - 8).toFixed(2)} ${(y1 + stepH / 2).toFixed(2)} ${left.toFixed(2)} ${y1.toFixed(2)}`;
  }
  d += ' Z';
  return d;
}

export interface SvgRenderDescriptor {
  tag: 'rect' | 'ellipse' | 'line' | 'polygon' | 'path' | 'text' | 'g';
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
      const p1Norm = markup.points[0] || { x: 0, y: 0 };
      const p2Norm = markup.points[1] || p1Norm;
      const pathD = generateCloudPath(
        p1Norm,
        p2Norm,
        { width: transform.width * transform.scale, height: transform.height * transform.scale },
        20 * transform.scale
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
