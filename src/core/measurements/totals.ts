import { Markup } from '../../types/markup';
import { countItems } from '../markup/countSymbols';

/**
 * Totales de takeoff (ADR-0017). Puro: sin React ni stores.
 * Se agrupa por categoría y por unidad: nunca se suman metros con pies ni áreas con longitudes.
 * Se suma con los valores sin redondear y solo se redondea al mostrar.
 */

/** 'other' (ángulo, radio, diámetro) se lista pero no se suma: no tiene sentido totalizarlo. */
export type MeasureCategory = 'length' | 'area' | 'count' | 'volume' | 'other';

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
  if (m.type === 'length' || m.type === 'polylineMeasure' || m.type === 'perimeter') return 'length';
  if (m.type === 'area') return 'area';
  if (m.type === 'count') return 'count';
  if (m.type === 'volume') return 'volume';
  if (m.type === 'angle' || m.type === 'radius' || m.type === 'diameter') return 'other';
  return null;
}

export function computeMeasureTotals(markups: readonly Markup[], pageIndex?: number): MeasureTotal[] {
  const byKey = new Map<string, MeasureTotal>();
  for (const m of markups) {
    if (pageIndex !== undefined && m.pageIndex !== pageIndex) continue;
    const category = measureCategoryOf(m);
    if (!category || category === 'other' || !m.measurement) continue;
    const value = Number.isFinite(m.measurement.value) ? m.measurement.value : 0;
    const unit = category === 'count' ? 'u' : m.measurement.unit;
    const key = `${category}|${unit}`;
    const entry = byKey.get(key) ?? { category, unit, total: 0, items: 0 };
    entry.items += 1;
    if (category === 'count') {
      // Un conteo de Revu suma todos sus clics (ADR-0059)
      entry.total += countItems(m);
    } else {
      entry.total += value;
    }
    if (category === 'area') {
      const p = m.measurement.perimeter;
      entry.perimeter = (entry.perimeter ?? 0) + (typeof p === 'number' && Number.isFinite(p) ? p : 0);
    }
    byKey.set(key, entry);
  }
  const order: Record<MeasureCategory, number> = { length: 0, area: 1, volume: 2, count: 3, other: 4 };
  return [...byKey.values()].sort((a, b) => order[a.category] - order[b.category] || a.unit.localeCompare(b.unit));
}
