import { describe, it, expect } from 'vitest';
import type { Markup } from '../../types/markup';
import { applyFormat, canCopyFormat, canPasteFormat, captureFormat } from './formatPainter';

const mk = (type: Markup['type'], style: Partial<Markup['style']> = {}, extra: Partial<Markup> = {}): Markup =>
  ({
    id: type,
    type,
    pageIndex: 0,
    points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
    style: { strokeColor: '#000000', fillColor: 'transparent', strokeWidth: 1, opacity: 1, ...style },
    author: 'a',
    createdAt: '',
    updatedAt: '',
    status: 'pending',
    ...extra,
  }) as Markup;

describe('Format Painter (ADR-0109)', () => {
  const source = mk('rectangle', {
    strokeColor: '#e02424',
    fillColor: '#ffeb3b',
    strokeWidth: 4,
    opacity: 0.5,
    dashArray: [6, 3],
    hatch: 'brick',
    lineEndingEnd: 'openArrow',
    fontSize: 14,
  });

  it('pasa color, relleno, grosor, opacidad y trazo, y deja la forma y el contenido del destino', () => {
    const target = mk('polygon', {}, { text: 'nota', points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.6, y: 0.6 }] });
    const out = applyFormat(target, captureFormat(source), 'ahora');
    expect(out.style).toMatchObject({ strokeColor: '#e02424', fillColor: '#ffeb3b', strokeWidth: 4, opacity: 0.5, dashArray: [6, 3], fontSize: 14 });
    expect(out.type).toBe('polygon');
    expect(out.text).toBe('nota');
    expect(out.points).toEqual(target.points);
    expect(out.updatedAt).toBe('ahora');
  });

  it('el hatch solo pasa a formas cerradas y los extremos de línea solo a líneas', () => {
    const fmt = captureFormat(source);
    expect(applyFormat(mk('polygon'), fmt, 't').style.hatch).toBe('brick');
    expect(applyFormat(mk('line'), fmt, 't').style.hatch).toBeUndefined();
    expect(applyFormat(mk('line'), fmt, 't').style.lineEndingEnd).toBe('openArrow');
    expect(applyFormat(mk('rectangle'), fmt, 't').style.lineEndingEnd).toBeUndefined();
  });

  it('el formato copiado no cambia si después se edita la marca de origen', () => {
    const fmt = captureFormat(source);
    source.style.dashArray![0] = 99;
    expect(fmt.style.dashArray).toEqual([6, 3]);
    source.style.dashArray![0] = 6;
  });

  it('sellos, imágenes y marcas bloqueadas no se pintan ni sirven de origen', () => {
    expect(canCopyFormat(mk('stamp'))).toBe(false);
    expect(canPasteFormat(mk('image'))).toBe(false);
    expect(canPasteFormat(mk('rectangle', {}, { locked: true }))).toBe(false);
    expect(canPasteFormat(mk('rectangle'))).toBe(true);
  });

  it('el formato de texto (negrita, cursiva, alineación) acompaña al estilo', () => {
    const withText = mk('callout', { textColor: '#00f' }, { textFormat: { bold: true, align: 'center' } });
    const out = applyFormat(mk('text'), captureFormat(withText), 't');
    expect(out.textFormat).toEqual({ bold: true, align: 'center' });
    expect(out.style.textColor).toBe('#00f');
  });
});
