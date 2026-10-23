import type { Markup } from '../../types/markup';
import { fieldOptions, fieldTypeDef, fieldTypeOf, isFieldChecked, type FieldType } from './formFields';

/**
 * Lista de campos de formulario (panel Forms, ADR-0121). Los campos de firma se listan en el panel Signatures. Puro.
 */

export interface FormRow {
  id: string;
  pageIndex: number;
  type: FieldType;
  typeLabel: string;
  name: string;
  /** Valor en texto: lo escrito, la opción elegida o "Checked" / "Unchecked". */
  value: string;
  options: string[];
  /** Valor de exportación de un botón de opción. */
  radioValue: string;
  filled: boolean;
  locked: boolean;
}

/** Los tipos con valor que el usuario rellena (un botón no lo tiene; la firma tiene su panel). */
const VALUED: FieldType[] = ['text', 'checkbox', 'radio', 'listbox', 'dropdown'];

export const isFillableField = (m: Markup): boolean => m.type === 'formField' && VALUED.includes(fieldTypeOf(m));

/** Valor visible de un campo. */
export function fieldValueText(m: Markup): string {
  const type = fieldTypeOf(m);
  if (type === 'checkbox' || type === 'radio') return isFieldChecked(m) ? 'Checked' : 'Unchecked';
  const v = m.customFields?.fieldValue;
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/** Un campo está relleno si tiene texto, una opción elegida o está marcado. */
export function isFieldFilled(m: Markup): boolean {
  const type = fieldTypeOf(m);
  if (type === 'checkbox' || type === 'radio') return isFieldChecked(m);
  return fieldValueText(m).trim() !== '';
}

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/** Los campos que se rellenan, por página, nombre (orden natural) y posición. */
export function formRows(markups: Markup[]): FormRow[] {
  const top = (m: Markup) => (m.points.length > 0 ? Math.min(...m.points.map((p) => p.y)) : 0);
  return markups
    .filter((m) => isFillableField(m) && !m.hidden)
    .sort((a, b) => a.pageIndex - b.pageIndex || top(a) - top(b) || natural(String(a.customFields?.fieldName ?? ''), String(b.customFields?.fieldName ?? '')) || a.id.localeCompare(b.id))
    .map((m) => ({
      id: m.id,
      pageIndex: m.pageIndex,
      type: fieldTypeOf(m),
      typeLabel: fieldTypeDef(fieldTypeOf(m)).label,
      name: String(m.customFields?.fieldName ?? ''),
      value: fieldValueText(m),
      options: fieldOptions(m),
      radioValue: String(m.customFields?.radioValue ?? ''),
      filled: isFieldFilled(m),
      locked: Boolean(m.locked),
    }));
}

/** El siguiente campo vacío después de `afterId` (o desde el principio), dando la vuelta al final; null si todo está relleno. */
export function nextEmptyField(rows: FormRow[], afterId?: string | null): FormRow | null {
  const empty = rows.filter((r) => !r.filled && !r.locked);
  if (empty.length === 0) return null;
  const at = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
  const following = rows.slice(at + 1).find((r) => !r.filled && !r.locked);
  return following ?? empty[0];
}

export interface FormProgress {
  total: number;
  filled: number;
}

export const formProgress = (rows: FormRow[]): FormProgress => ({ total: rows.length, filled: rows.filter((r) => r.filled).length });

/** Filas del CSV con los valores del formulario. */
export function formCsvRows(rows: FormRow[], levelName: (pageIndex: number) => string): string[][] {
  return [['Page', 'Name', 'Type', 'Value'], ...rows.map((r) => [levelName(r.pageIndex), r.name, r.typeLabel, r.type === 'checkbox' || r.type === 'radio' ? (r.filled ? r.radioValue || 'Yes' : 'Off') : r.value])];
}
