import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import {
  cropPdfPages,
  marginsToViewRect,
  markupsOutsideRect,
  pdfBoxToViewRect,
  readPageGeometry,
  remapMarkupsToRect,
  remapViewportsToRect,
  viewSize,
  type CropMargins,
  type CropPlanItem,
} from '../core/pages/pageBoxes';
import { numberPdfPages, type NumberPagesOptions } from '../core/pages/pageNumbers';
import { writeDocumentProperties, type EditableProperties } from '../core/pages/documentProperties';
import { loadPdfDocument } from './pdfService';
import { showToast } from './toastService';

/**
 * Document Properties, Crop Pages y Number Pages (ADR-0113): cambian los bytes del PDF abierto y conservan el resto
 * del estado del documento (página, zoom, etiquetas, columnas y anotaciones importadas).
 */

/** Sustituye el PDF abierto por `bytes` sin perder el estado del documento, y lo marca como modificado. */
export async function replaceOpenDocument(bytes: Uint8Array): Promise<void> {
  const prev = useDocumentStore.getState();
  const pdfDoc = await loadPdfDocument(bytes);
  prev.setDocument(prev.filePath, prev.fileName || 'document.pdf', bytes, pdfDoc.numPages, pdfDoc);
  useDocumentStore.setState({
    currentPageIndex: Math.min(prev.currentPageIndex, pdfDoc.numPages - 1),
    scale: prev.scale,
    rotation: prev.rotation,
    pageLabels: prev.pageLabels,
    customColumns: prev.customColumns,
    importedAnnotationIds: prev.importedAnnotationIds,
  });
  useMarkupStore.getState().markDirty();
}

// ── Crop Pages ──────────────────────────────────────────────────────────────────────────────────────────────────

export type CropRequest = { pages: number[]; margins: CropMargins } | { pages: number[]; restore: true };

export interface CropPreview {
  plan: CropPlanItem[];
  /** Páginas que quedarían demasiado pequeñas con esos márgenes. */
  tooSmall: number[];
  /** Marcas que no caben en el recorte, por página. */
  outside: Record<number, number>;
  /** Tamaño en puntos de la página actual tras el recorte, si está entre las elegidas. */
  resultSize: { pageIndex: number; width: number; height: number } | null;
}

/** Qué pasaría con un recorte, sin tocar el documento. */
export async function previewCrop(req: CropRequest): Promise<CropPreview> {
  const { pdfBytes, currentPageIndex } = useDocumentStore.getState();
  const { markups } = useMarkupStore.getState();
  const preview: CropPreview = { plan: [], tooSmall: [], outside: {}, resultSize: null };
  if (!pdfBytes) return preview;
  const geometry = await readPageGeometry(pdfBytes);
  for (const index of req.pages) {
    const g = geometry[index];
    if (!g) continue;
    const rect = 'restore' in req ? pdfBoxToViewRect(g.mediaBox, g.transform) : marginsToViewRect(viewSize(g.transform), req.margins);
    if (!rect) {
      preview.tooSmall.push(index);
      continue;
    }
    preview.plan.push({ pageIndex: index, rect });
    const outside = markupsOutsideRect(markups, index, rect).length;
    if (outside > 0) preview.outside[index] = outside;
    if (index === currentPageIndex) {
      const v = viewSize(g.transform);
      preview.resultSize = { pageIndex: index, width: (rect.u2 - rect.u1) * v.width, height: (rect.v2 - rect.v1) * v.height };
    }
  }
  return preview;
}

/** Recorta (o restaura) las páginas pedidas. Devuelve el mensaje para el usuario y si se hizo. */
export async function executeCropPages(req: CropRequest): Promise<{ ok: boolean; message: string }> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  const preview = await previewCrop(req);
  if (preview.tooSmall.length > 0) {
    return { ok: false, message: `The margins leave page ${preview.tooSmall[0] + 1} too small (less than 0.25 in a side).` };
  }
  const blocked = Object.entries(preview.outside);
  if (blocked.length > 0) {
    const total = blocked.reduce((n, [, c]) => n + c, 0);
    return { ok: false, message: `${total} markup${total === 1 ? '' : 's'} on page ${Number(blocked[0][0]) + 1}${blocked.length > 1 ? ' and others' : ''} would fall outside the crop. Move or delete them, or use smaller margins.` };
  }
  if (preview.plan.length === 0) return { ok: false, message: 'There are no pages to crop.' };
  try {
    const out = await cropPdfPages(pdfBytes, preview.plan);
    let markups = useMarkupStore.getState().markups;
    const viewports = { ...useCalibrationStore.getState().viewports };
    for (const { pageIndex, rect } of preview.plan) {
      markups = remapMarkupsToRect(markups, pageIndex, rect);
      if (viewports[pageIndex]) viewports[pageIndex] = remapViewportsToRect(viewports[pageIndex], rect);
    }
    useMarkupStore.getState().setMarkups(markups);
    useCalibrationStore.setState({ viewports });
    await replaceOpenDocument(out);
    const n = preview.plan.length;
    return { ok: true, message: 'restore' in req ? `${n} page${n === 1 ? '' : 's'} restored to the full page.` : `${n} page${n === 1 ? '' : 's'} cropped.` };
  } catch (err) {
    return { ok: false, message: `Could not crop: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Number Pages ────────────────────────────────────────────────────────────────────────────────────────────────

export async function executeNumberPages(opts: NumberPagesOptions): Promise<{ ok: boolean; message: string }> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  try {
    const out = await numberPdfPages(pdfBytes, opts);
    await replaceOpenDocument(out);
    const n = opts.pages.length;
    return { ok: true, message: `Numbered ${n} page${n === 1 ? '' : 's'}.` };
  } catch (err) {
    return { ok: false, message: `Could not number the pages: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ── Document Properties ─────────────────────────────────────────────────────────────────────────────────────────

export async function executeUpdateProperties(p: EditableProperties): Promise<boolean> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return false;
  try {
    await replaceOpenDocument(await writeDocumentProperties(pdfBytes, p));
    showToast('Properties updated. Save the document to keep them.');
    return true;
  } catch (err) {
    showToast(`Could not update the properties: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── Reduce File Size ────────────────────────────────────────────────────────────────────────────────────────────

/** Reduce las imágenes del PDF abierto. Devuelve el informe; el documento solo cambia si el archivo queda más pequeño. */
export async function executeReduceSize(
  quality: import('../core/pdf/reduceSize').ReduceQuality,
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: boolean; message: string; report?: import('../core/pdf/reduceSize').ReduceReport }> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  try {
    const { reducePdfSize, browserImageCodec } = await import('../core/pdf/reduceSize');
    const { bytes, report } = await reducePdfSize(pdfBytes, quality, browserImageCodec, onProgress);
    if (report.after >= report.before) return { ok: false, message: 'The file could not be made smaller.', report };
    await replaceOpenDocument(bytes);
    return { ok: true, message: 'File size reduced. Save the document to keep it.', report };
  } catch (err) {
    return { ok: false, message: `Could not reduce the file: ${err instanceof Error ? err.message : String(err)}` };
  }
}
