import { v4 as uuidv4 } from 'uuid';
import { compareRasters, NormalizedRect } from '../core/compare/compareDocuments';
import { DEFAULT_MARKUP_COLOR } from '../core/markup/palette';
import { cloudCreationFields, useToolStore } from '../store/useToolStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { Markup } from '../types/markup';
import { pickPdf } from './overlayService';
import { showToast } from './toastService';
import { rasterizePage, Raster } from './pageRaster';

/**
 * Compare Documents (ADR-0091): compara la página activa con la misma página de otra revisión del plano y marca con
 * una nube cada región que cambió, en la capa "Comparison".
 */

export const COMPARISON_LAYER = 'Comparison';

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
