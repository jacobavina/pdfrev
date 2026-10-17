import { Markup } from '../../types/markup';
import { countItems } from '../markup/countSymbols';
import { markupTypeLabel } from '../markup/typeLabels';
import { MeasureCategory, measureCategoryOf } from './totals';

/**
 * Catálogo de precios unitarios por Subject o Tipo de marca (ADR-0077).
 * Los precios se expresan en unidades monetarias decimales (p. ej. 25.50 para $25.50 por unidad).
 */
export type UnitPriceCatalog = Record<string, number>;

export interface TakeoffSubtotalItem {
  groupKey: string;
  category: MeasureCategory;
  unit: string;
  /** Cantidad acumulada sin redondear (precisión completa) */
  rawQuantity: number;
  formattedQuantity: string;
  itemCount: number;
  perimeter?: number;
  /** Precio unitario en céntimos enteros (evita errores de coma flotante) */
  unitPriceCents?: number;
  /** Coste total en céntimos enteros */
  totalCostCents?: number;
  /** Precio unitario en moneda decimal */
  unitPrice?: number;
  /** Coste total en moneda decimal */
  totalCost?: number;
  formattedCost?: string;
}

export type TakeoffGroupingMode = 'subject' | 'layer' | 'page';

export interface ComputeTakeoffOptions {
  groupBy?: TakeoffGroupingMode;
  pageIndex?: number;
  catalog?: UnitPriceCatalog;
  currency?: string;
  precision?: number;
}

/**
 * Convierte una cantidad monetaria a céntimos enteros de forma segura y determinista.
 */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/**
 * Convierte céntimos enteros a cantidad monetaria decimal.
 */
export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

/**
 * Calcula el coste de un ítem a partir de su cantidad y precio unitario en céntimos enteros.
 */
export function computeItemCostCents(quantity: number, unitPriceCents: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceCents)) return 0;
  return Math.round(quantity * unitPriceCents);
}

/**
 * Formatea un coste numérico o en céntimos con símbolo de moneda.
 */
export function formatCurrency(cents: number, currency = '$'): string {
  if (!Number.isFinite(cents)) return `${currency}0.00`;
  const rounded = Math.round(cents);
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const formattedDollars = dollars.toLocaleString('en-US');
  const formattedCents = rem.toString().padStart(2, '0');
  const str = `${currency}${formattedDollars}.${formattedCents}`;
  return isNegative ? `-${str}` : str;
}

/**
 * Obtiene la clave de agrupación de una marca según el modo elegido.
 */
export function getGroupingKey(m: Markup, mode: TakeoffGroupingMode): string {
  switch (mode) {
    case 'subject':
      return m.subject?.trim() || markupTypeLabel(m.type);
    case 'layer':
      return m.layer?.trim() || 'Default';
    case 'page':
      return `Page ${m.pageIndex + 1}`;
  }
}

/**
 * Calcula los subtotales de takeoff agrupados por Subject, capa o página (ADR-0077),
 * realizando la suma de cantidades exactas antes de redondear y aplicando
 * aritmética entera en céntimos para precios unitarios y costes sin error de coma flotante.
 */
