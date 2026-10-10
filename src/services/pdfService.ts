import * as pdfjsLib from 'pdfjs-dist';
// Importamos el worker como URL mediante el modificador ?url de Vite.
// En DEV: Vite sirve el archivo directamente desde node_modules a través del servidor local.
// En BUILD (Tauri): Vite compila y emite un asset estático dedicado en dist/assets/
// resolviendo cualquier problema de CORS, CSP o rutas relativas en WebView2.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigured = false;

export function configurePdfWorker(): void {
  if (workerConfigured) return;

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerConfigured = true;
  } catch (err) {
    console.warn('[PDF.js] No se pudo asignar GlobalWorkerOptions.workerSrc:', err);
  }
}

// Configurar inmediatamente al importar el módulo
configurePdfWorker();

export interface RenderResult {
  width: number;
  height: number;
  viewport: pdfjsLib.PageViewport;
}

/**
 * Carga un documento PDF desde un array de bytes (Uint8Array) o URL.
 * Siempre clona los bytes (slice) para prevenir el desprendimiento (detached ArrayBuffer)
 * cuando el Worker transfiere la memoria.
 */
export async function loadPdfDocument(source: Uint8Array | string): Promise<pdfjsLib.PDFDocumentProxy> {
  configurePdfWorker();

  const loadingTask = pdfjsLib.getDocument(
    typeof source === 'string'
      ? { url: source }
      : { data: source.slice() }
  );

  return loadingTask.promise;
}

/**
 * Renderiza una página en un elemento HTMLCanvasElement con soporte HiDPI/Retina.
 */
export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  options: { scale?: number; rotation?: number } = {}
): Promise<RenderResult> {
  const pageNumber = pageIndex + 1; // PDF.js es 1-based
  const page = await pdfDoc.getPage(pageNumber);

  const scale = options.scale ?? 1.0;
  const rotation = options.rotation ?? 0;

  // Viewport en píxeles CSS
  const viewport = page.getViewport({ scale, rotation });

  // Soporte HiDPI (devicePixelRatio de la pantalla)
  const dpr = window.devicePixelRatio || 1;
  const outputScale = dpr;

  // Dimensiones del buffer del canvas
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);

  // Dimensiones de estilo CSS en la página
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('No se pudo obtener el contexto 2D del canvas');
  }

  ctx.save();
  ctx.scale(outputScale, outputScale);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  ctx.restore();

  return {
    width: viewport.width,
    height: viewport.height,
    viewport,
  };
}

/**
 * Renderiza una miniatura optimizada de una página para la barra lateral
 */
export async function renderThumbnail(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  targetWidth = 140
): Promise<{ width: number; height: number }> {
  const pageNumber = pageIndex + 1;
  const page = await pdfDoc.getPage(pageNumber);

  const baseViewport = page.getViewport({ scale: 1.0 });
  const thumbScale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale: thumbScale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('No se pudo obtener contexto 2D para miniatura');
  }

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  return {
    width: viewport.width,
    height: viewport.height,
  };
}
