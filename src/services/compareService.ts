import { v4 as uuidv4 } from 'uuid';
import { compareRasters, NormalizedRect } from '../core/compare/compareDocuments';
import { DEFAULT_MARKUP_COLOR } from '../core/markup/palette';
import { cloudCreationFields, useToolStore } from '../store/useToolStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { Markup } from '../types/markup';
import { pickPdf } from './overlayService';
import { showToast } from './toastService';

/**
 * Compare Documents (ADR-0091): compara la página activa con la misma página de otra revisión del plano y marca con
 * una nube cada región que cambió, en la capa "Comparison".
 */

export const COMPARISON_LAYER = 'Comparison';
/** Ancho de rasterización de las dos páginas, en píxeles: suficiente para ver trazos finos sin disparar la memoria. */
const RASTER_WIDTH_PX = 1600;

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Nubes de revisión (rectángulos) que rodean cada región cambiada. */
export function comparisonClouds(rects: NormalizedRect[], pageIndex: number, otherName: string, author: string): Markup[] {
  const now = new Date().toISOString();
  return rects.map((r, i) => ({
    id: uuidv4(),
    type: 'cloud',
    pageIndex,
    points: [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
    ],
    style: { strokeColor: DEFAULT_MARKUP_COLOR, fillColor: 'transparent', strokeWidth: 1.5, opacity: 1 },
    text: `Changed vs ${otherName} (${i + 1} of ${rects.length})`,
    author,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    layer: COMPARISON_LAYER,
    subject: 'Comparison',
    customFields: cloudCreationFields(),
  }));
}

/**
 * Compara dos rasterizaciones de la misma hoja y añade una nube por cada cambio (un solo paso de historial).
 * Devuelve el número de nubes creadas.
 */
export function applyComparison(base: Raster, other: Raster, pageIndex: number, otherName: string): number {
  if (base.width !== other.width || base.height !== other.height) {
    throw new Error('The two pages must be rasterized at the same size.');
  }
  const rects = compareRasters(base.data, other.data, base.width, base.height);
  if (rects.length === 0) return 0;
  const author = useToolStore.getState().author || 'Reviewer';
  useMarkupStore.getState().addMarkups(comparisonClouds(rects, pageIndex, otherName, author), 'Compare documents');
  return rects.length;
}

/** Rasteriza una página a `width` px de ancho (blanco de fondo); `fit` estira la página a un tamaño dado. */
async function rasterizePage(bytes: Uint8Array, pageIndex: number, fit?: { width: number; height: number }) {
  const { loadPdfDocument } = await import('./pdfService');
  const doc = await loadPdfDocument(bytes);
  try {
    const page = await doc.getPage(Math.min(pageIndex, doc.numPages - 1) + 1);
    const natural = page.getViewport({ scale: 1 });
    const scale = (fit?.width ?? RASTER_WIDTH_PX) / natural.width;
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

/** Pide la otra revisión y marca con nubes lo que cambió respecto de la página activa. */
export async function compareWithFile(): Promise<void> {
  const { pdfBytes, currentPageIndex } = useDocumentStore.getState();
  if (!pdfBytes) {
    showToast('Open a document to compare.');
    return;
  }
  try {
    const picked = await pickPdf('Compare with another revision');
    if (!picked) return;
    showToast(`Comparing page ${currentPageIndex + 1} with ${picked.name}…`);
    const a = await rasterizePage(pdfBytes, currentPageIndex);
    const b = await rasterizePage(picked.bytes, currentPageIndex, { width: a.raster.width, height: a.raster.height });
    const sameShape = Math.abs(a.aspect - b.aspect) / a.aspect < 0.02;
    const count = applyComparison(a.raster, b.raster, currentPageIndex, picked.name);
    const note = sameShape ? '' : ' The pages have different proportions, so the result may be unreliable.';
    showToast(
      count === 0
        ? `No differences found between this page and ${picked.name}.${note}`
        : `${count} difference${count === 1 ? '' : 's'} marked with clouds on the "${COMPARISON_LAYER}" layer.${note}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Compare] Error comparando revisiones:', err);
    showToast(`Could not compare the documents: ${message}`);
  }
}
