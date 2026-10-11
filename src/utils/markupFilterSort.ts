import { Markup, MarkupStatus, MarkupType } from '../types/markup';

export interface MarkupFilterCriteria {
  searchQuery?: string;
  type?: MarkupType | 'all';
  author?: string | 'all';
  status?: MarkupStatus | 'all';
  pageIndex?: number | 'all';
  layer?: string | 'all';
}

export type MarkupSortField =
  | 'type'
  | 'text'
  | 'author'
  | 'createdAt'
  | 'pageIndex'
  | 'status'
  | 'color';

export type SortDirection = 'asc' | 'desc';

export interface MarkupSortCriteria {
  field: MarkupSortField | null;
  direction?: SortDirection;
}

/**
 * Filtra marcas en base a criterios de búsqueda, tipo, autor, estado y página.
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

  return markups.filter((m) => {
    // 1. Filtro por término de búsqueda (coincide con texto o autor)
    if (query) {
      const textMatch = (m.text || '').toLowerCase().includes(query);
      const authorMatch = (m.author || '').toLowerCase().includes(query);
      if (!textMatch && !authorMatch) {
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

    return true;
  });
}

/**
 * Ordena marcas según el campo y dirección especificados.
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
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        comparison = timeA - timeB;
        break;
      }
      case 'color': {
        const colorA = a.style?.strokeColor || '';
        const colorB = b.style?.strokeColor || '';
        comparison = colorA.localeCompare(colorB);
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
  const filtered = filterMarkups(markups, filter);
  return sortMarkups(filtered, sort);
}
