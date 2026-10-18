/**
 * Índice espacial 2D uniforme particionado por página (ADR-0089 / Hito D.2).
 * Proporciona hit-testing y selección rectangular marquee en < 10 ms para 5 000 marcas,
 * reduciendo la complejidad de búsqueda de O(N) a O(1) celular promedio por punto y O(k) por rectángulo.
 */

import { Markup, MarkupPoint, BoundingBox } from '../../types/markup';
import { getMarkupBounds, hitTestMarkup } from '../../utils/coordinates';

export const DEFAULT_GRID_RESOLUTION = 32; // 32x32 = 1024 celdas en espacio [0, 1] x [0, 1]

export interface SpatialGridOptions {
  gridResolution?: number;
  pageDimensions?: { width: number; height: number };
}

/**
 * Grilla espacial 2D de alto rendimiento con índices enteros continuos y buffer de visita O(1).
 */
export class SpatialIndex {
  private readonly resolution: number;
  private readonly pageDims?: { width: number; height: number };

  // Almacén continuo por índice entero (0 .. N-1, donde N-1 es la marca superior en orden Z)
  private markupsArray: Markup[] = [];
  private boundsArray: BoundingBox[] = [];
  private idToIndex: Map<string, number> = new Map();

  // Grilla celular plana: cellKey (0 .. resolution^2 - 1) -> array de índices (orden Z creciente)
  private cells: (number[] | undefined)[] = [];

  // Mapeo de grupos (groupId -> array de índices)
  private groupMap: Map<string, number[]> = new Map();

  // Buffer de visita para evitar Set<string> y recolector de basura en consultas masivas
  private visited: Uint32Array = new Uint32Array(1024);
  private queryToken = 1;

  constructor(options: SpatialGridOptions = {}) {
    this.resolution = Math.max(5, Math.min(100, options.gridResolution ?? DEFAULT_GRID_RESOLUTION));
    this.pageDims = options.pageDimensions;
    this.cells = new Array(this.resolution * this.resolution);
  }

  /** Número total de marcas indexadas */
  public get size(): number {
    return this.markupsArray.length;
  }

  /**
   * Construye el índice espacial a partir de una colección de marcas en una sola pasada lineal O(N).
   */
  public build(markups: Markup[], pageDimensions?: { width: number; height: number }): void {
    this.clear();
    const dims = pageDimensions ?? this.pageDims;
    const n = markups.length;

    if (this.visited.length < n + 1) {
      this.visited = new Uint32Array(Math.max(1024, n * 2));
    }

    for (let i = 0; i < n; i++) {
      const m = markups[i];
      const bounds = getMarkupBounds(m, dims);
      const idx = this.markupsArray.length;

      this.markupsArray.push(m);
      this.boundsArray.push(bounds);
      this.idToIndex.set(m.id, idx);

      if (m.groupId) {
        let grp = this.groupMap.get(m.groupId);
        if (!grp) {
          grp = [];
          this.groupMap.set(m.groupId, grp);
        }
        grp.push(idx);
      }

      const cellKeys = this.getCellKeysForBounds(bounds);
      for (let k = 0; k < cellKeys.length; k++) {
        const key = cellKeys[k];
        let cell = this.cells[key];
        if (!cell) {
          cell = [];
          this.cells[key] = cell;
        }
        cell.push(idx);
      }
    }
  }

  /**
   * Limpia todas las estructuras del índice.
   */
  public clear(): void {
    this.cells = new Array(this.resolution * this.resolution);
    this.markupsArray = [];
    this.boundsArray = [];
    this.idToIndex.clear();
    this.groupMap.clear();
    this.queryToken = 1;
    if (this.visited.length > 0) {
      this.visited.fill(0);
    }
  }

  /**
   * Inserta una marca individual en el índice espacial.
   */
  public insert(markup: Markup, pageDimensions?: { width: number; height: number }): void {
    if (this.idToIndex.has(markup.id)) {
      this.remove(markup.id);
    }

    const dims = pageDimensions ?? this.pageDims;
    const bounds = getMarkupBounds(markup, dims);
    const idx = this.markupsArray.length;

    if (idx >= this.visited.length) {
      const nextVisited = new Uint32Array(Math.max(1024, this.visited.length * 2));
      nextVisited.set(this.visited);
      this.visited = nextVisited;
    }

    this.markupsArray.push(markup);
    this.boundsArray.push(bounds);
    this.idToIndex.set(markup.id, idx);

    if (markup.groupId) {
      let grp = this.groupMap.get(markup.groupId);
      if (!grp) {
        grp = [];
        this.groupMap.set(markup.groupId, grp);
      }
      grp.push(idx);
    }

    const cellKeys = this.getCellKeysForBounds(bounds);
    for (let k = 0; k < cellKeys.length; k++) {
      const key = cellKeys[k];
      let cell = this.cells[key];
      if (!cell) {
        cell = [];
        this.cells[key] = cell;
      }
      cell.push(idx);
    }
  }

