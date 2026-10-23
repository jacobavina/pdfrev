import { v4 as uuidv4 } from 'uuid';
import type { Markup, MarkupPoint, MarkupStyle, PageCalibration } from '../../types/markup';
import type { PageDimensionsPt } from '../measurements/calculate';

/**
 * Sketch to Scale (ADR-0128): dibuja una forma con medidas reales (en las unidades de la escala de la página) en vez de
 * arrastrar con el ratón. Puro; el diálogo vive en la interfaz.
 */

export type SketchShape = 'rectangle' | 'circle' | 'line' | 'polygon';

export const SKETCH_SHAPES: { id: SketchShape; label: string }[] = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'circle', label: 'Circle / Ellipse' },
  { id: 'line', label: 'Line' },
  { id: 'polygon', label: 'Regular polygon' },
];

export const MIN_POLYGON_SIDES = 3;
export const MAX_POLYGON_SIDES = 24;

export interface SketchSpec {
  shape: SketchShape;
  /** Rectángulo y elipse: ancho. Línea: largo. Polígono: largo del lado. */
  width: number;
  /** Rectángulo y elipse: alto (en un círculo igual al ancho). */
  height: number;
  /** Línea: ángulo en grados, 0 hacia la derecha y positivo en sentido contrario a las agujas. */
  angle: number;
  /** Polígono regular: número de lados. */
  sides: number;
}

export interface SketchContext {
  pageIndex: number;
  /** Centro de la forma (para la línea, su punto medio), normalizado 0..1. */
  center: MarkupPoint;
  calibration: PageCalibration;
  dims: PageDimensionsPt;
  style: MarkupStyle;
  author: string;
  layer?: string;
}

export type SketchResult = { ok: true; markup: Markup } | { ok: false; reason: string };

/** Unidades reales por punto PDF en cada eje. */
function axisScales(c: PageCalibration): { sx: number; sy: number } {
  const sx = Number.isFinite(c.scale) && c.scale > 0 ? c.scale : 1;
  const sy = Number.isFinite(c.scaleY) && (c.scaleY ?? 0) > 0 ? (c.scaleY as number) : sx;
  return { sx, sy };
}

/** Los vértices de la forma, en puntos PDF relativos al centro, con la Y hacia arriba. */
function shapeOffsetsPt(spec: SketchSpec, sx: number, sy: number): { x: number; y: number }[] {
  const w = spec.width / sx;
  const h = spec.height / sy;
  switch (spec.shape) {
    case 'rectangle':
    case 'circle':
      return [
        { x: -w / 2, y: h / 2 },
        { x: w / 2, y: -h / 2 },
      ];
    case 'line': {
      const a = (spec.angle * Math.PI) / 180;
      // El largo se mide en unidades reales: con escalas distintas por eje cada componente usa la suya
      const dx = (Math.cos(a) * spec.width) / sx;
      const dy = (Math.sin(a) * spec.width) / sy;
      return [
        { x: -dx / 2, y: -dy / 2 },
        { x: dx / 2, y: dy / 2 },
      ];
    }
    case 'polygon': {
      const n = Math.round(spec.sides);
      const radius = spec.width / (2 * Math.sin(Math.PI / n));
      // Un lado horizontal abajo: el primer vértice a -90 grados menos medio paso
      return Array.from({ length: n }, (_, i) => {
        const t = -Math.PI / 2 - Math.PI / n + (2 * Math.PI * i) / n;
        return { x: (Math.cos(t) * radius) / sx, y: (Math.sin(t) * radius) / sy };
      });
    }
  }
}

/** Describe qué falta o sobra en las medidas, o null si son válidas. */
export function sketchProblem(spec: SketchSpec): string | null {
  const positive = (v: number) => Number.isFinite(v) && v > 0;
  if (spec.shape === 'rectangle' || spec.shape === 'circle') {
    return positive(spec.width) && positive(spec.height) ? null : 'Width and height must be greater than zero.';
  }
  if (spec.shape === 'line') {
    if (!positive(spec.width)) return 'The length must be greater than zero.';
    return Number.isFinite(spec.angle) ? null : 'Type the angle in degrees.';
  }
  if (!positive(spec.width)) return 'The side length must be greater than zero.';
  const n = Math.round(spec.sides);
  return n >= MIN_POLYGON_SIDES && n <= MAX_POLYGON_SIDES ? null : `A polygon needs between ${MIN_POLYGON_SIDES} and ${MAX_POLYGON_SIDES} sides.`;
}

/** Crea la marca con esas medidas centrada en `ctx.center`. Falla si las medidas no son válidas o la forma no cabe en la hoja. */
export function sketchToScale(spec: SketchSpec, ctx: SketchContext): SketchResult {
  const problem = sketchProblem(spec);
  if (problem) return { ok: false, reason: problem };
  const { sx, sy } = axisScales(ctx.calibration);
  const offsets = shapeOffsetsPt(spec, sx, sy);
  const points = offsets.map((o) => ({ x: ctx.center.x + o.x / ctx.dims.width, y: ctx.center.y - o.y / ctx.dims.height }));
  const eps = 1e-9;
  if (points.some((p) => p.x < -eps || p.x > 1 + eps || p.y < -eps || p.y > 1 + eps)) {
    return { ok: false, reason: 'That shape does not fit on the page at this scale.' };
  }
  const now = new Date().toISOString();
  return {
    ok: true,
    markup: {
      id: uuidv4(),
      type: spec.shape,
      pageIndex: ctx.pageIndex,
      points,
      style: { ...ctx.style },
      author: ctx.author,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      layer: ctx.layer,
    },
  };
}
