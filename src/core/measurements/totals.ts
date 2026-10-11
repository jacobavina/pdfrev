import { Markup } from '../../types/markup';

/**
 * Totales de takeoff (ADR-0017). Puro: sin React ni stores.
 * Se agrupa por categoría y por unidad: nunca se suman metros con pies ni áreas con longitudes.
 * Se suma con los valores sin redondear y solo se redondea al mostrar.
 */

export type MeasureCategory = 'length' | 'area' | 'count';

export interface MeasureTotal {
  category: MeasureCategory;
  unit: string;
  /** Suma de longitudes (m, ft…), de áreas (m², ft²…) o número de elementos contados. */
  total: number;
  /** Solo áreas: suma de perímetros en la unidad lineal. */
  perimeter?: number;
  items: number;
}

export function measureCategoryOf(m: Markup): MeasureCategory | null {
  if (!m.measurement) return null;
  if (m.type === 'length' || m.type === 'polylineMeasure') return 'length';
  if (m.type === 'area') return 'area';
  if (m.type === 'count') return 'count';
  return null;
}

export function computeMeasureTotals(markups: readonly Markup[], pageIndex?: number): MeasureTotal[] {
  const byKey = new Map<string, MeasureTotal>();
  for (const m of markups) {
    if (pageIndex !== undefined && m.pageIndex !== pageIndex) continue;
    const category = measureCategoryOf(m);
    if (!category || !m.measurement) continue;
    const value = Number.isFinite(m.measurement.value) ? m.measurement.value : 0;
    const unit = category === 'count' ? 'u' : m.measurement.unit;
    const key = `${category}|${unit}`;
    const entry = byKey.get(key) ?? { category, unit, total: 0, items: 0 };
    entry.items += 1;
    if (category === 'count') {
      entry.total += 1;
    } else {
      entry.total += value;
    }
    if (category === 'area') {
      const p = m.measurement.perimeter;
      entry.perimeter = (entry.perimeter ?? 0) + (typeof p === 'number' && Number.isFinite(p) ? p : 0);
    }
    byKey.set(key, entry);
  }
  const order: Record<MeasureCategory, number> = { length: 0, area: 1, count: 2 };
  return [...byKey.values()].sort((a, b) => order[a.category] - order[b.category] || a.unit.localeCompare(b.unit));
}
