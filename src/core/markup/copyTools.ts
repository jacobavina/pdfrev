import { v4 as uuidv4 } from 'uuid';
import type { Markup, MarkupPoint, PageCalibration } from '../../types/markup';
import { remeasureMarkup, SCALED_MEASURE_TYPES } from '../measurements/remeasure';
import type { PageDimensionsPt } from '../measurements/calculate';
import { markupBounds } from './transformHandles';

/**
 * Offset y Multiply (ADR-0107): copias de las marcas elegidas. Puro; el diálogo y los atajos viven en la interfaz.
 * Las distancias se dan en las unidades de la escala de la página y aquí se pasan a puntos PDF.
 */

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export const MULTIPLY_MAX_COPIES = 400;

export interface MultiplyOptions {
  rows: number;
  columns: number;
  /** Espacio libre entre una copia y la siguiente (de borde a borde), en unidades de la escala. */
  gapX: number;
  gapY: number;
}

export interface CopyResult {
  created: Markup[];
  /** Copias que no se hicieron porque caerían fuera de la hoja, o marcas que Offset no sabe desplazar. */
  skipped: number;
  reason?: string;
}

function cloneMarkup(m: Markup, groupMap: Map<string, string>, shift: (p: MarkupPoint) => MarkupPoint, now: string): Markup {
  const groupId = m.groupId ? groupMap.get(m.groupId) : undefined;
  return {
    ...m,
    id: uuidv4(),
    groupId,
    points: m.points.map(shift),
    leaders: m.leaders ? m.leaders.map((l) => l.map(shift)) : undefined,
    cutouts: m.cutouts ? m.cutouts.map((c) => c.map(shift)) : undefined,
    style: { ...m.style },
    textFormat: m.textFormat ? { ...m.textFormat } : undefined,
    customFields: m.customFields ? { ...m.customFields } : undefined,
    createdAt: now,
    updatedAt: now,
    locked: undefined,
  };
}

/**
 * Multiply: repite la selección, tomada como un bloque, en `rows` × `columns` celdas. El bloque original queda en la
 * celda de arriba a la izquierda. Las celdas que se saldrían de la hoja se omiten.
 */
export function multiplyMarkups(source: Markup[], opts: MultiplyOptions, calib: PageCalibration, dims: PageDimensionsPt): CopyResult {
  const rows = Math.max(1, Math.floor(opts.rows));
  const columns = Math.max(1, Math.floor(opts.columns));
  if (rows * columns > MULTIPLY_MAX_COPIES) return { created: [], skipped: 0, reason: `Multiply is limited to ${MULTIPLY_MAX_COPIES} cells.` };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of source) {
    const b = markupBounds(m);
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (minX === Infinity) return { created: [], skipped: 0, reason: 'Nothing to multiply.' };
  const unitsX = calib.scale > 0 ? calib.scale : 1;
  const unitsY = (calib.scaleY ?? calib.scale) > 0 ? (calib.scaleY ?? calib.scale) : 1;
  const stepX = maxX - minX + opts.gapX / unitsX / dims.width;
  const stepY = maxY - minY + opts.gapY / unitsY / dims.height;
  const now = new Date().toISOString();
  const created: Markup[] = [];
  let skipped = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (r === 0 && c === 0) continue;
      const dx = c * stepX;
      const dy = r * stepY;
      if (minX + dx < -1e-9 || maxX + dx > 1 + 1e-9 || minY + dy < -1e-9 || maxY + dy > 1 + 1e-9) {
        skipped++;
        continue;
      }
      const groupMap = new Map<string, string>();
      for (const m of source) if (m.groupId && !groupMap.has(m.groupId)) groupMap.set(m.groupId, uuidv4());
      const shift = (p: MarkupPoint): MarkupPoint => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) });
      for (const m of source) created.push(cloneMarkup(m, groupMap, shift, now));
    }
  }
  return { created, skipped };
}

// ── Offset ───────────────────────────────────────────────────────────────────────────────────────────────────────

const OPEN_PATHS = new Set<Markup['type']>(['line', 'polyLine', 'length', 'polylineMeasure']);
const CLOSED_PATHS = new Set<Markup['type']>(['polygon', 'area', 'perimeter', 'cloud']);
const BOXES = new Set<Markup['type']>(['rectangle', 'circle', 'cloud']);

/** Límite de la esquina en ángulo: la punta del inglete nunca se aleja más de 4 veces la distancia. */
const MITER_LIMIT = 4;

/** Área con signo en coordenadas de pantalla (y hacia abajo): positiva si el contorno gira en sentido horario. */
function signedArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Trazado paralelo a `d` puntos a la izquierda del sentido de dibujo (en pantalla; d negativo = derecha). Las
 * esquinas se resuelven con inglete.
 */
