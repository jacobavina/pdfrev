import { Markup, MarkupPoint } from '../../types/markup';
import { MoveMarkupItem, useMarkupStore } from '../../store/useMarkupStore';
import { Bounds, markupBounds } from './transformHandles';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';
export type FlipAxis = 'horizontal' | 'vertical';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const CANONICAL_BOX_TYPES = new Set<Markup['type']>([
  'rectangle',
  'callout',
  'text',
  'highlight',
  'highlightVector',
  'highlightText',
  'underline',
  'strikeOut',
  'squiggly',
  'stamp',
  'link',
  'fileAttachment',
  'formField',
]);

interface TransformUnit {
  key: string;
  markups: Markup[];
  bounds: Bounds;
  locked: boolean;
}

/**
 * Agrupa las marcas seleccionadas en unidades lógicas (cada `groupId` forma una sola unidad
 * con su caja envolvente combinada) para que grupos como `Cloud+` se alineen o distribuyan sin
 * desfasar la nube respecto a su llamada (ADR-0073).
 */
function buildUnits(markups: Markup[]): TransformUnit[] {
  const byKey = new Map<string, Markup[]>();
  for (const m of markups) {
    const key = m.groupId ? `group:${m.groupId}` : `id:${m.id}`;
    const list = byKey.get(key);
    if (list) list.push(m);
    else byKey.set(key, [m]);
  }

  const units: TransformUnit[] = [];
  for (const [key, group] of byKey.entries()) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const m of group) {
      const b = markupBounds(m);
      if (!b) continue;
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    if (minX === Infinity) continue;
    units.push({
      key,
      markups: group,
      bounds: { minX, minY, maxX, maxY },
      locked: group.some((m) => Boolean(m.locked)),
    });
  }
  return units;
}

function translateMarkup(markup: Markup, dx: number, dy: number): MoveMarkupItem | null {
  if (markup.locked) return null;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  const shiftPt = (p: MarkupPoint): MarkupPoint => ({
    x: clamp01(p.x + dx),
    y: clamp01(p.y + dy),
  });
  return {
    id: markup.id,
    originalPoints: markup.points.map((p) => ({ ...p })),
    newPoints: markup.points.map(shiftPt),
    ...(markup.leaders
      ? {
          originalLeaders: markup.leaders.map((l) => l.map((p) => ({ ...p }))),
          newLeaders: markup.leaders.map((l) => l.map(shiftPt)),
        }
      : {}),
  };
}

/**
 * Calcula los desplazamientos para alinear un conjunto de marcas según `mode` (ADR-0073).
 * Requiere al menos 2 unidades seleccionadas. Respeta grupos y omite marcas bloqueadas.
 */
export function alignMarkups(markups: Markup[], mode: AlignMode): MoveMarkupItem[] {
  const units = buildUnits(markups);
  if (units.length < 2) return [];

  const globalMinX = Math.min(...units.map((u) => u.bounds.minX));
  const globalMaxX = Math.max(...units.map((u) => u.bounds.maxX));
  const globalMinY = Math.min(...units.map((u) => u.bounds.minY));
  const globalMaxY = Math.max(...units.map((u) => u.bounds.maxY));
  const globalCenterX = (globalMinX + globalMaxX) / 2;
  const globalCenterY = (globalMinY + globalMaxY) / 2;

  const moves: MoveMarkupItem[] = [];
  for (const unit of units) {
    if (unit.locked) continue;
    let dx = 0;
    let dy = 0;
    const { minX, maxX, minY, maxY } = unit.bounds;
    switch (mode) {
      case 'left':
        dx = globalMinX - minX;
        break;
      case 'center':
        dx = globalCenterX - (minX + maxX) / 2;
        break;
      case 'right':
        dx = globalMaxX - maxX;
        break;
      case 'top':
        dy = globalMinY - minY;
        break;
      case 'middle':
        dy = globalCenterY - (minY + maxY) / 2;
        break;
      case 'bottom':
        dy = globalMaxY - maxY;
        break;
    }
    // Ajustar delta para que ninguna marca de la unidad se salga de [0, 1]
    dx = Math.max(-minX, Math.min(1 - maxX, dx));
    dy = Math.max(-minY, Math.min(1 - maxY, dy));
    for (const m of unit.markups) {
      const move = translateMarkup(m, dx, dy);
      if (move) moves.push(move);
    }
  }
  return moves;
}

/**
 * Calcula los desplazamientos para distribuir uniformemente 3 o más unidades a lo largo de `axis` (ADR-0073).
 * Las unidades extremas permanecen fijas y el espacio intermedio se reparte en huecos iguales.
 */
