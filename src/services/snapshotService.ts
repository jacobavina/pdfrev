import { v4 as uuidv4 } from 'uuid';
import { Markup } from '../types/markup';
import { useMarkupStore, registerPasteFallback } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import { showToast } from './toastService';

export interface SnapshotData {
  dataUrl: string;
  blob?: Blob;
  width: number;
  height: number;
  normWidth: number;
  normHeight: number;
  sourcePageIndex: number;
}

let snapshotCache: SnapshotData | null = null;

export function getSnapshotCache(): SnapshotData | null {
  return snapshotCache;
}

export function setSnapshotCache(snapshot: SnapshotData | null): void {
  snapshotCache = snapshot;
}

export function hasSnapshotInCache(): boolean {
  return snapshotCache !== null;
}

export function clearSnapshotCache(): void {
  snapshotCache = null;
}

/**
 * Convierte un DataURL a un objeto Blob de manera síncrona y segura.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1]?.split(';')[0] || 'image/png';
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  } catch {
    return null;
  }
}

/**
 * Crea una marca de tipo 'image' que contiene el bitmap o snapshot capturado (ADR-0085).
 */
export function createImageMarkup(params: {
  dataUrl: string;
  pageIndex: number;
  bounds: { x: number; y: number; width: number; height: number };
  originalWidth?: number;
  originalHeight?: number;
}): Markup {
  const now = new Date().toISOString();
  const x1 = Math.round(params.bounds.x * 1000000) / 1000000;
  const y1 = Math.round(params.bounds.y * 1000000) / 1000000;
  const x2 = Math.round((params.bounds.x + params.bounds.width) * 1000000) / 1000000;
  const y2 = Math.round((params.bounds.y + params.bounds.height) * 1000000) / 1000000;

  return {
    id: uuidv4(),
    type: 'image',
    pageIndex: params.pageIndex,
    points: [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ],
    style: {
      strokeColor: 'transparent',
      fillColor: 'transparent',
      strokeWidth: 0,
      opacity: 1,
    },
    author: 'Usuario',
    status: 'pending',
    customFields: {
      imageSrc: params.dataUrl,
      ...(params.originalWidth !== undefined ? { originalWidth: params.originalWidth } : {}),
      ...(params.originalHeight !== undefined ? { originalHeight: params.originalHeight } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Corta la región especificada del canvas a resolución nativa y devuelve su dataUrl y blob.
 */
export function captureCanvasSlice(
  canvas: HTMLCanvasElement,
  normRect: { x: number; y: number; width: number; height: number }
): {
  blob: Promise<Blob | null>;
  dataUrl: string;
  width: number;
  height: number;
} {
  // Hoja grande renderizada por región (ADR-0090): el canvas solo cubre parte de la hoja, así que el rectángulo
  // normalizado de la hoja se pasa a coordenadas del canvas
  const page = canvas.parentElement;
  const regional = canvas.dataset.region === 'true' && page && canvas.offsetWidth > 0 && canvas.offsetHeight > 0;
  const kx = regional ? canvas.width / canvas.offsetWidth : 0;
  const ky = regional ? canvas.height / canvas.offsetHeight : 0;
  const ax = regional ? (normRect.x * page!.offsetWidth - canvas.offsetLeft) * kx : normRect.x * canvas.width;
  const ay = regional ? (normRect.y * page!.offsetHeight - canvas.offsetTop) * ky : normRect.y * canvas.height;
  const aw = regional ? normRect.width * page!.offsetWidth * kx : normRect.width * canvas.width;
  const ah = regional ? normRect.height * page!.offsetHeight * ky : normRect.height * canvas.height;
  const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(ax)));
  const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(ay)));
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.round(aw)));
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.round(ah)));

  const offscreen = document.createElement('canvas');
  offscreen.width = sw;
  offscreen.height = sh;

  const ctx = offscreen.getContext('2d');
  if (ctx) {
    try {
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    } catch {
      // Ignorar error si el canvas no se puede leer (cross-origin u otros)
    }
  }

  let dataUrl = '';
  try {
    const raw = offscreen.toDataURL('image/png');
    dataUrl =
      raw && typeof raw === 'string' && raw.startsWith('data:')
        ? raw
        : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  } catch {
    // Fallback para entornos de test jsdom o sin backend nativo de canvas
    dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }

  const blob = dataUrlToBlob(dataUrl);

  return {
    blob: Promise.resolve(blob),
    dataUrl,
    width: sw,
    height: sh,
  };
}