  /**
   * Elimina una marca del índice espacial reconstruyendo si es necesario.
   */
  public remove(markupId: string): boolean {
    if (!this.idToIndex.has(markupId)) return false;

    // Para mantener los arrays continuos y el orden Z exacto, reconstruimos a partir de los elementos restantes
    const nextMarkups = this.markupsArray.filter((m) => m.id !== markupId);
    this.build(nextMarkups);
    return true;
  }

  /**
   * Actualiza una marca existente en el índice.
   */
  public update(markup: Markup, pageDimensions?: { width: number; height: number }): void {
    const idx = this.idToIndex.get(markup.id);
    if (idx === undefined) {
      this.insert(markup, pageDimensions);
      return;
    }

    // Reemplaza la marca en la misma posición de orden Z y reconstruye celdas
    const nextMarkups = [...this.markupsArray];
    nextMarkups[idx] = markup;
    this.build(nextMarkups, pageDimensions);
  }

  /**
   * Consulta marcas cuyas cajas celulares intersecten un punto y una tolerancia.
   */
  public queryPoint(point: MarkupPoint, tolerance = 0.015): Markup[] {
    const queryBounds: BoundingBox = {
      x: point.x - tolerance,
      y: point.y - tolerance,
      width: tolerance * 2,
      height: tolerance * 2,
    };
    return this.queryRect(queryBounds);
  }

  /**
   * Consulta marcas cuyas cajas delimitadoras intersecten el rectángulo dado.
   * Utiliza buffer de visita plano para CERO asignación de colecciones intermedias.
   */
  public queryRect(rect: BoundingBox): Markup[] {
    const K = this.resolution;
    const minCx = Math.max(0, Math.min(K - 1, Math.floor(rect.x * K)));
    const maxCx = Math.max(0, Math.min(K - 1, Math.floor((rect.x + rect.width) * K)));
    const minCy = Math.max(0, Math.min(K - 1, Math.floor(rect.y * K)));
    const maxCy = Math.max(0, Math.min(K - 1, Math.floor((rect.y + rect.height) * K)));

    const token = this.nextQueryToken();
    const visited = this.visited;
    const results: Markup[] = [];

    for (let cy = minCy; cy <= maxCy; cy++) {
      const rowOffset = cy * K;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells[rowOffset + cx];
        if (!cell) continue;

        for (let j = 0; j < cell.length; j++) {
          const idx = cell[j];
          if (visited[idx] === token) continue;
          visited[idx] = token;

          const bounds = this.boundsArray[idx];
          if (
            rect.x <= bounds.x + bounds.width &&
            rect.x + rect.width >= bounds.x &&
            rect.y <= bounds.y + bounds.height &&
            rect.y + rect.height >= bounds.y
          ) {
            results.push(this.markupsArray[idx]);
          }
        }
      }
    }

