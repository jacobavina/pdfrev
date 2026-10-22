import { Markup } from '../types/markup';
import type { ReportThumbnail } from './exportService';
import { rasterizePage } from './pageRaster';

/**
 * Miniaturas de las hojas con marcas para el informe en PDF (ADR-0096). Ancho de 480 px (3 veces el del informe,
 * para que se vea nítido al ampliar) y como mucho 12 hojas, para acotar el tiempo y el tamaño del informe.
 */
export const REPORT_THUMBNAIL_WIDTH_PX = 480;
export const REPORT_THUMBNAIL_MAX_PAGES = 12;

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) throw new Error('Could not encode the thumbnail.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Páginas (base 0) que tienen marcas, en orden y acotadas. */
export function pagesWithMarkups(markups: Pick<Markup, 'pageIndex'>[]): number[] {
  return [...new Set(markups.map((m) => m.pageIndex ?? 0))].sort((a, b) => a - b).slice(0, REPORT_THUMBNAIL_MAX_PAGES);
}

/** Rasteriza las hojas con marcas. Si algo falla devuelve las que pudo: el informe sale igual, sin miniaturas. */
export async function buildReportThumbnails(pdfBytes: Uint8Array, markups: Markup[]): Promise<ReportThumbnail[]> {
  const out: ReportThumbnail[] = [];
  for (const pageIndex of pagesWithMarkups(markups)) {
    try {
      const { raster } = await rasterizePage(pdfBytes, pageIndex, undefined, REPORT_THUMBNAIL_WIDTH_PX);
      const canvas = document.createElement('canvas');
      canvas.width = raster.width;
      canvas.height = raster.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
      out.push({ pageIndex, png: await canvasToPng(canvas), width: raster.width, height: raster.height });
    } catch (err) {
      console.warn(`[Report] Sin miniatura de la página ${pageIndex + 1}:`, err);
    }
  }
  return out;
}