/**
 * Escribe un Blob PNG al portapapeles del sistema operativo de forma asíncrona.
 */
export async function writeImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
    return false;
  }

  try {
    const ClipboardItemCtor =
      typeof ClipboardItem !== 'undefined'
        ? ClipboardItem
        : (globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!ClipboardItemCtor) return false;
    const item = new ClipboardItemCtor({ 'image/png': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ejecuta la captura de instantánea en el canvas activo de la página.
 */
export async function executeSnapshot(
  normRect: { x: number; y: number; width: number; height: number },
  pageIndex: number,
  targetCanvas?: HTMLCanvasElement | null
): Promise<boolean> {
  const canvas =
    targetCanvas ||
    (document.getElementById('pdf-render-canvas') as HTMLCanvasElement | null) ||
    (document.querySelector('canvas[data-testid="pdf-canvas"]') as HTMLCanvasElement | null);

  if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
    showToast('Could not capture snapshot: rendered canvas not found.');
    useToolStore.getState().setActiveTool('select');
    return false;
  }

  const slice = captureCanvasSlice(canvas, normRect);
  const blob = await slice.blob;

  setSnapshotCache({
    dataUrl: slice.dataUrl,
    blob: blob || undefined,
    width: slice.width,
    height: slice.height,
    normWidth: normRect.width,
    normHeight: normRect.height,
    sourcePageIndex: pageIndex,
  });

  // Limpiar portapapeles de marcas para que prime la instantánea en Ctrl+V
  useMarkupStore.getState().setClipboardMarkups([]);

  // Copiar al portapapeles del SO si hay blob disponible
  if (blob) {
    void writeImageToClipboard(blob);
  }

  // Notificación y retorno a herramienta Select (flujo Revu 21)
  showToast('Snapshot copied to clipboard. Press Ctrl+V to paste.');
  useToolStore.getState().setActiveTool('select');

  return true;
}

/**
 * Pega la última instantánea disponible en la página indicada.
 */
export function pasteSnapshotImage(
  targetPageIndex?: number,
  centerPoint?: { x: number; y: number }
): Markup | null {
  if (!snapshotCache) return null;

  const page = targetPageIndex ?? snapshotCache.sourcePageIndex ?? 0;

  const w = snapshotCache.normWidth > 0 ? Math.min(0.9, snapshotCache.normWidth) : 0.25;
  const h = snapshotCache.normHeight > 0 ? Math.min(0.9, snapshotCache.normHeight) : 0.25;

  let x: number;
  let y: number;

  if (centerPoint) {
    x = Math.max(0.01, Math.min(0.99 - w, centerPoint.x - w / 2));
    y = Math.max(0.01, Math.min(0.99 - h, centerPoint.y - h / 2));
  } else {
    x = 0.05;
    y = 0.05;
  }

  const markup = createImageMarkup({
    dataUrl: snapshotCache.dataUrl,
    pageIndex: page,
    bounds: { x, y, width: w, height: h },
    originalWidth: snapshotCache.width,
    originalHeight: snapshotCache.height,
  });

  useMarkupStore.getState().addMarkups([markup], 'Paste Snapshot Image');
  useMarkupStore.getState().setSelectedMarkupIds([markup.id]);

  return markup;
}

// Registrar fallback para que pasteMarkups() de useMarkupStore pegue la instantánea si el portapapeles está vacío (ADR-0085)
registerPasteFallback((targetPageIndex) => {
  const page = targetPageIndex ?? snapshotCache?.sourcePageIndex ?? 0;
  pasteSnapshotImage(page);
});