export function computeTakeoffSubtotals(
  markups: readonly Markup[],
  options: ComputeTakeoffOptions = {}
): TakeoffSubtotalItem[] {
  const {
    groupBy = 'subject',
    pageIndex,
    catalog = {},
    currency = '$',
    precision = 2,
  } = options;

  interface Accumulator {
    groupKey: string;
    category: MeasureCategory;
    unit: string;
    rawQuantity: number;
    itemCount: number;
    perimeter: number;
    hasArea: boolean;
    unitPriceCents?: number;
    hasMixedPrices: boolean;
    totalCostCents: number;
    hasPrices: boolean;
  }

  const map = new Map<string, Accumulator>();

  for (const m of markups) {
    if (pageIndex !== undefined && m.pageIndex !== pageIndex) continue;
    const category = measureCategoryOf(m);
    if (!category || category === 'other' || !m.measurement) continue;

    const groupKey = getGroupingKey(m, groupBy);
    const unit = category === 'count' ? 'u' : m.measurement.unit;
    const key = `${groupKey}|${category}|${unit}`;

    const qty =
      category === 'count'
        ? (countItems(m) > 1 || !Number.isFinite(m.measurement.value) || m.measurement.value <= 1
            ? countItems(m)
            : m.measurement.value)
        : Number.isFinite(m.measurement.value)
        ? m.measurement.value
        : 0;

    let acc = map.get(key);
    if (!acc) {
      acc = {
        groupKey,
        category,
        unit,
        rawQuantity: 0,
        itemCount: 0,
        perimeter: 0,
        hasArea: false,
        unitPriceCents: undefined,
        hasMixedPrices: false,
        totalCostCents: 0,
        hasPrices: false,
      };
      map.set(key, acc);
    }

    acc.itemCount += 1;
    acc.rawQuantity += qty;

    if (category === 'area') {
      acc.hasArea = true;
      const p = m.measurement.perimeter;
      if (typeof p === 'number' && Number.isFinite(p)) {
        acc.perimeter += p;
      }
    }

    // Precio unitario y coste del ítem
    const itemPrice =
      typeof m.unitPrice === 'number' && Number.isFinite(m.unitPrice)
        ? m.unitPrice
        : catalog[groupKey] ?? catalog[m.subject ?? ''] ?? catalog[markupTypeLabel(m.type)];
    const itemPriceCents = itemPrice !== undefined ? toCents(itemPrice) : undefined;

    if (itemPriceCents !== undefined) {
      acc.totalCostCents += computeItemCostCents(qty, itemPriceCents);
      acc.hasPrices = true;
      if (acc.unitPriceCents === undefined) {
        acc.unitPriceCents = itemPriceCents;
      } else if (acc.unitPriceCents !== itemPriceCents) {
        acc.hasMixedPrices = true;
      }
    } else if (typeof m.cost === 'number' && Number.isFinite(m.cost)) {
      acc.totalCostCents += toCents(m.cost);
      acc.hasPrices = true;
    }
  }

  const results: TakeoffSubtotalItem[] = [];

  for (const acc of map.values()) {
    let formattedQuantity = '';
    if (acc.category === 'count') {
      formattedQuantity = `${acc.rawQuantity} ea`;
    } else if (acc.category === 'area') {
      formattedQuantity = `${acc.rawQuantity.toFixed(precision)} ${acc.unit}²`;
    } else if (acc.category === 'volume') {
      formattedQuantity = `${acc.rawQuantity.toFixed(precision)} ${acc.unit}³`;
    } else {
      formattedQuantity = `${acc.rawQuantity.toFixed(precision)} ${acc.unit}`;
    }

    const item: TakeoffSubtotalItem = {
      groupKey: acc.groupKey,
      category: acc.category,
      unit: acc.unit,
      rawQuantity: acc.rawQuantity,
      formattedQuantity,
      itemCount: acc.itemCount,
      ...(acc.hasArea ? { perimeter: acc.perimeter } : {}),
    };

    if (acc.hasPrices) {
      // Si el grupo tiene un precio unitario homogéneo, se calcula sobre la cantidad total sin redondear
      // para evitar discrepancias por redondeos de ítems individuales
      const totalCostCents =
        !acc.hasMixedPrices && acc.unitPriceCents !== undefined
          ? computeItemCostCents(acc.rawQuantity, acc.unitPriceCents)
          : acc.totalCostCents;

      if (!acc.hasMixedPrices && acc.unitPriceCents !== undefined) {
        item.unitPriceCents = acc.unitPriceCents;
        item.unitPrice = fromCents(acc.unitPriceCents);
      }
      item.totalCostCents = totalCostCents;
      item.totalCost = fromCents(totalCostCents);
      item.formattedCost = formatCurrency(totalCostCents, currency);
    }

    results.push(item);
  }

  // Ordenar por clave de grupo y luego por categoría
  const catOrder: Record<MeasureCategory, number> = {
    length: 0,
    area: 1,
    volume: 2,
    count: 3,
    other: 4,
  };

  return results.sort(
    (a, b) =>
      a.groupKey.localeCompare(b.groupKey) ||
      catOrder[a.category] - catOrder[b.category] ||
      a.unit.localeCompare(b.unit)
  );
}
