/**
 * Rasterización de una página a escala de trabajo (ADR-0091, ADR-0095): la usan Compare Documents y el relleno
 * dinámico. Siempre con la rotación propia de la página y sin la rotación de la vista, igual que las coordenadas
 * normalizadas de las marcas.
 */

/** Ancho de rasterización por defecto, en píxeles: suficiente para ver trazos finos sin disparar la memoria. */
export const RASTER_WIDTH_PX = 1600;

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rasteriza una página a `width` px de ancho (blanco de fondo); `fit` estira la página a un tamaño dado. */
export async function rasterizePage(
  bytes: Uint8Array,
  pageIndex: number,
  fit?: { width: number; height: number },
  width = RASTER_WIDTH_PX
) {
  const { loadPdfDocument } = await import('./pdfService');
  const doc = await loadPdfDocument(bytes);
  try {
    const page = await doc.getPage(Math.min(pageIndex, doc.numPages - 1) + 1);
    const natural = page.getViewport({ scale: 1 });
    const scale = (fit?.width ?? width) / natural.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (fit && (canvas.width !== fit.width || canvas.height !== fit.height)) {
      const fitted = document.createElement('canvas');
      fitted.width = fit.width;
      fitted.height = fit.height;
      const fctx = fitted.getContext('2d', { alpha: false, willReadFrequently: true })!;
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, fit.width, fit.height);
      fctx.drawImage(canvas, 0, 0, fit.width, fit.height);
      const img = fctx.getImageData(0, 0, fit.width, fit.height);
      return { raster: { data: img.data, width: fit.width, height: fit.height }, aspect: natural.width / natural.height };
    }
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { raster: { data: img.data, width: canvas.width, height: canvas.height }, aspect: natural.width / natural.height };
  } finally {
    await doc.destroy();
  }
}

