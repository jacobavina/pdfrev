import { PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { drawBlackBoxes, RedactRect, redactPageContent } from '../core/pdf/contentRedaction';
import { displayedToUser } from '../core/pdf/ocrLayer';
import { isRedaction, redactionsFromMatches } from '../core/markup/redaction';
import type { SearchMatch } from '../core/search/textSearch';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import type { Markup, MarkupPoint } from '../types/markup';

export { isRedaction, redactionMarkup, redactionsFromMatches, REDACTION_SUBJECT } from '../core/markup/redaction';
import { rasterizePage, rasterToPng } from './pageRaster';
import { showToast } from './toastService';

/**
 * Redacción permanente (ADR-0103): las marcas de redacción señalan lo que se quiere borrar y "Apply Redactions" lo quita
 * del PDF para siempre: reescribe el contenido de cada página (texto y trazados) y, si la página tiene imágenes u otros
 * objetos que no se pueden editar con precisión, la sustituye por una imagen con las cajas en negro.
 */

/** Resolución de la página rasterizada cuando no se puede editar el contenido (puntos por pulgada). */
const RASTER_DPI = 200;
const RASTER_MAX_SIDE_PX = 9000;

/** Rectángulo normalizado de la imagen mostrada → caja en el espacio de usuario de la página (sin girar). */
export function toUserRect(
  a: MarkupPoint,
  b: MarkupPoint,
  rotation: number,
  box: { x: number; y: number; width: number; height: number }
): RedactRect {
  const corners = [
    displayedToUser(a.x, a.y, rotation, box.width, box.height),
    displayedToUser(b.x, a.y, rotation, box.width, box.height),
    displayedToUser(b.x, b.y, rotation, box.width, box.height),
    displayedToUser(a.x, b.y, rotation, box.width, box.height),
  ];
  const us = corners.map((c) => c.u + box.x);
  const vs = corners.map((c) => c.v + box.y);
  return { x0: Math.min(...us), y0: Math.min(...vs), x1: Math.max(...us), y1: Math.max(...vs) };
}

export interface PageRedactionReport {
  pageIndex: number;
  removedGlyphs: number;
  removedPaths: number;
  /** La página se sustituyó por una imagen: motivo. */
  rasterized?: string;
  estimatedFonts: string[];
}

export interface RedactionReport {
  pages: PageRedactionReport[];
  removedGlyphs: number;
  removedPaths: number;
}

type RasterizeFn = (bytes: Uint8Array, pageIndex: number, boxesNorm: { a: MarkupPoint; b: MarkupPoint }[]) => Promise<Uint8Array>;

/**
 * Sustituye una página por su imagen con las cajas en negro. La imagen es lo único que queda en ella: el texto, los
 * trazados y las imágenes originales dejan de estar en el archivo. Las anotaciones de la página se conservan.
 */
export const rasterRedactPage: RasterizeFn = async (bytes, pageIndex, boxesNorm) => {
  const probe = await PDFDocument.load(bytes);
  const page = probe.getPage(pageIndex);
  const box = page.getMediaBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const dispW = rotation % 180 === 0 ? box.width : box.height;
  const dispH = rotation % 180 === 0 ? box.height : box.width;
  const width = Math.min(Math.round((dispW * RASTER_DPI) / 72), Math.floor((RASTER_MAX_SIDE_PX * dispW) / dispH));
  const { raster } = await rasterizePage(bytes, pageIndex, undefined, width, RASTER_MAX_SIDE_PX);
  // Cajas negras sobre los píxeles
  const data = raster.data;
  for (const { a, b } of boxesNorm) {
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) * raster.width));
    const x1 = Math.min(raster.width, Math.ceil(Math.max(a.x, b.x) * raster.width));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) * raster.height));
    const y1 = Math.min(raster.height, Math.ceil(Math.max(a.y, b.y) * raster.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * raster.width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  }
  const png = await rasterToPng(raster);
  const doc = await PDFDocument.load(bytes);
  const target = doc.getPage(pageIndex);
  const image = await doc.embedPng(png);
  // Con la página girada el resultado se escribe ya girado: MediaBox con la forma mostrada y /Rotate 0
  let x = box.x;
  let y = box.y;
  if (rotation !== 0) {
    target.node.set(PDFName.of('MediaBox'), doc.context.obj([0, 0, dispW, dispH]));
    target.node.delete(PDFName.of('CropBox'));
    target.node.set(PDFName.of('Rotate'), PDFNumber.of(0));
    x = 0;
    y = 0;
  }
  const key = 'REARedacted';
  const resources = doc.context.obj({ XObject: { [key]: image.ref } }) as PDFDict;
  target.node.set(PDFName.of('Resources'), resources);
  const content = `q\n${dispW.toFixed(3)} 0 0 ${dispH.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/${key} Do\nQ\n`;
  target.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(Uint8Array.from(content, (c) => c.charCodeAt(0)))));
  return doc.save();
};

/**
 * Aplica las marcas de redacción a un PDF y devuelve el PDF nuevo y lo que se quitó. Las marcas se agrupan por página.
 */