export function offsetPath(pts: { x: number; y: number }[], d: number, closed: boolean): { x: number; y: number }[] {
  // Sin vértices repetidos consecutivos, que no tienen dirección
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-9);
  if (closed && clean.length > 1 && Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].y - clean[clean.length - 1].y) <= 1e-9) clean.pop();
  const n = clean.length;
  if (n < 2) return pts.map((p) => ({ ...p }));
  const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  };
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    const prev = clean[(i - 1 + n) % n];
    const next = clean[(i + 1) % n];
    const cur = clean[i];
    const n1 = hasPrev ? normal(prev, cur) : null;
    const n2 = hasNext ? normal(cur, next) : null;
    if (!n1 || !n2) {
      const nn = (n1 ?? n2)!;
      out.push({ x: cur.x + nn.x * d, y: cur.y + nn.y * d });
      continue;
    }
    const dot = n1.x * n2.x + n1.y * n2.y;
    const k = 1 / Math.max(1 + dot, 1 / (MITER_LIMIT * MITER_LIMIT));
    out.push({ x: cur.x + (n1.x + n2.x) * k * d, y: cur.y + (n1.y + n2.y) * k * d });
  }
  return out;
}

/** Si Offset sabe desplazar esta marca. */
export function canOffset(m: Pick<Markup, 'type' | 'points'>): boolean {
  if (BOXES.has(m.type) && m.points.length === 2) return true;
  if (OPEN_PATHS.has(m.type)) return m.points.length >= 2;
  return CLOSED_PATHS.has(m.type) && m.points.length >= 3;
}

export interface OffsetOptions {
  /** Distancia en unidades de la escala (positiva). */
  distance: number;
  /** Izquierda del sentido de dibujo, o fuera de una forma cerrada. `right` es derecha, o dentro. */
  side: 'left' | 'right';
}

/**
 * Offset: una copia paralela de cada marca a la distancia indicada. En trazados abiertos la copia queda a la izquierda
 * o a la derecha del sentido de dibujo; en formas cerradas, fuera o dentro. Las mediciones se recalculan.
 */
export function offsetMarkups(
  source: Markup[],
  opts: OffsetOptions,
  calibFor: (m: Markup, points: MarkupPoint[]) => PageCalibration,
  dims: PageDimensionsPt
): CopyResult {
  if (!(opts.distance > 0)) return { created: [], skipped: 0, reason: 'The distance must be greater than zero.' };
  const now = new Date().toISOString();
  const groupMap = new Map<string, string>();
  for (const m of source) if (m.groupId && !groupMap.has(m.groupId)) groupMap.set(m.groupId, uuidv4());
  const created: Markup[] = [];
  let skipped = 0;
  const toPt = (p: MarkupPoint) => ({ x: p.x * dims.width, y: p.y * dims.height });
  const toNorm = (p: { x: number; y: number }): MarkupPoint => ({ x: clamp01(p.x / dims.width), y: clamp01(p.y / dims.height) });
  for (const m of source) {
    if (!canOffset(m)) {
      skipped++;
      continue;
    }
    const calib = calibFor(m, m.points);
    const d = opts.distance / (calib.scale > 0 ? calib.scale : 1);
    const isBox = BOXES.has(m.type) && m.points.length === 2;
    let points: MarkupPoint[];
    if (isBox) {
      const [a, b] = m.points.map(toPt);
      // outside crece la caja, inside la encoge
      const grow = opts.side === 'left' ? d : -d;
      const x0 = Math.min(a.x, b.x) - grow;
      const x1 = Math.max(a.x, b.x) + grow;
      const y0 = Math.min(a.y, b.y) - grow;
      const y1 = Math.max(a.y, b.y) + grow;
      if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) {
        skipped++;
        continue;
      }
      points = [toNorm({ x: x0, y: y0 }), toNorm({ x: x1, y: y1 })];
    } else {
      const closed = CLOSED_PATHS.has(m.type);
      const pts = m.points.map(toPt);
      let signed = opts.side === 'left' ? d : -d;
      // En una forma cerrada "izquierda" significa fuera: depende del sentido en que se dibujó
      if (closed && signedArea(pts) < 0) signed = -signed;
      points = offsetPath(pts, signed, closed).map(toNorm);
    }
    let copy = cloneMarkup(m, groupMap, (p) => p, now);
    copy = { ...copy, points };
    if (SCALED_MEASURE_TYPES.has(m.type)) copy = { ...remeasureMarkup(copy, points, dims, calibFor(copy, points)), id: copy.id };
    created.push(copy);
  }
  return { created, skipped };
}
