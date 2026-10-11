/**
 * Motor de búsqueda textual en documentos PDF para REA (Paquete 5).
 * Funciones puras para indexación, localización de subcadenas y mapeo geométrico.
 */

export interface TextItemData {
  str: string;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, tx, ty]
  width: number;
  height: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchMatch {
  pageIndex: number;
  matchIndex: number; // Índice global (0..totalMatches - 1)
  pageMatchIndex: number; // Índice local dentro de la página
  text: string;
  rects: NormalizedRect[];
}

export interface SearchOptions {
  caseSensitive?: boolean;
  matchWholeWord?: boolean;
}

export interface PageDimensionsPt {
  width: number;
  height: number;
}

/**
 * Normaliza una cadena para búsqueda sin acentos/diacríticos y/o minúsculas.
 */
export function normalizeSearchString(str: string, caseSensitive: boolean): string {
  let s = str;
  if (!caseSensitive) {
    s = s.toLowerCase();
  }
  return s;
}

/**
 * Calcula el rectángulo normalizado (0..1) de un ítem de texto o de un segmento de él.
 */
export function calculateTextItemRect(
  item: TextItemData,
  startIndex: number,
  length: number,
  pageDims: PageDimensionsPt
): NormalizedRect {
  const totalChars = Math.max(1, item.str.length);
  const charRatioStart = Math.max(0, Math.min(1, startIndex / totalChars));
  const charRatioEnd = Math.max(0, Math.min(1, (startIndex + length) / totalChars));
  const segmentRatio = Math.max(0.001, charRatioEnd - charRatioStart);

  const tx = item.transform[4] ?? 0;
  const ty = item.transform[5] ?? 0;
  const itemW = item.width > 0 ? item.width : Math.abs(item.transform[0] ?? 10);
  const itemH = item.height > 0 ? item.height : Math.abs(item.transform[3] ?? 12);

  // Sub-offset horizontal para coincidencias parciales dentro del ítem
  const subX = tx + charRatioStart * itemW;
  const subW = segmentRatio * itemW;

  // En PDF el eje Y comienza abajo; normalizamos a 0..1 con origen arriba a la izquierda
  const normX = Math.max(0, Math.min(1, subX / pageDims.width));
  const normY = Math.max(0, Math.min(1, (pageDims.height - (ty + itemH)) / pageDims.height));
  const normW = Math.max(0, Math.min(1, subW / pageDims.width));
  const normH = Math.max(0, Math.min(1, itemH / pageDims.height));

  return {
    x: normX,
    y: normY,
    width: normW,
    height: normH,
  };
}

/**
 * Busca ocurrencias en los ítems de texto de una página.
 */
export function findMatchesInPageItems(
  pageIndex: number,
  items: TextItemData[],
  query: string,
  pageDims: PageDimensionsPt,
  options: SearchOptions = {}
): Omit<SearchMatch, 'matchIndex'>[] {
  const trimmed = query.trim();
  if (!trimmed || items.length === 0) return [];

  const caseSensitive = !!options.caseSensitive;
  const wholeWord = !!options.matchWholeWord;

  const normalizedQuery = normalizeSearchString(trimmed, caseSensitive);
  const matches: Omit<SearchMatch, 'matchIndex'>[] = [];

  let pageMatchCounter = 0;

  for (const item of items) {
    if (!item.str) continue;

    const normalizedStr = normalizeSearchString(item.str, caseSensitive);
    let searchStart = 0;

    while (searchStart < normalizedStr.length) {
      const foundIdx = normalizedStr.indexOf(normalizedQuery, searchStart);
      if (foundIdx === -1) break;

      let isMatch = true;
      if (wholeWord) {
        // Verificar límites de palabra
        const prevChar = foundIdx > 0 ? normalizedStr[foundIdx - 1] : ' ';
        const nextChar =
          foundIdx + normalizedQuery.length < normalizedStr.length
            ? normalizedStr[foundIdx + normalizedQuery.length]
            : ' ';
        const isWordBoundaryBefore = /[\s\p{P}]/u.test(prevChar);
        const isWordBoundaryAfter = /[\s\p{P}]/u.test(nextChar);
        if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
          isMatch = false;
        }
      }

      if (isMatch) {
        const rect = calculateTextItemRect(item, foundIdx, normalizedQuery.length, pageDims);
        const originalMatchedText = item.str.slice(foundIdx, foundIdx + normalizedQuery.length);

        matches.push({
          pageIndex,
          pageMatchIndex: pageMatchCounter++,
          text: originalMatchedText,
          rects: [rect],
        });
      }

      searchStart = foundIdx + Math.max(1, normalizedQuery.length);
    }
  }

  return matches;
}

/**
 * Asigna los índices correlativos globales a un conjunto de coincidencias de múltiples páginas.
 */
export function indexGlobalMatches(
  pageMatches: Omit<SearchMatch, 'matchIndex'>[][]
): SearchMatch[] {
  const flat: SearchMatch[] = [];
  let globalIndex = 0;

  for (const pageList of pageMatches) {
    for (const m of pageList) {
      flat.push({
        ...m,
        matchIndex: globalIndex++,
      });
    }
  }

  return flat;
}
