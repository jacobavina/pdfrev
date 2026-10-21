/**
 * Plan de renderizado de una página (ADR-0090). Puro: sin React ni DOM.
 *
 * Chromium (WebView2) limita un canvas a 16 384 px por lado y a unos 268 Mpx de área; por encima de esos límites el
 * lienzo queda en blanco. Una hoja E-size (3600 × 2400 pt) a 600 % ya supera los 16 384 px (21 600 px). Cuando el
 * búfer completo no cabe, se renderiza solo la región visible más una sobreexploración, en un canvas del tamaño de
 * esa región, colocado en su posición dentro de la hoja.
 */

export const MAX_CANVAS_DIM_PX = 16384;
/** Área máxima de búfer que se acepta (inferior al límite real de Chromium, para dejar margen de memoria). */
export const MAX_CANVAS_AREA_PX = 100_000_000;
/** Lado máximo de una región renderizada, en píxeles CSS (× dpr da el búfer). */
export const MAX_REGION_CSS_PX = 4096;
/** Sobreexploración a cada lado de lo visible, en píxeles CSS. */
export const REGION_OVERSCAN_CSS_PX = 512;

export interface RectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** ¿Cabe la hoja completa en un único canvas con ese factor de pantalla? */
export function fitsInSingleCanvas(widthCss: number, heightCss: number, dpr: number): boolean {
  const w = Math.floor(widthCss * dpr);
  const h = Math.floor(heightCss * dpr);
  return w <= MAX_CANVAS_DIM_PX && h <= MAX_CANVAS_DIM_PX && w * h <= MAX_CANVAS_AREA_PX;
}

/** Cuánto puede crecer una región (en CSS px) por lado para que su búfer quede dentro de los límites. */
export function maxRegionCss(dpr: number): number {
  const byDim = Math.floor(MAX_CANVAS_DIM_PX / dpr);
  const byArea = Math.floor(Math.sqrt(MAX_CANVAS_AREA_PX) / dpr);
  return Math.max(256, Math.min(MAX_REGION_CSS_PX, byDim, byArea));
}

/**
 * Región a renderizar: lo visible (coordenadas CSS dentro de la hoja) ampliado con sobreexploración, recortado a la
 * hoja y acotado a `maxRegionCss`. Se alinea a múltiplos de 64 px para que un pequeño desplazamiento no obligue a
 * renderizar de nuevo.
 */
export function regionAround(visible: RectPx, pageW: number, pageH: number, dpr: number): RectPx {
  const cap = maxRegionCss(dpr);
  const snap = 64;
  const grow = (v: number, size: number, limit: number) => {
    const want = Math.min(cap, Math.max(1, size) + 2 * REGION_OVERSCAN_CSS_PX);
    const start = Math.floor((v - (want - size) / 2) / snap) * snap;
    const clamped = Math.max(0, Math.min(Math.max(0, limit - want), start));
    return { start: clamped, size: Math.min(want, limit - clamped) };
  };
  const x = grow(visible.x, Math.min(visible.width, cap), pageW);
  const y = grow(visible.y, Math.min(visible.height, cap), pageH);
  return { x: x.start, y: y.start, width: x.size, height: y.size };
}

/** ¿La parte visible sigue dentro de la región ya renderizada? */
export function regionCovers(region: RectPx, visible: RectPx): boolean {
  return (
    visible.x >= region.x &&
    visible.y >= region.y &&
    visible.x + visible.width <= region.x + region.width &&
    visible.y + visible.height <= region.y + region.height
  );
}

/** Lo visible de una hoja dentro de un contenedor con scroll (ambos en coordenadas de pantalla). */
export function visibleRectOfPage(pageRect: RectPx, viewRect: RectPx): RectPx {
  const x0 = Math.max(pageRect.x, viewRect.x);
  const y0 = Math.max(pageRect.y, viewRect.y);
  const x1 = Math.min(pageRect.x + pageRect.width, viewRect.x + viewRect.width);
  const y1 = Math.min(pageRect.y + pageRect.height, viewRect.y + viewRect.height);
  return { x: x0 - pageRect.x, y: y0 - pageRect.y, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

export function planRender(pageW: number, pageH: number, dpr: number): 'full' | 'region' {
  return fitsInSingleCanvas(pageW, pageH, dpr) ? 'full' : 'region';
}
