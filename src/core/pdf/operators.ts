import {
  Markup,
  MarkupPoint,
  STICKY_NOTE_SIZE_PT,
  STICKY_NOTE_COLORS,
} from '../../types/markup';
import {
  DEFAULT_ARC_STEP,
} from '../markup/render';

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

  switch (markup.type) {
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

    case 'line':
    case 'length': {
      if (markup.points.length >= 2) {
        const p1 = normalizedToPdfCoordinates(markup.points[0], transform);
        const p2 = normalizedToPdfCoordinates(markup.points[1], transform);

        updateBBox(p1.x, p1.y);
        updateBBox(p2.x, p2.y);

        lines.push(`${p1.x.toFixed(2)} ${p1.y.toFixed(2)} m`);
        lines.push(`${p2.x.toFixed(2)} ${p2.y.toFixed(2)} l`);
        lines.push('S');
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

      void arcStep; // Marcador reservado para cálculo avanzado de arcos

      // Calcular bbox a partir de los puntos base
      for (const pt of markup.points) {
        const pdfPt = normalizedToPdfCoordinates(pt, transform);
        updateBBox(pdfPt.x, pdfPt.y);
      }

      // El trazado de nube usa operadores estándar
      lines.push(opPaint);
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
  };
}
