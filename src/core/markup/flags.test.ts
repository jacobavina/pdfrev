import { describe, it, expect } from 'vitest';
import type { Markup } from '../../types/markup';
import { FLAG_FIELD, flagAnchor, flagTitle, flaggedMarkups, isFlagged, withFlag } from './flags';

const mk = (id: string, pageIndex: number, y: number, extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'rectangle', pageIndex, points: [{ x: 0.2, y }, { x: 0.5, y: y + 0.1 }], style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending', ...extra }) as Markup;

describe('Flags: banderas en las marcas (ADR-0117)', () => {
  it('poner y quitar la bandera no deja rastro en las marcas sin otros campos', () => {
    const m = mk('a', 0, 0.1);
    expect(isFlagged(m)).toBe(false);
    const on = withFlag(m, true, 't1');
    expect(isFlagged(on)).toBe(true);
    expect(on.customFields).toEqual({ [FLAG_FIELD]: 1 });
    expect(on.updatedAt).toBe('t1');
    const off = withFlag(on, false, 't2');
    expect(isFlagged(off)).toBe(false);
    expect(off.customFields).toBeUndefined();
  });

  it('la bandera respeta los demás campos propios de la marca', () => {
    const m = mk('a', 0, 0.1, { customFields: { arcStep: 12, captionOffsetX: 3 } });
    const on = withFlag(m, true, 't');
    expect(on.customFields).toEqual({ arcStep: 12, captionOffsetX: 3, [FLAG_FIELD]: 1 });
    expect(withFlag(on, false, 't').customFields).toEqual({ arcStep: 12, captionOffsetX: 3 });
  });

  it('solo cuenta el valor 1: un campo con otro valor o texto no es una bandera', () => {
    expect(isFlagged(mk('a', 0, 0, { customFields: { flagged: 0 } }))).toBe(false);
    expect(isFlagged(mk('b', 0, 0, { customFields: { flagged: 'x' } }))).toBe(false);
    expect(isFlagged(mk('c', 0, 0, { customFields: { flagged: '1' } }))).toBe(true); // al leer el PDF puede volver como texto
  });

  it('las marcas con bandera salen por página y posición vertical, sin las ocultas', () => {
    const list = flaggedMarkups([
      withFlag(mk('b', 1, 0.5), true, ''),
      withFlag(mk('a', 0, 0.8), true, ''),
      mk('sin', 0, 0.1),
      withFlag(mk('c', 1, 0.1), true, ''),
      withFlag({ ...mk('h', 0, 0.2), hidden: true }, true, ''),
    ]);
    expect(list.map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('el título es el comentario recortado o el tipo con su medida', () => {
    expect(flagTitle(mk('a', 0, 0, { text: '  Revisar   la\nlosa  ' }))).toBe('Revisar la losa');
    expect(flagTitle(mk('b', 0, 0, { text: 'x'.repeat(200) })).endsWith('…')).toBe(true);
    expect(flagTitle(mk('c', 0, 0, { type: 'length', measurement: { value: 4, unit: 'm', formatted: '4.00 m' } }))).toMatch(/· 4\.00 m$/);
    expect(flagTitle(mk('d', 0, 0))).toBeTruthy();
  });

  it('la bandera se dibuja en la esquina superior derecha de la marca, directrices incluidas', () => {
    expect(flagAnchor(mk('a', 0, 0.3))).toEqual({ x: 0.5, y: 0.3 });
    expect(flagAnchor({ points: [{ x: 0.2, y: 0.5 }], leaders: [[{ x: 0.9, y: 0.1 }]] })).toEqual({ x: 0.9, y: 0.1 });
    expect(flagAnchor({ points: [] })).toBeNull();
  });
});
