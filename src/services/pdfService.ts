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

export interface RenderOptions {
  scale?: number;
  rotation?: number;
  textLayerContainer?: HTMLDivElement | null;
}

export interface RenderResult {
  width: number;
  height: number;
  viewport: pdfjsLib.PageViewport;
  hasText: boolean;
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
 * Renderiza una página en un elemento HTMLCanvasElement con soporte HiDPI/Retina
 * y opcionalmente monta la capa de texto seleccionable (TextLayer de PDF.js 4.x).
 */
export async function renderPageToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  options: RenderOptions = {}
): Promise<RenderResult> {
  const pageNumber = pageIndex + 1; // PDF.js es 1-based
  const page = await pdfDoc.getPage(pageNumber);

  const scale = options.scale ?? 1.0;
  const storeRotation = options.rotation ?? 0;
  // Componer ambas fuentes de rotación: intrínseca del PDF (/Rotate) + rotación del store
  const totalRotation = (((page.rotate + storeRotation) % 360) + 360) % 360;

  // Viewport en píxeles CSS con rotación compuesta como única fuente de verdad
  const viewport = page.getViewport({ scale, rotation: totalRotation });

  // Soporte HiDPI (devicePixelRatio de la pantalla)
  const dpr = window.devicePixelRatio || 1;
  const outputScale = dpr;
  const bufferWidth = Math.floor(viewport.width * outputScale);
  const bufferHeight = Math.floor(viewport.height * outputScale);

  // Doble buffer con canvas offscreen: elimina ventana en blanco y parpadeo al cambiar página/zoom
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = bufferWidth;
  offscreenCanvas.height = bufferHeight;

  const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });
  if (!offscreenCtx) {
    throw new Error('No se pudo obtener el contexto 2D del canvas offscreen');
  }

  const activeTask = (canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask;
  if (activeTask) {
    try {
      activeTask.cancel();
    } catch {
      // Ignorar cancelación previa
    }
  }

  offscreenCtx.save();
  offscreenCtx.scale(outputScale, outputScale);

  const renderContext = {
    canvasContext: offscreenCtx,
    viewport: viewport,
  };

  const renderTask = page.render(renderContext);
  (canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask = renderTask;

  try {
    await renderTask.promise;

    // Volcar atómicamente al canvas visible al terminar el render
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const visibleCtx = canvas.getContext('2d', { alpha: false });
    if (visibleCtx) {
      visibleCtx.drawImage(offscreenCanvas, 0, 0);
    }

    // Renderizado o comprobación de la capa de texto (TextLayer de PDF.js 4.x)
    let hasText = false;
    const textContent = await page.getTextContent();
    hasText = textContent.items.some(
      (item) => 'str' in item && (item as { str: string }).str.trim().length > 0
    );

    const textContainer = options.textLayerContainer;
    if (textContainer) {
      textContainer.innerHTML = '';
      textContainer.style.width = `${Math.floor(viewport.width)}px`;
      textContainer.style.height = `${Math.floor(viewport.height)}px`;
      textContainer.style.setProperty('--scale-factor', `${scale}`);

      if (hasText) {
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        });
        await textLayer.render();
      }
    }

    return {
      width: viewport.width,
      height: viewport.height,
      viewport,
      hasText,
    };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'RenderingCancelledException'
    ) {
      return {
        width: viewport.width,
        height: viewport.height,
        viewport,
        hasText: false,
      };
    }
    throw err;
  } finally {
    if ((canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask === renderTask) {
      delete (canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask;
    }
    offscreenCtx.restore();
  }
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

  const activeTask = (canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask;
  if (activeTask) {
    try {
      activeTask.cancel();
    } catch {
      // Ignorar cancelación previa
    }
  }

  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
  });
  (canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask = renderTask;

  try {
    await renderTask.promise;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'RenderingCancelledException'
    ) {
      return {
        width: viewport.width,
        height: viewport.height,
      };
    }
    throw err;
  } finally {
    if ((canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask === renderTask) {
      delete (canvas as unknown as { _currentRenderTask?: pdfjsLib.RenderTask })._currentRenderTask;
    }
  }

  return {
    width: viewport.width,
    height: viewport.height,
  };
}
