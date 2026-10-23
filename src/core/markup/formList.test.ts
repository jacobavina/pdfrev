import { describe, it, expect } from 'vitest';
import type { Markup } from '../../types/markup';
import { fieldValueText, formCsvRows, formProgress, formRows, isFieldFilled, isFillableField, nextEmptyField } from './formList';

const field = (id: string, pageIndex: number, y: number, custom: Record<string, string | number>, extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'formField', pageIndex, points: [{ x: 0.1, y }, { x: 0.4, y: y + 0.05 }], style: { strokeColor: '#00f', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending', customFields: custom, ...extra }) as Markup;

describe('Forms: lista de campos de formulario (ADR-0121)', () => {
  const all = [
    field('t2', 1, 0.5, { fieldType: 'text', fieldName: 'Text10', fieldValue: 'hola' }),
    field('t1', 0, 0.3, { fieldType: 'text', fieldName: 'Text2' }),
    field('c1', 0, 0.1, { fieldType: 'checkbox', fieldName: 'Check1', fieldValue: 'Yes' }),
    field('c2', 0, 0.2, { fieldType: 'checkbox', fieldName: 'Check2', fieldValue: 'Off' }),
    field('d1', 1, 0.1, { fieldType: 'dropdown', fieldName: 'Pais', fieldValue: 'México', fieldOptions: 'México\nPerú' }),
    field('b1', 0, 0.6, { fieldType: 'button', fieldName: 'Enviar' }),
    field('s1', 0, 0.7, { fieldType: 'signature', fieldName: 'Firma1' }),
    field('h', 0, 0.8, { fieldType: 'text', fieldName: 'Oculto' }, { hidden: true }),
    { ...field('x', 0, 0.9, {}), type: 'rectangle' } as Markup,
  ];

  it('solo cuentan los campos que se rellenan: ni botones ni firmas ni marcas ocultas ni otras marcas', () => {
    expect(isFillableField(all[5])).toBe(false);
    expect(isFillableField(all[6])).toBe(false);
    expect(isFillableField(all[0])).toBe(true);
    expect(formRows(all).map((r) => r.id)).toEqual(['c1', 'c2', 't1', 'd1', 't2']);
  });

  it('el valor es el texto, la opción elegida o Checked / Unchecked', () => {
    expect(fieldValueText(all[0])).toBe('hola');
    expect(fieldValueText(all[2])).toBe('Checked');
    expect(fieldValueText(all[3])).toBe('Unchecked');
    expect(fieldValueText(all[1])).toBe('');
    expect(isFieldFilled(all[1])).toBe(false);
    expect(isFieldFilled(field('s', 0, 0, { fieldType: 'text', fieldValue: '   ' }))).toBe(false);
    expect(isFieldFilled(all[4])).toBe(true);
  });

  it('las opciones de listas y desplegables llegan a la fila', () => {
    expect(formRows(all).find((r) => r.id === 'd1')).toMatchObject({ options: ['México', 'Perú'], type: 'dropdown', typeLabel: 'Dropdown', value: 'México' });
  });

  it('el siguiente campo vacío sigue al actual, da la vuelta al final y salta los bloqueados', () => {
    const rows = formRows(all);
    expect(nextEmptyField(rows)?.id).toBe('c2');
    expect(nextEmptyField(rows, 'c2')?.id).toBe('t1');
    expect(nextEmptyField(rows, 't1')?.id).toBe('c2'); // da la vuelta
    expect(nextEmptyField(formRows([field('a', 0, 0.1, { fieldType: 'text', fieldName: 'A', fieldValue: 'x' })]))).toBeNull();
    const locked = formRows([field('l', 0, 0.1, { fieldType: 'text', fieldName: 'L' }, { locked: true })]);
    expect(nextEmptyField(locked)).toBeNull();
  });

  it('el avance cuenta los campos rellenos', () => {
    expect(formProgress(formRows(all))).toEqual({ total: 5, filled: 3 });
  });

  it('el CSV lleva página, nombre, tipo y valor (Yes/Off en las casillas)', () => {
    const csv = formCsvRows(formRows(all), (i) => `Page ${i + 1}`);
    expect(csv[0]).toEqual(['Page', 'Name', 'Type', 'Value']);
    expect(csv[1]).toEqual(['Page 1', 'Check1', 'Check Box', 'Yes']);
    expect(csv[2]).toEqual(['Page 1', 'Check2', 'Check Box', 'Off']);
    expect(csv.at(-1)).toEqual(['Page 2', 'Text10', 'Text Box', 'hola']);
  });
});
