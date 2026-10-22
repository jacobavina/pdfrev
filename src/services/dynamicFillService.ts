import { v4 as uuidv4 } from 'uuid';
import { detectEnclosure, DynamicFillResult } from '../core/measurements/dynamicFill';
import { calculateArea } from '../core/measurements/calculate';
import { translucentFill } from '../core/markup/typeLabels';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { Markup, MarkupPoint, MarkupStyle } from '../types/markup';
import { rasterizePage, Raster } from './pageRaster';
import { showToast } from './toastService';

/**
 * Relleno dinámico de áreas (ADR-0095): un clic dentro de un recinto crea la medición de área de su contorno.
 */

const MESSAGES: Record<Extract<DynamicFillResult, { ok: false }>['reason'], string> = {
  'on-line': 'Click inside an enclosed area, not on a line.',
  open: 'The area is not closed. Increase the gap tolerance or close the outline.',
  empty: 'No area found at that point.',
};

// Una rasterización por página y documento: los clics sucesivos en la misma hoja no la repiten
const cache = new WeakMap<Uint8Array, Map<number, Raster>>();

async function pageRaster(pdfBytes: Uint8Array, pageIndex: number): Promise<Raster> {
  let pages = cache.get(pdfBytes);
  if (!pages) {
    pages = new Map();
    cache.set(pdfBytes, pages);
  }
  const hit = pages.get(pageIndex);
  if (hit) return hit;
  const { raster } = await rasterizePage(pdfBytes, pageIndex);
  pages.set(pageIndex, raster);
  return raster;
}

export interface DynamicFillRequest {
  pdfBytes: Uint8Array;
  pageIndex: number;
  /** Punto del clic, normalizado a la hoja. */
  seed: MarkupPoint;
  pageDimsPt: { width: number; height: number };
  style: MarkupStyle;
  author: string;
  layer?: string;
  /** Píxeles de la rasterización que se cierran entre líneas. */
  gap: number;
}

/** Construye la marca de área de un polígono ya detectado. */
export function areaMarkupFromPolygon(points: MarkupPoint[], req: Omit<DynamicFillRequest, 'pdfBytes' | 'seed' | 'gap'>): Markup {
  const calib = useCalibrationStore.getState().getEffectiveCalibration(req.pageIndex, points);
  const measurement = calculateArea(points, req.pageDimsPt, calib, false);
  const style = { ...req.style };
  if (!style.fillColor || style.fillColor === 'transparent') style.fillColor = translucentFill(style.strokeColor);
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    type: 'area',
    pageIndex: req.pageIndex,
    points,
    style,
    text: measurement.formatted,
    author: req.author,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    layer: req.layer,
    measurement,
  };
}

/** Detecta el recinto bajo el clic y devuelve su medición de área, o avisa si no se pudo. */
export async function dynamicFillArea(req: DynamicFillRequest): Promise<Markup | null> {
  try {
    const raster = await pageRaster(req.pdfBytes, req.pageIndex);
    const result = detectEnclosure(
      raster.data,
      raster.width,
      raster.height,
      { x: req.seed.x * raster.width, y: req.seed.y * raster.height },
      { gap: req.gap }
    );
    if (!result.ok) {
      showToast(MESSAGES[result.reason]);
      return null;
    }
    return areaMarkupFromPolygon(result.points, req);
  } catch (err) {
    showToast(`Dynamic Fill failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
