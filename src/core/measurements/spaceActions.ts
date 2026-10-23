import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { showToast } from '../../services/toastService';
import { canBeSpace, isSpace, nextSpaceName, spaceRows, spacesCsvRows, spaceInfo, withSpace, withoutSpace, type SpaceInfo } from './spaces';

/**
 * Acciones de Spaces (ADR-0118): convertir mediciones de área en espacios, cambiar su número y nombre, volver a
 * medición normal y exportar la tabla. Cada una es un solo paso de historial.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Las mediciones de área seleccionadas que todavía no son espacio (y se pueden cambiar). */
export function selectedAreasForSpaces(): string[] {
  const { markups, selectedMarkupIds } = useMarkupStore.getState();
  return markups.filter((m) => selectedMarkupIds.includes(m.id) && canBeSpace(m) && !isSpace(m) && !m.locked).map((m) => m.id);
}

/** Convierte las áreas seleccionadas en espacios con nombres "Space N" que luego se renombran en el panel. */
export function makeSpacesFromSelection(): number {
  const { markups } = useMarkupStore.getState();
  const ids = new Set(selectedAreasForSpaces());
  if (ids.size === 0) {
    showToast('Select one or more Area measurements first. Draw them with the Area tool.');
    return 0;
  }
  const now = new Date().toISOString();
  const taken: string[] = [];
  const updated = markups
    .filter((m) => ids.has(m.id))
    .map((m) => {
      // Si la medición ya llevaba una etiqueta, esa es el nombre
      const label = typeof m.customFields?.measureLabel === 'string' ? m.customFields.measureLabel.trim() : '';
      const name = label || nextSpaceName(markups, taken);
      taken.push(name);
      return withSpace(m, { name, number: '' }, now);
    });
  const n = useMarkupStore.getState().replaceMarkups(updated, `Make ${plural(updated.length, 'space', 'spaces')}`);
  if (n > 0) showToast(`${plural(n, 'space', 'spaces')} created. Name and number them in the Spaces panel.`);
  return n;
}

/** Cambia el número y el nombre de un espacio. */
export function updateSpace(id: string, info: SpaceInfo): void {
  const m = useMarkupStore.getState().markups.find((x) => x.id === id);
  if (!m || !isSpace(m)) return;
  const current = spaceInfo(m);
  if (current.name === info.name.trim() && current.number === info.number.trim()) return;
  useMarkupStore.getState().replaceMarkups([withSpace(m, info, new Date().toISOString())], 'Edit space');
}

/** Quita la condición de espacio (la medición de área se queda). */
export function removeSpaces(ids: string[]): number {
  const now = new Date().toISOString();
  const updated = useMarkupStore
    .getState()
    .markups.filter((m) => ids.includes(m.id) && isSpace(m))
    .map((m) => withoutSpace(m, now));
  return useMarkupStore.getState().replaceMarkups(updated, `Remove ${plural(updated.length, 'space', 'spaces')}`);
}

/** Guarda la tabla de espacios como CSV (o la descarga en el navegador). */
export async function exportSpacesCsv(): Promise<void> {
  const rows = spaceRows(useMarkupStore.getState().markups);
  if (rows.length === 0) {
    showToast('There are no spaces to export.');
    return;
  }
  const { pageLabels, fileName } = useDocumentStore.getState();
  const { escapeCsvField, saveExportFileWithDialog } = await import('../../services/exportService');
  const table = spacesCsvRows(rows, (i) => (pageLabels?.[i] ? String(pageLabels[i]) : `Page ${i + 1}`));
  const text = table.map((r) => r.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
  // BOM UTF-8 para que Excel lea bien los acentos
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
  const base = (fileName || 'document').replace(/\.pdf$/i, '');
  await saveExportFileWithDialog(`${base}_spaces.csv`, 'csv', bytes);
}