    return results;
  }

  /**
   * Hit-testing celular ultrarrápido:
   * Recopila candidatos celulares en un array plano, los ordena de mayor a menor índice Z,
   * descarta rápidamente candidatos fuera de bounding-box en O(1),
   * y evalúa la geometría exacta retornando de inmediato al primer impacto positivo.
   */
  public hitTest(
    point: MarkupPoint,
    tolerance = 0.015,
    pageDimensions?: { width: number; height: number }
  ): Markup | undefined {
    const K = this.resolution;
    const minCx = Math.max(0, Math.min(K - 1, Math.floor((point.x - tolerance) * K)));
    const maxCx = Math.max(0, Math.min(K - 1, Math.floor((point.x + tolerance) * K)));
    const minCy = Math.max(0, Math.min(K - 1, Math.floor((point.y - tolerance) * K)));
    const maxCy = Math.max(0, Math.min(K - 1, Math.floor((point.y + tolerance) * K)));

    const token = this.nextQueryToken();
    const visited = this.visited;
    const candidateIndices: number[] = [];

    for (let cy = minCy; cy <= maxCy; cy++) {
      const rowOffset = cy * K;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells[rowOffset + cx];
        if (!cell) continue;

        for (let j = 0; j < cell.length; j++) {
          const idx = cell[j];
          if (visited[idx] === token) continue;
          visited[idx] = token;
          candidateIndices.push(idx);
        }
      }
    }

    if (candidateIndices.length === 0) {
      return undefined;
    }

    // Ordenar de mayor a menor (orden Z inverso: la marca superior primero)
    if (candidateIndices.length > 1) {
      candidateIndices.sort((a, b) => b - a);
    }

    const dims = pageDimensions ?? this.pageDims;

    for (let i = 0; i < candidateIndices.length; i++) {
      const idx = candidateIndices[i];
      const b = this.boundsArray[idx];

      // Descarte ultra-rápido en O(1) si el punto ni siquiera está dentro de la caja con tolerancia
      if (
        point.x < b.x - tolerance ||
        point.x > b.x + b.width + tolerance ||
        point.y < b.y - tolerance ||
        point.y > b.y + b.height + tolerance
      ) {
        continue;
      }

      const markup = this.markupsArray[idx];
      if (hitTestMarkup(point, markup, tolerance, dims)) {
        return markup;
      }
    }

    return undefined;
  }

  /**
   * Selección rectangular tipo Marquee optimizada:
   * Consulta candidatos celulares, verifica intersección de bounds y expande miembros con el mismo groupId en O(1).
   */
  public selectInRect(
    marqueeRect: BoundingBox,
    _pageDimensions?: { width: number; height: number }
  ): string[] {
    const K = this.resolution;
    const minCx = Math.max(0, Math.min(K - 1, Math.floor(marqueeRect.x * K)));
    const maxCx = Math.max(0, Math.min(K - 1, Math.floor((marqueeRect.x + marqueeRect.width) * K)));
    const minCy = Math.max(0, Math.min(K - 1, Math.floor(marqueeRect.y * K)));
    const maxCy = Math.max(0, Math.min(K - 1, Math.floor((marqueeRect.y + marqueeRect.height) * K)));

    const candidateToken = this.nextQueryToken();
    const selectedToken = this.nextQueryToken();
    const visited = this.visited;
    const selectedIds: string[] = [];
    const selectedGroupIds = new Set<string>();

    for (let cy = minCy; cy <= maxCy; cy++) {
      const rowOffset = cy * K;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells[rowOffset + cx];
        if (!cell) continue;

        for (let j = 0; j < cell.length; j++) {
          const idx = cell[j];
          if (visited[idx] === candidateToken || visited[idx] === selectedToken) continue;
          visited[idx] = candidateToken;

          const bounds = this.boundsArray[idx];
          if (
            marqueeRect.x <= bounds.x + bounds.width &&
            marqueeRect.x + marqueeRect.width >= bounds.x &&
            marqueeRect.y <= bounds.y + bounds.height &&
            marqueeRect.y + marqueeRect.height >= bounds.y
          ) {
            visited[idx] = selectedToken;
            const m = this.markupsArray[idx];
            selectedIds.push(m.id);
            if (m.groupId) {
              selectedGroupIds.add(m.groupId);
            }
          }
        }
      }
    }

    // Expansión automática de grupos completos (A.2 Revu) en O(1) por miembro usando visited
    if (selectedGroupIds.size > 0) {
      for (const grpId of selectedGroupIds) {
        const groupMembers = this.groupMap.get(grpId);
        if (groupMembers) {
          for (let k = 0; k < groupMembers.length; k++) {
            const memberIdx = groupMembers[k];
            if (visited[memberIdx] === selectedToken) continue;
            visited[memberIdx] = selectedToken;
            selectedIds.push(this.markupsArray[memberIdx].id);
          }
        }
      }
    }

    return selectedIds;
  }

  // --- Métodos Privados y Claves Celulares ---

  private nextQueryToken(): number {
    this.queryToken++;
    if (this.queryToken >= 0xffffffff) {
      this.queryToken = 1;
      this.visited.fill(0);
    }
    return this.queryToken;
  }

  private getCellKeysForBounds(bounds: BoundingBox): number[] {
    const K = this.resolution;
    const minCx = Math.max(0, Math.min(K - 1, Math.floor(bounds.x * K)));
    const maxCx = Math.max(0, Math.min(K - 1, Math.floor((bounds.x + bounds.width) * K)));
    const minCy = Math.max(0, Math.min(K - 1, Math.floor(bounds.y * K)));
    const maxCy = Math.max(0, Math.min(K - 1, Math.floor((bounds.y + bounds.height) * K)));

    const keys: number[] = [];
    for (let cy = minCy; cy <= maxCy; cy++) {
      const rowOffset = cy * K;
      for (let cx = minCx; cx <= maxCx; cx++) {
        keys.push(rowOffset + cx);
      }
    }
    return keys;
  }
}

/**
 * Cache global indexado por referencia del array inmutable de marcas y página actual.
 * Evita reconstruir la grilla espacial si las marcas no han cambiado.
 */
const spatialIndexCache = new WeakMap<Markup[], Map<number, SpatialIndex>>();

export function getSpatialIndexForPage(
  markups: Markup[],
  pageIndex: number,
  pageDimensions?: { width: number; height: number }
): SpatialIndex {
  let pageMap = spatialIndexCache.get(markups);
  if (!pageMap) {
    pageMap = new Map();
    spatialIndexCache.set(markups, pageMap);
  }

  let index = pageMap.get(pageIndex);
  if (!index) {
    index = new SpatialIndex({ pageDimensions });
    const pageMarkups = markups.filter((m) => m.pageIndex === pageIndex);
    index.build(pageMarkups, pageDimensions);
    pageMap.set(pageIndex, index);
  }

  return index;
}
