import { Markup, MarkupStatus, MarkupType, BbxCustomColumn } from '../types/markup';
import {
  evaluateColumnForMarkup,
  evaluateDocumentCustomColumns,
  EvaluationResult,
} from '../core/columns';
import { parseDateToTimestamp } from './dateUtils';

export interface MarkupFilterCriteria {
  searchQuery?: string;
  type?: MarkupType | 'all';
  author?: string | 'all';
  status?: MarkupStatus | 'all';
  pageIndex?: number | 'all';
  layer?: string | 'all';
  customColumns?: readonly BbxCustomColumn[];
  customFilters?: Record<string, string | number>;
  evaluationMatrix?: Map<string, Map<string, EvaluationResult>>;
}

export type MarkupSortField =
  | 'type'
  | 'text'
  | 'author'
  | 'createdAt'
  | 'pageIndex'
  | 'status'
  | 'color'
  | 'measurement'
  | `custom:${string}`;

export type SortDirection = 'asc' | 'desc';

export interface MarkupSortCriteria {
  field: MarkupSortField | null;
  direction?: SortDirection;
  customColumns?: readonly BbxCustomColumn[];
  evaluationMatrix?: Map<string, Map<string, EvaluationResult>>;
}

/**
 * Filtra marcas en base a criterios de búsqueda, tipo, autor, estado, página y columnas personalizadas.
 * Retorna siempre una copia nueva (inmutabilidad estricta).
 */
export function filterMarkups(
  markups: readonly Markup[],
  criteria: MarkupFilterCriteria
): Markup[] {
  const query = criteria.searchQuery?.trim().toLowerCase();
  const filterType = criteria.type && criteria.type !== 'all' ? criteria.type : null;
  const filterAuthor = criteria.author && criteria.author !== 'all' ? criteria.author : null;
  const filterStatus = criteria.status && criteria.status !== 'all' ? criteria.status : null;
  const filterPage =
    criteria.pageIndex !== undefined && criteria.pageIndex !== 'all'
      ? criteria.pageIndex
      : null;
  const filterLayer = criteria.layer && criteria.layer !== 'all' ? criteria.layer : null;

  const formulaCols = criteria.customColumns?.filter((c) => c.tipo === 'formula');
  const hasCustomFilters =
    criteria.customFilters && Object.keys(criteria.customFilters).length > 0;

  return markups.filter((m) => {
    // 1. Filtro por término de búsqueda (coincide con texto, autor, respuestas en hilo o valores de columnas personalizadas)
    if (query) {
      const textMatch = (m.text || '').toLowerCase().includes(query);
      const authorMatch = (m.author || '').toLowerCase().includes(query);
      const replyMatch = (m.replies || []).some(
        (r) =>
          (r.text || '').toLowerCase().includes(query) ||
          (r.author || '').toLowerCase().includes(query)
      );

      let customMatch = false;
      if (m.customFields) {
        for (const val of Object.values(m.customFields)) {
          if (
            val !== undefined &&
            val !== null &&
            String(val).toLowerCase().includes(query)
          ) {
            customMatch = true;
            break;
          }
        }
      }

      // Si no coincide y hay columnas calculadas, chequear resultados evaluados
      if (!textMatch && !authorMatch && !replyMatch && !customMatch && formulaCols && formulaCols.length > 0) {
        for (const fCol of formulaCols) {
          const evalRes =
            criteria.evaluationMatrix?.get(m.id)?.get(fCol.id) ??
            evaluateColumnForMarkup(fCol, m, criteria.customColumns as BbxCustomColumn[]);
          if (evalRes.ok && String(evalRes.value).toLowerCase().includes(query)) {
            customMatch = true;
            break;
          }
        }
      }

      if (!textMatch && !authorMatch && !replyMatch && !customMatch) {
        return false;
      }
    }

    // 2. Filtro por tipo de marca
    if (filterType && m.type !== filterType) {
      return false;
    }

    // 3. Filtro por autor
    if (filterAuthor && m.author !== filterAuthor) {
      return false;
    }

    // 4. Filtro por estado
    if (filterStatus && m.status !== filterStatus) {
      return false;
    }

    // 5. Filtro por página
    if (filterPage !== null && m.pageIndex !== filterPage) {
      return false;
    }

    // 6. Filtro por capa
    if (filterLayer && (m.layer || '') !== filterLayer) {
      return false;
    }

    // 7. Filtros específicos por columnas personalizadas
    if (hasCustomFilters && criteria.customFilters) {
      for (const [colId, filterVal] of Object.entries(criteria.customFilters)) {
        if (
          filterVal === undefined ||
          filterVal === null ||
          filterVal === 'all' ||
          filterVal === ''
        ) {
          continue;
        }

        const colDef = criteria.customColumns?.find((c) => c.id === colId);
        if (colDef?.tipo === 'formula') {
          const evalRes =
            criteria.evaluationMatrix?.get(m.id)?.get(colId) ??
            evaluateColumnForMarkup(colDef, m, criteria.customColumns as BbxCustomColumn[]);
          if (!evalRes.ok) {
            return false;
          }
          if (typeof filterVal === 'number') {
            if (evalRes.value !== filterVal) return false;
          } else {
            if (String(evalRes.value) !== String(filterVal)) return false;
          }
        } else {
          const rawVal = m.customFields?.[colId];
          if (rawVal === undefined || rawVal === null) {
            return false;
          }
          if (colDef?.tipo === 'choice') {
            if (String(rawVal) !== String(filterVal)) return false;
          } else if (colDef?.tipo === 'number' || typeof filterVal === 'number') {
            if (Number(rawVal) !== Number(filterVal)) return false;
          } else {
            const strVal = String(rawVal).toLowerCase();
            const target = String(filterVal).toLowerCase();
            if (!strVal.includes(target)) return false;
          }
        }
      }
    }

    return true;
  });
}

