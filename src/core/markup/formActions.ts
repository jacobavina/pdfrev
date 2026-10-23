import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { showToast } from '../../services/toastService';
import { formCsvRows, formRows, nextEmptyField, type FormRow } from './formList';

/**
 * Acciones del panel Forms (ADR-0121): rellenar un campo, vaciarlos, ir al siguiente vacío y exportar los valores. Cada
 * cambio es un paso de historial.
 */

/** Cambia el valor de un campo; en un botón de opción, deja marcado solo ese dentro de su grupo. */
export function setFieldValue(row: Pick<FormRow, 'id' | 'type' | 'name'>, value: string): void {
  const store = useMarkupStore.getState();
  if (row.type === 'radio' && value === 'Yes') {
    const others = store.markups.filter((m) => m.id !== row.id && m.type === 'formField' && m.customFields?.fieldType === 'radio' && m.customFields?.fieldName === row.name && m.customFields?.fieldValue === 'Yes').map((m) => m.id);
    if (others.length > 0) store.applyPropertiesToMarkups(others, { customFields: { fieldValue: 'Off' } }, `Clear ${row.name}`);
  }
  store.applyPropertiesToMarkups([row.id], { customFields: { fieldValue: value } }, row.type === 'text' ? 'Fill text field' : `Set ${row.name}`);
}

/** Vacía todos los campos rellenables que no estén bloqueados (se deshace de una vez por campo; el aviso cuenta). */
export function clearAllFields(): number {
  const store = useMarkupStore.getState();
  const rows = formRows(store.markups).filter((r) => r.filled && !r.locked);
  if (rows.length === 0) {
    showToast('The form is already empty.');
    return 0;
  }
  const texts = rows.filter((r) => r.type !== 'checkbox' && r.type !== 'radio').map((r) => r.id);
  const marks = rows.filter((r) => r.type === 'checkbox' || r.type === 'radio').map((r) => r.id);
  if (texts.length > 0) store.applyPropertiesToMarkups(texts, { customFields: { fieldValue: '' } }, 'Clear form fields');
  if (marks.length > 0) store.applyPropertiesToMarkups(marks, { customFields: { fieldValue: 'Off' } }, 'Clear form checks');
  showToast(`${rows.length} field${rows.length === 1 ? '' : 's'} cleared. Undo brings them back.`);
  return rows.length;
}

/** Va al siguiente campo vacío (o al primero) y lo selecciona. */
export function goToNextEmptyField(afterId?: string | null): FormRow | null {
  const rows = formRows(useMarkupStore.getState().markups);
  const next = nextEmptyField(rows, afterId);
  if (!next) {
    showToast(rows.length === 0 ? 'This document has no form fields.' : 'Every field is filled in.');
    return null;
  }
  useDocumentStore.getState().setCurrentPage(next.pageIndex);
  useMarkupStore.getState().setSelectedMarkupIds([next.id]);
  return next;
}

/** Guarda los valores del formulario como CSV. */
export async function exportFormCsv(): Promise<void> {
  const rows = formRows(useMarkupStore.getState().markups);
  if (rows.length === 0) {
    showToast('This document has no form fields.');
    return;
  }
  const { pageLabels, fileName } = useDocumentStore.getState();
  const { escapeCsvField, saveExportFileWithDialog } = await import('../../services/exportService');
  const table = formCsvRows(rows, (i) => (pageLabels?.[i] ? String(pageLabels[i]) : `Page ${i + 1}`));
  const text = table.map((r) => r.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
  await saveExportFileWithDialog(`${(fileName || 'document').replace(/\.pdf$/i, '')}_form.csv`, 'csv', bytes);
}
