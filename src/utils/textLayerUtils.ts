/**
 * Utilidades para extracción geométrica de texto y coordenadas de TextLayer (PDF.js 4.x)
 */

export interface TextLineRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Agrupa y fusiona rectángulos contiguos o pertenecientes a la misma línea visual de texto.
 * Previene que selecciones de palabras o caracteres individuales generen múltiples marcas por línea.
 */
export function mergeLineRects(rects: (DOMRect | TextLineRect)[]): TextLineRect[] {
  const valid = rects.filter((r) => r.width > 0.5 && r.height > 0.5);
  if (valid.length === 0) return [];
  if (valid.length === 1) {
    const r = valid[0];
    const rRight = r.right;
    const rBottom = r.bottom;
    return [
      {
        left: r.left,
        top: r.top,
        right: rRight,
        bottom: rBottom,
        width: r.width,
        height: r.height,
      },
    ];
  }

  // Ordenar verticalmente y luego horizontalmente
  const sorted = [...valid].sort((a, b) => {
    if (Math.abs(a.top - b.top) > 3) {
      return a.top - b.top;
    }
    return a.left - b.left;
  });

  const lines: TextLineRect[][] = [];
  for (const r of sorted) {
    const rRight = r.right;
    const rBottom = r.bottom;
    const normalizedR: TextLineRect = {
      left: r.left,
      top: r.top,
      right: rRight,
      bottom: rBottom,
      width: r.width,
      height: r.height,
    };

    if (lines.length === 0) {
      lines.push([normalizedR]);
      continue;
    }

    const currentLine = lines[lines.length - 1];
    const lineTop = Math.min(...currentLine.map((c) => c.top));
    const lineBottom = Math.max(...currentLine.map((c) => c.bottom));
    const lineHeight = Math.max(1, lineBottom - lineTop);

    const verticalOverlap =
      Math.min(lineBottom, normalizedR.bottom) - Math.max(lineTop, normalizedR.top);
    // Si hay solapamiento vertical de más del 30% de la altura menor, pertenecen a la misma línea visual
    if (verticalOverlap > 0.3 * Math.min(lineHeight, normalizedR.height)) {
      currentLine.push(normalizedR);
    } else {
      lines.push([normalizedR]);
    }
  }

  return lines.map((group) => {
    const left = Math.min(...group.map((r) => r.left));
    const top = Math.min(...group.map((r) => r.top));
    const right = Math.max(...group.map((r) => r.right));
    const bottom = Math.max(...group.map((r) => r.bottom));
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  });
}

/**
 * Extrae el texto correspondiente a un rectángulo de línea específico dentro de una selección Range.
 * Cuando la selección abarca múltiples líneas (getClientRects() > 1), asocia cada fragmento
 * a los spans del TextLayer que intersectan verticalmente con dicha línea.
 */
export function extractTextForLineRect(
  lineRect: DOMRect | TextLineRect,
  range: Range,
  textLayerContainer?: HTMLElement | null
): string {
  const allRects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 0.5 && r.height > 0.5
  );

  // Si la selección solo tiene 1 línea, el texto del range es directamente el texto de la línea
  if (allRects.length <= 1) {
    return range.toString().trim();
  }

  if (!textLayerContainer) {
    return range.toString().trim();
  }

  const spans = Array.from(textLayerContainer.querySelectorAll('span'));
  const lineSpans = spans.filter((span) => {
    try {
      if (!range.intersectsNode(span)) return false;
    } catch {
      return false;
    }
    const sRect = span.getBoundingClientRect();
    const spanCenterY = (sRect.top + sRect.bottom) / 2;
    // Tolerancia vertical de 3px para considerar que el span pertenece a esta línea
    return spanCenterY >= lineRect.top - 3 && spanCenterY <= lineRect.bottom + 3;
  });

  if (lineSpans.length === 0) {
    return range.toString().trim();
  }

  // Ordenar de izquierda a derecha
  lineSpans.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

  const fragments: string[] = [];
  for (const span of lineSpans) {
    const text = span.textContent || '';
    let start = 0;
    let end = text.length;

    const textNode = span.firstChild || span;
    if (range.startContainer === textNode || range.startContainer === span) {
      start = range.startOffset;
    }
    if (range.endContainer === textNode || range.endContainer === span) {
      end = range.endOffset;
    }

    const slice = text.slice(start, end).trim();
    if (slice) {
      fragments.push(slice);
    }
  }

  return fragments.length > 0 ? fragments.join(' ') : range.toString().trim();
}