export function distributeMarkups(markups: Markup[], axis: DistributeAxis): MoveMarkupItem[] {
  const units = buildUnits(markups);
  if (units.length < 3) return [];

  const sorted = [...units].sort((a, b) => {
    const ca = axis === 'horizontal' ? (a.bounds.minX + a.bounds.maxX) / 2 : (a.bounds.minY + a.bounds.maxY) / 2;
    const cb = axis === 'horizontal' ? (b.bounds.minX + b.bounds.maxX) / 2 : (b.bounds.minY + b.bounds.maxY) / 2;
    return ca - cb;
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanStart = axis === 'horizontal' ? first.bounds.minX : first.bounds.minY;
  const spanEnd = axis === 'horizontal' ? last.bounds.maxX : last.bounds.maxY;
  const totalSpan = spanEnd - spanStart;
  const totalSize = sorted.reduce(
    (sum, u) => sum + (axis === 'horizontal' ? u.bounds.maxX - u.bounds.minX : u.bounds.maxY - u.bounds.minY),
    0
  );
  const gap = (totalSpan - totalSize) / (sorted.length - 1);

  const moves: MoveMarkupItem[] = [];
  let cursor = spanStart + (axis === 'horizontal' ? first.bounds.maxX - first.bounds.minX : first.bounds.maxY - first.bounds.minY) + gap;

  for (let i = 1; i < sorted.length - 1; i++) {
    const unit = sorted[i];
    const size = axis === 'horizontal' ? unit.bounds.maxX - unit.bounds.minX : unit.bounds.maxY - unit.bounds.minY;
    if (!unit.locked) {
      const dx = axis === 'horizontal' ? cursor - unit.bounds.minX : 0;
      const dy = axis === 'vertical' ? cursor - unit.bounds.minY : 0;
      for (const m of unit.markups) {
        const move = translateMarkup(m, dx, dy);
        if (move) moves.push(move);
      }
    }
    cursor += size + gap;
  }
  return moves;
}

/**
 * Voltea (espeja) horizontal o verticalmente las marcas seleccionadas respecto al centroide de la
 * selección conjunta (ADR-0073). Invierte tanto `points` como `leaders`, preservando la esquina
 * canónica en cajas de 2 puntos.
 */
export function flipMarkups(markups: Markup[], axis: FlipAxis): MoveMarkupItem[] {
  const unlocked = markups.filter((m) => !m.locked && markupBounds(m) !== null);
  if (unlocked.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of unlocked) {
    const b = markupBounds(m)!;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const reflectPt = (p: MarkupPoint): MarkupPoint =>
    axis === 'horizontal'
      ? { x: clamp01(2 * cx - p.x), y: p.y }
      : { x: p.x, y: clamp01(2 * cy - p.y) };

  const moves: MoveMarkupItem[] = [];
  for (const m of unlocked) {
    let newPoints = m.points.map(reflectPt);
    if (CANONICAL_BOX_TYPES.has(m.type) && newPoints.length === 2) {
      const [p0, p1] = newPoints;
      newPoints = [
        { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y) },
        { x: Math.max(p0.x, p1.x), y: Math.max(p0.y, p1.y) },
      ];
    }
    const newLeaders = m.leaders ? m.leaders.map((l) => l.map(reflectPt)) : undefined;

    const changed =
      newPoints.some((p, i) => Math.abs(p.x - m.points[i].x) > 1e-9 || Math.abs(p.y - m.points[i].y) > 1e-9) ||
      (newLeaders &&
        m.leaders &&
        newLeaders.some((l, li) =>
          l.some((p, pi) => Math.abs(p.x - m.leaders![li][pi].x) > 1e-9 || Math.abs(p.y - m.leaders![li][pi].y) > 1e-9)
        ));

    if (changed) {
      moves.push({
        id: m.id,
        originalPoints: m.points.map((p) => ({ ...p })),
        newPoints,
        ...(m.leaders
          ? {
              originalLeaders: m.leaders.map((l) => l.map((p) => ({ ...p }))),
              newLeaders,
            }
          : {}),
      });
    }
  }
  return moves;
}

/** Aplica alineación sobre la selección actual del store en un solo comando deshacible. */
export function alignSelectedMarkups(mode: AlignMode): void {
  const { markups, selectedMarkupIds, commitMoveMarkups } = useMarkupStore.getState();
  const selected = markups.filter((m) => selectedMarkupIds.includes(m.id));
  const moves = alignMarkups(selected, mode);
  if (moves.length > 0) {
    commitMoveMarkups(moves, `Align markups (${mode})`);
  }
}

/** Aplica distribución sobre la selección actual del store en un solo comando deshacible. */
export function distributeSelectedMarkups(axis: DistributeAxis): void {
  const { markups, selectedMarkupIds, commitMoveMarkups } = useMarkupStore.getState();
  const selected = markups.filter((m) => selectedMarkupIds.includes(m.id));
  const moves = distributeMarkups(selected, axis);
  if (moves.length > 0) {
    commitMoveMarkups(moves, `Distribute markups (${axis})`);
  }
}

/** Aplica volteo horizontal o vertical sobre la selección actual del store en un solo comando deshacible. */
export function flipSelectedMarkups(axis: FlipAxis): void {
  const { markups, selectedMarkupIds, commitMoveMarkups } = useMarkupStore.getState();
  const selected = markups.filter((m) => selectedMarkupIds.includes(m.id));
  const moves = flipMarkups(selected, axis);
  if (moves.length > 0) {
    commitMoveMarkups(moves, `Flip markups (${axis})`);
  }
}