interface ExtractedSortValue {
  hasValue: boolean;
  numVal?: number;
  strVal?: string;
}

/**
 * Ordena marcas según el campo y dirección especificados.
 * Admite campos estándar y columnas personalizadas (`custom:<colId>`).
 * Los valores vacíos y errores se sitúan SIEMPRE AL FINAL tanto en orden asc como desc.
 * Implementa ordenamiento estable con desempate determinista por ID.
 * Retorna siempre un nuevo array ordenado.
 */
export function sortMarkups(
  markups: readonly Markup[],
  criteria: MarkupSortCriteria
): Markup[] {
  if (!criteria.field) {
    return [...markups];
  }
  const { field, direction = 'asc' } = criteria;
  const modifier = direction === 'asc' ? 1 : -1;

  // Copia superficial para preservar inmutabilidad
  const sorted = [...markups];

  if (field.startsWith('custom:')) {
    const colId = field.slice(7);
    const colDef = criteria.customColumns?.find((c) => c.id === colId);

    // Pre-extracción en Map O(N) para evitar reevaluaciones en el comparador O(N log N)
    const valMap = new Map<string, ExtractedSortValue>();

    for (const m of markups) {
      if (colDef?.tipo === 'formula') {
        const evalRes =
          criteria.evaluationMatrix?.get(m.id)?.get(colId) ??
          evaluateColumnForMarkup(colDef, m, criteria.customColumns as BbxCustomColumn[]);
        if (evalRes.ok && Number.isFinite(evalRes.value)) {
          valMap.set(m.id, { hasValue: true, numVal: evalRes.value });
        } else {
          // Errores DIV0, REF, NAN, CYCLE, OVERFLOW o cálculos fallidos van al final
          valMap.set(m.id, { hasValue: false });
        }
      } else if (colDef?.tipo === 'number') {
        const raw = m.customFields?.[colId];
        if (raw !== undefined && raw !== null && raw !== '') {
          const num = Number(raw);
          if (Number.isFinite(num)) {
            valMap.set(m.id, { hasValue: true, numVal: num });
          } else {
            valMap.set(m.id, { hasValue: false });
          }
        } else {
          valMap.set(m.id, { hasValue: false });
        }
      } else if (colDef?.tipo === 'choice' || colDef?.tipo === 'text') {
        const raw = m.customFields?.[colId];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          valMap.set(m.id, { hasValue: true, strVal: String(raw) });
        } else {
          valMap.set(m.id, { hasValue: false });
        }
      } else {
        // Tipo no conocido o sin colDef: inferir desde customFields
        const raw = m.customFields?.[colId];
        if (raw !== undefined && raw !== null && raw !== '') {
          const num = Number(raw);
          if (typeof raw === 'number' || (typeof raw === 'string' && !Number.isNaN(num))) {
            valMap.set(m.id, { hasValue: true, numVal: num });
          } else {
            valMap.set(m.id, { hasValue: true, strVal: String(raw) });
          }
        } else {
          valMap.set(m.id, { hasValue: false });
        }
      }
    }

    sorted.sort((a, b) => {
      const vA = valMap.get(a.id) ?? { hasValue: false };
      const vB = valMap.get(b.id) ?? { hasValue: false };

      // Valores vacíos o errores van SIEMPRE al final en asc y desc
      if (!vA.hasValue && vB.hasValue) return 1;
      if (vA.hasValue && !vB.hasValue) return -1;
      if (!vA.hasValue && !vB.hasValue) return a.id.localeCompare(b.id);

      let comparison = 0;
      if (vA.numVal !== undefined && vB.numVal !== undefined) {
        comparison = vA.numVal - vB.numVal;
      } else {
        const sA = vA.strVal ?? String(vA.numVal ?? '');
        const sB = vB.strVal ?? String(vB.numVal ?? '');
        comparison = sA.localeCompare(sB, undefined, { sensitivity: 'base' });
      }

      if (comparison !== 0) {
        return comparison * modifier;
      }
      return a.id.localeCompare(b.id);
    });

    return sorted;
  }

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (field) {
      case 'type':
        comparison = (a.type || '').localeCompare(b.type || '');
        break;
      case 'text':
        comparison = (a.text || '').localeCompare(b.text || '', undefined, {
          sensitivity: 'base',
        });
        break;
      case 'author':
        comparison = (a.author || '').localeCompare(b.author || '', undefined, {
          sensitivity: 'base',
        });
        break;
      case 'pageIndex':
        comparison = (a.pageIndex ?? 0) - (b.pageIndex ?? 0);
        break;
      case 'status':
        comparison = (a.status || '').localeCompare(b.status || '');
        break;
      case 'createdAt': {
        comparison = parseDateToTimestamp(a.createdAt) - parseDateToTimestamp(b.createdAt);
        break;
      }
      case 'color': {
        const colorA = a.style?.strokeColor || '';
        const colorB = b.style?.strokeColor || '';
        comparison = colorA.localeCompare(colorB);
        break;
      }
      case 'measurement': {
        const valA = a.measurement?.value ?? -Infinity;
        const valB = b.measurement?.value ?? -Infinity;
        comparison = valA - valB;
        break;
      }
      default:
        comparison = 0;
    }

    if (comparison !== 0) {
      return comparison * modifier;
    }

    // Desempate determinista por ID para garantizar orden estable
    return a.id.localeCompare(b.id);
  });

  return sorted;
}

/**
 * Canalización combinada de filtrado y ordenación.
 */
export function filterAndSortMarkups(
  markups: readonly Markup[],
  filter: MarkupFilterCriteria,
  sort: MarkupSortCriteria
): Markup[] {
  const customColumns = filter.customColumns ?? sort.customColumns;
  let evaluationMatrix = filter.evaluationMatrix ?? sort.evaluationMatrix;

  // Si hay columnas fórmula y no hay matriz precalculada, calcularla una sola vez
  if (!evaluationMatrix && customColumns && customColumns.some((c) => c.tipo === 'formula')) {
    evaluationMatrix = evaluateDocumentCustomColumns(
      markups as Markup[],
      customColumns as BbxCustomColumn[]
    );
  }

  const enrichedFilter: MarkupFilterCriteria = {
    ...filter,
    customColumns,
    evaluationMatrix,
  };
  const enrichedSort: MarkupSortCriteria = {
    ...sort,
    customColumns,
    evaluationMatrix,
  };

  const filtered = filterMarkups(markups, enrichedFilter);
  return sortMarkups(filtered, enrichedSort);
}
