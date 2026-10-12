/**
 * Capas del PDF (contenido opcional, ISO 32000-1 §8.11; ADR-0024), como el panel Layers de Revu: los planos de CAD
 * exportan cada capa como un grupo /OCG que se puede mostrar u ocultar. Puro: trabaja sobre la interfaz mínima del
 * OptionalContentConfig de PDF.js.
 */

export interface OptionalContentConfigLike {
  getOrder(): unknown[] | null;
  getGroup(id: string): { name?: string | null; visible?: boolean } | null;
  getGroups(): Record<string, { name?: string | null; visible?: boolean }> | null;
  isVisible?(group: unknown): boolean;
  setVisibility(id: string, visible?: boolean, preserveRB?: boolean): void;
}

export interface PdfLayerRow {
  /** Id del grupo /OCG; null para los rótulos de agrupación sin grupo propio. */
  id: string | null;
  name: string;
  depth: number;
  visible: boolean;
}

/** Filas del panel en el orden del documento (/Order), con su nivel de anidación. */
export function listPdfLayers(config: OptionalContentConfigLike | null | undefined): PdfLayerRow[] {
  if (!config) return [];
  const rows: PdfLayerRow[] = [];
  const seen = new Set<string>();
  const walk = (items: unknown[], depth: number) => {
    for (const item of items) {
      if (typeof item === 'string') {
        const g = config.getGroup(item);
        if (!g || seen.has(item)) continue;
        seen.add(item);
        rows.push({ id: item, name: g.name || `Layer ${rows.length + 1}`, depth, visible: g.visible !== false });
      } else if (Array.isArray(item)) {
        walk(item, depth + 1);
      } else if (item && typeof item === 'object' && 'order' in item) {
        const sub = item as { name?: string | null; order?: unknown[] };
        if (sub.name) rows.push({ id: null, name: sub.name, depth, visible: true });
        walk(sub.order ?? [], sub.name ? depth + 1 : depth);
      }
    }
  };
  walk(config.getOrder() ?? [], 0);
  // Grupos que no aparecen en /Order (algunos exportadores no lo escriben completo)
  const all = config.getGroups() ?? {};
  for (const [id, g] of Object.entries(all)) {
    if (!seen.has(id)) rows.push({ id, name: g.name || id, depth: 0, visible: g.visible !== false });
  }
  return rows;
}
