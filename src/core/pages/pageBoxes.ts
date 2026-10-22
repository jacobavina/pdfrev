import type { Markup, MarkupPoint, MeasurementViewport } from '../../types/markup';
import { markupBounds } from '../markup/transformHandles';
import { normalizedToPdfCoordinates, pdfToNormalizedCoordinates, type PageTransformInfo } from '../pdf/operators';

/**
 * Recorte de páginas (Crop Pages, ADR-0113). El recorte se calcula sobre lo que se VE: un rectángulo normalizado
 * [u1,u2]×[v1,v2] de la página mostrada (con su rotación), que sirve igual para el CropBox del PDF y para remapear las
 * marcas, cuyas coordenadas son normalizadas de la página mostrada. Puro salvo `cropPdfPages`.
 */

export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewRect {
  u1: number;
  v1: number;
  u2: number;
  v2: number;
}

export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Lado mínimo que puede quedar tras recortar: un cuarto de pulgada. */
export const MIN_CROPPED_SIDE_PT = 18;

/** Tamaño de la página tal y como se ve (con rotación de 90 o 270 se intercambian ancho y alto). */
export function viewSize(t: PageTransformInfo): { width: number; height: number } {
  return t.rotation === 90 || t.rotation === 270 ? { width: t.heightPt, height: t.widthPt } : { width: t.widthPt, height: t.heightPt };
}

/** Rectángulo visible que deja un margen por cada lado (en puntos), o null si la página quedaría demasiado pequeña. */
export function marginsToViewRect(size: { width: number; height: number }, m: CropMargins): ViewRect | null {
  const w = size.width - m.left - m.right;
  const h = size.height - m.top - m.bottom;
  if (w < MIN_CROPPED_SIDE_PT || h < MIN_CROPPED_SIDE_PT) return null;
  return { u1: m.left / size.width, v1: m.top / size.height, u2: (size.width - m.right) / size.width, v2: (size.height - m.bottom) / size.height };
}

/** Caja del PDF (espacio nativo, sin rotar) que corresponde al rectángulo visible. */
export function viewRectToPdfBox(r: ViewRect, t: PageTransformInfo): PdfBox {
  const a = normalizedToPdfCoordinates({ x: r.u1, y: r.v1 }, t);
  const b = normalizedToPdfCoordinates({ x: r.u2, y: r.v2 }, t);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Rectángulo visible (respecto de la página mostrada ahora) que ocupa una caja del PDF; puede salirse de 0..1. */
export function pdfBoxToViewRect(box: PdfBox, t: PageTransformInfo): ViewRect {
  const a = pdfToNormalizedCoordinates({ x: box.x, y: box.y }, t);
  const b = pdfToNormalizedCoordinates({ x: box.x + box.width, y: box.y + box.height }, t);
  return { u1: Math.min(a.x, b.x), v1: Math.min(a.y, b.y), u2: Math.max(a.x, b.x), v2: Math.max(a.y, b.y) };
}

/** Un punto de la página actual en las coordenadas de la página recortada. */
export function remapPoint(p: MarkupPoint, r: ViewRect): MarkupPoint {
  return { x: (p.x - r.u1) / (r.u2 - r.u1), y: (p.y - r.v1) / (r.v2 - r.v1) };
}

const EPS = 1e-6;

/** Ids de las marcas de la página que no caben entera en el nuevo rectángulo. */
export function markupsOutsideRect(markups: Markup[], pageIndex: number, r: ViewRect): string[] {
  const out: string[] = [];
  for (const m of markups) {
    if (m.pageIndex !== pageIndex) continue;
    const b = markupBounds(m);
    if (!b) continue;
    if (b.minX < r.u1 - EPS || b.maxX > r.u2 + EPS || b.minY < r.v1 - EPS || b.maxY > r.v2 + EPS) out.push(m.id);
  }
  return out;
}

/** Las marcas de la página con sus coordenadas pasadas a la página recortada (puntos, directrices y recortes). */
export function remapMarkupsToRect(markups: Markup[], pageIndex: number, r: ViewRect): Markup[] {
  return markups.map((m) => {
    if (m.pageIndex !== pageIndex) return m;
    const f = (p: MarkupPoint) => remapPoint(p, r);
    return {
      ...m,
      points: m.points.map(f),
      ...(m.leaders ? { leaders: m.leaders.map((l) => l.map(f)) } : {}),
      ...(m.cutouts ? { cutouts: m.cutouts.map((c) => c.map(f)) } : {}),
    };
  });
}

/** Los viewports de medición de la página con sus límites pasados a la página recortada. */
export function remapViewportsToRect(viewports: MeasurementViewport[], r: ViewRect): MeasurementViewport[] {
  const w = r.u2 - r.u1;
  const h = r.v2 - r.v1;
  return viewports.map((vp) => ({
    ...vp,
    bounds: { x: (vp.bounds.x - r.u1) / w, y: (vp.bounds.y - r.v1) / h, width: vp.bounds.width / w, height: vp.bounds.height / h },
  }));
}

// ── PDF ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PageGeometry {
  index: number;
  transform: PageTransformInfo;
  mediaBox: PdfBox;
}

function transformOf(page: import('pdf-lib').PDFPage): PageTransformInfo {
  const rot = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const box = page.getCropBox();
  return { rotation: rot, widthPt: box.width, heightPt: box.height, originX: box.x, originY: box.y };
}

/** Geometría (caja visible y rotación) de cada página del PDF. */
export async function readPageGeometry(pdfBytes: Uint8Array): Promise<PageGeometry[]> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  return doc.getPages().map((page, index) => {
    const mb = page.getMediaBox();
    return { index, transform: transformOf(page), mediaBox: { x: mb.x, y: mb.y, width: mb.width, height: mb.height } };
  });
}

export interface CropPlanItem {
  pageIndex: number;
  rect: ViewRect;
}

/** Fija el CropBox de las páginas del plan al rectángulo visible indicado. */
export async function cropPdfPages(pdfBytes: Uint8Array, plan: CropPlanItem[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  for (const item of plan) {
    const page = doc.getPage(item.pageIndex);
    const box = viewRectToPdfBox(item.rect, transformOf(page));
    page.setCropBox(box.x, box.y, box.width, box.height);
  }
  return doc.save();
}
