import React from 'react';
import { COUNT_SYMBOLS, CountSymbolId, countSymbolsPath } from '../../core/markup/countSymbols';
import type { IconPickerOption } from './IconPicker';

/** Opciones del símbolo de Count (ADR-0059), en el orden de Revu. */
export const COUNT_SYMBOL_OPTIONS: IconPickerOption<CountSymbolId>[] = COUNT_SYMBOLS.map((s) => ({ value: s.id, label: s.label }));

/** Muestra de un símbolo de Count con la misma geometría que la marca. */
export const CountSymbolPreview: React.FC<{ id: CountSymbolId }> = ({ id }) => {
  const sym = countSymbolsPath(id, [{ x: 9, y: 9 }], 14);
  return (
    <svg width={18} height={18} aria-hidden="true" data-count-symbol={id}>
      <path d={sym.d} fill="none" stroke="currentColor" strokeWidth={Math.max(1.2, sym.width)} strokeLinejoin="miter" />
    </svg>
  );
};