export async function applyRedactionsToPdf(
  bytes: Uint8Array,
  marks: Markup[],
  rasterize: RasterizeFn = rasterRedactPage
): Promise<{ pdfBytes: Uint8Array; report: RedactionReport }> {
  let current = bytes;
  const report: RedactionReport = { pages: [], removedGlyphs: 0, removedPaths: 0 };
  const byPage = new Map<number, Markup[]>();
  for (const m of marks) byPage.set(m.pageIndex, [...(byPage.get(m.pageIndex) ?? []), m]);

  for (const [pageIndex, pageMarks] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const doc = await PDFDocument.load(current);
    const page = doc.getPage(pageIndex);
    const box = page.getMediaBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const rects = pageMarks.map((m) => toUserRect(m.points[0], m.points[m.points.length - 1], rotation, box));
    const edit = await redactPageContent(current, pageIndex, rects);
    const entry: PageRedactionReport = { pageIndex, removedGlyphs: edit.removedGlyphs, removedPaths: edit.removedPaths, estimatedFonts: edit.estimatedFonts };
    if (edit.rasterReasons.length > 0) {
      current = await rasterize(current, pageIndex, pageMarks.map((m) => ({ a: m.points[0], b: m.points[m.points.length - 1] })));
      entry.rasterized = edit.rasterReasons[0];
    } else {
      current = await drawBlackBoxes(edit.pdfBytes, pageIndex, rects);
      report.removedGlyphs += edit.removedGlyphs;
      report.removedPaths += edit.removedPaths;
    }
    report.pages.push(entry);
  }
  return { pdfBytes: current, report };
}

/** Resumen para el aviso al usuario. */
export function describeReport(r: RedactionReport): string {
  const raster = r.pages.filter((p) => p.rasterized);
  const parts = [`Redaction applied to ${r.pages.length} page${r.pages.length === 1 ? '' : 's'}: ${r.removedGlyphs} character${r.removedGlyphs === 1 ? '' : 's'} and ${r.removedPaths} shape${r.removedPaths === 1 ? '' : 's'} removed.`];
  if (raster.length > 0) {
    parts.push(`Page${raster.length === 1 ? '' : 's'} ${raster.map((p) => p.pageIndex + 1).join(', ')} became an image because ${raster[0].rasterized}.`);
  }
  const estimated = [...new Set(r.pages.flatMap((p) => p.estimatedFonts))];
  if (estimated.length > 0) parts.push(`The size of the text in ${estimated.join(', ')} was estimated.`);
  return parts.join(' ');
}

async function confirm(message: string): Promise<boolean> {
  try {
    const { isTauriEnvironment } = await import('./bbxPersistenceService');
    if (isTauriEnvironment()) {
      const { ask } = await import('@tauri-apps/plugin-dialog');
      return await ask(message, { title: 'Apply Redactions', kind: 'warning', okLabel: 'Apply', cancelLabel: 'Cancel' });
    }
  } catch {
    // Sin diálogo nativo: se pregunta con el del navegador
  }
  return window.confirm(message);
}

/** Aplica todas las redacciones del documento abierto y quita sus marcas. No se puede deshacer. */
export async function applyRedactions(): Promise<void> {
  const doc = useDocumentStore.getState();
  const marks = useMarkupStore.getState().markups.filter(isRedaction);
  if (!doc.pdfBytes) {
    showToast('Open a document to apply redactions.');
    return;
  }
  if (marks.length === 0) {
    showToast('There are no redaction marks. Draw them with the Redact tool or mark search results first.');
    return;
  }
  const pages = new Set(marks.map((m) => m.pageIndex)).size;
  const ok = await confirm(
    `Permanently remove the content under ${marks.length} redaction${marks.length === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'}?\n\nThis cannot be undone. Save a copy first if you need the original.`
  );
  if (!ok) return;
  try {
    const { pdfBytes, report } = await applyRedactionsToPdf(doc.pdfBytes, marks);
    const { loadPdfDocument } = await import('./pdfService');
    const loaded = await loadPdfDocument(pdfBytes);
    const keep = { page: doc.currentPageIndex, scale: doc.scale };
    const ids = new Set(marks.map((m) => m.id));
    useMarkupStore.getState().setMarkups(useMarkupStore.getState().markups.filter((m) => !ids.has(m.id)));
    useDocumentStore.getState().setDocument(doc.filePath, doc.fileName || 'document.pdf', pdfBytes, loaded.numPages, loaded);
    useDocumentStore.getState().setCurrentPage(keep.page);
    useDocumentStore.getState().setScale(keep.scale);
    showToast(describeReport(report));
  } catch (err) {
    showToast(`Could not apply the redactions: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Search & Redact: una marca de redacción por cada resultado de la búsqueda actual. */
export function markSearchResultsForRedaction(matches: SearchMatch[]): number {
  if (matches.length === 0) {
    showToast('Search for the text to redact first (Ctrl+F).');
    return 0;
  }
  const { author, activeLayer } = useToolStore.getState();
  const marks = redactionsFromMatches(matches, author || 'Reviewer', activeLayer);
  useMarkupStore.getState().addMarkups(marks, 'Mark search results for redaction');
  showToast(`${marks.length} redaction mark${marks.length === 1 ? '' : 's'} added. Review them and choose Document ▸ Redaction ▸ Apply Redactions.`);
  return marks.length;
}
