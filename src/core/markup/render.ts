import { Markup, MarkupPoint, ViewportTransform } from '../../types/markup';
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
 * Genera el camino SVG para nubes de revisión técnica a partir de 2 puntos en pantalla.
 */
export function generateCloudPath(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  step = 20
): string {
  const left = Math.min(p1.x, p2.x);
  const top = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);

  const stepsX = Math.max(2, Math.round(width / step));
  const stepsY = Math.max(2, Math.round(height / step));
  const stepW = width / stepsX;
  const stepH = height / stepsY;

  let d = `M ${left} ${top}`;
  // Borde superior
  for (let i = 0; i < stepsX; i++) {
    const x1 = left + i * stepW;
    const x2 = x1 + stepW;
    d += ` Q ${x1 + stepW / 2} ${top - 8} ${x2} ${top}`;
  }
  // Borde derecho
  for (let i = 0; i < stepsY; i++) {
    const y1 = top + i * stepH;
    const y2 = y1 + stepH;
    d += ` Q ${left + width + 8} ${y1 + stepH / 2} ${left + width} ${y2}`;
  }
  // Borde inferior
  for (let i = stepsX; i > 0; i--) {
    const x2 = left + i * stepW;
    const x1 = x2 - stepW;
    d += ` Q ${x1 + stepW / 2} ${top + height + 8} ${x1} ${top + height}`;
  }
  // Borde izquierdo
  for (let i = stepsY; i > 0; i--) {
    const y2 = top + i * stepH;
    const y1 = y2 - stepH;
    d += ` Q ${left - 8} ${y1 + stepH / 2} ${left} ${y1}`;
  }
  d += ' Z';
  return d;
}

export interface SvgRenderDescriptor {
  tag: 'rect' | 'ellipse' | 'line' | 'polygon' | 'path' | 'g';
  attrs: Record<string, string | number>;
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
    'stroke-width': style.strokeWidth,
    fill: style.fillColor || 'transparent',
    opacity: style.opacity ?? 1,
  };

  if (style.dashArray && style.dashArray.length > 0) {
    baseAttrs['stroke-dasharray'] = style.dashArray.join(' ');
  }

  const p1Screen = markup.points[0]
    ? normalizedToScreen(markup.points[0], transform)
    : { x: 0, y: 0 };
  const p2Screen = markup.points[1]
    ? normalizedToScreen(markup.points[1], transform)
    : p1Screen;

  switch (markup.type) {
    case 'rectangle':
    case 'highlight':
    case 'highlightVector': {
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
        },
      };
    }

    case 'cloud':
    case 'cloudPlus': {
      return {
        tag: 'path',
        attrs: {
          ...baseAttrs,
          fill: style.fillColor || 'rgba(230, 240, 255, 0.2)',
          d: generateCloudPath(p1Screen, p2Screen),
        },
      };
    }

    case 'text': {
      const rect = getRectGeometry(p1Screen, p2Screen);
      const width = Math.max(80, rect.width);
      const height = Math.max(26, rect.height);
      return {
        tag: 'g',
        attrs: {},
        children: [
          {
            tag: 'rect',
            attrs: {
              x: rect.x,
              y: rect.y,
              width,
              height,
              fill: '#fffbe8',
              stroke: style.strokeColor,
              'stroke-width': 1,
              rx: 2,
            },
          },
          {
            tag: 'path', // Placeholder descriptor
            attrs: {
              x: rect.x + 6,
              y: rect.y + 16,
              'font-size': style.fontSize || 12,
              fill: '#1f2937',
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
