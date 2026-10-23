import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { NO_LAYER, useUiStore } from '../store/useUiStore';
import { buildPrintCss, printPixels, type PrintDpi, type PrintScale } from '../core/print/printLayout';

/**
 * Imprimir (Print, ADR-0115): rasteriza las páginas elegidas (con las marcas aplanadas encima, o sin ellas), las pone en
 * un contenedor que solo se ve al imprimir y abre el diálogo de impresión del sistema con `window.print()`.
 */

export interface PrintRequest {
  /** Páginas a imprimir (0-based), en orden. */
  pages: number[];
  withMarkups: boolean;
  dpi: PrintDpi;
  scale: PrintScale;
  grayscale: boolean;
  onProgress?: (done: number, total: number) => void;
}

const ROOT_ID = 'rea-print-root';
const STYLE_ID = 'rea-print-style';
/** Si el navegador no avisa de que terminó la impresión, el contenedor se retira pasado este tiempo. */
const CLEANUP_FALLBACK_MS = 10 * 60 * 1000;

let activeCleanup: (() => void) | null = null;

/** Quita el contenedor de impresión y libera las imágenes. Seguro de llamar varias veces. */
export function cleanupPrint(): void {
  activeCleanup?.();
  activeCleanup = null;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode a page image.'))), 'image/png'));
}

export async function printDocument(req: PrintRequest): Promise<{ ok: boolean; message: string }> {
  const { pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) return { ok: false, message: 'No document open.' };
  if (req.pages.length === 0) return { ok: false, message: 'Choose the pages to print.' };
  cleanupPrint();
  const urls: string[] = [];
  try {
    let bytes = pdfBytes;
    if (req.withMarkups) {
      const hidden = useUiStore.getState().hiddenLayers;
      const markups = useMarkupStore.getState().markups.filter((m) => !hidden.includes(m.layer ?? NO_LAYER));
      if (markups.length > 0) {
        const { exportMarkupsToPdf } = await import('./pdfExportService');
        bytes = (await exportMarkupsToPdf(pdfBytes, markups)).pdfBytes;
      }
    }
    const { loadPdfDocument } = await import('./pdfService');
    const doc = await loadPdfDocument(bytes);
    const sizes: { widthPt: number; heightPt: number }[] = [];
    try {
      for (let k = 0; k < req.pages.length; k++) {
        req.onProgress?.(k, req.pages.length);
        const page = await doc.getPage(req.pages[k] + 1);
        const natural = page.getViewport({ scale: 1 });
        const size = { widthPt: natural.width, heightPt: natural.height };
        const px = printPixels(size, req.dpi);
        const viewport = page.getViewport({ scale: px.width / natural.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Could not create a canvas to prepare the page.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        urls.push(URL.createObjectURL(await canvasToBlob(canvas)));
        // Se libera el lienzo grande en cuanto la imagen está codificada
        canvas.width = 0;
        canvas.height = 0;
        sizes.push(size);
      }
      req.onProgress?.(req.pages.length, req.pages.length);
    } finally {
      await doc.destroy();
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildPrintCss(sizes, req.scale, req.grayscale);
    const root = document.createElement('div');
    root.id = ROOT_ID;
    const images: HTMLImageElement[] = [];
    urls.forEach((url, i) => {
      const section = document.createElement('section');
      section.className = `rea-print-page rea-print-p${i}`;
      section.dataset.page = String(req.pages[i] + 1);
      const img = new Image();
      img.alt = `Page ${req.pages[i] + 1}`;
      img.src = url;
      images.push(img);
      section.appendChild(img);
      root.appendChild(section);
    });
    document.head.appendChild(style);
    document.body.appendChild(root);
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)));

    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('afterprint', cleanup);
      root.remove();
      style.remove();
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;
    window.addEventListener('afterprint', cleanup);
    timer = setTimeout(cleanup, CLEANUP_FALLBACK_MS);
    window.print();
    const n = req.pages.length;
    return { ok: true, message: `${n} page${n === 1 ? '' : 's'} sent to the print dialog.` };
  } catch (err) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    cleanupPrint();
    return { ok: false, message: `Could not prepare the print job: ${err instanceof Error ? err.message : String(err)}` };
  }
}
