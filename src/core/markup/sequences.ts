/**
 * Secuencias numeradas (ADR-0094). Puro: formatea el número de orden de una marca de secuencia.
 */

export type SequenceFormat = '1' | 'A' | 'a' | 'I' | 'i';

export const SEQUENCE_FORMATS: { value: SequenceFormat; label: string }[] = [
  { value: '1', label: '1, 2, 3' },
  { value: 'A', label: 'A, B, C' },
  { value: 'a', label: 'a, b, c' },
  { value: 'I', label: 'I, II, III' },
  { value: 'i', label: 'i, ii, iii' },
];

export interface SequenceConfig {
  format: SequenceFormat;
  prefix: string;
  suffix: string;
  /** Número del siguiente marcador (base 1). */
  next: number;
}

/** Tamaño del cuadro de un marcador de secuencia, en pt de página. */
export const SEQUENCE_BOX_PT = { width: 30, height: 22 };

export const DEFAULT_SEQUENCE: SequenceConfig = { format: '1', prefix: '', suffix: '', next: 1 };

/** A, B, …, Z, AA, AB, … (numeración de columnas de hoja de cálculo). */
export function toLetters(n: number, upper = true): string {
  let v = Math.max(1, Math.floor(n));
  let out = '';
  while (v > 0) {
    v -= 1;
    out = String.fromCharCode(65 + (v % 26)) + out;
    v = Math.floor(v / 26);
  }
  return upper ? out : out.toLowerCase();
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(n: number, upper = true): string {
  let v = Math.max(1, Math.min(3999, Math.floor(n)));
  let out = '';
  for (const [value, sym] of ROMAN) {
    while (v >= value) {
      out += sym;
      v -= value;
    }
  }
  return upper ? out : out.toLowerCase();
}

/** Texto del marcador número `n` con el formato, prefijo y sufijo de la secuencia. */
export function formatSequence(n: number, cfg: Pick<SequenceConfig, 'format' | 'prefix' | 'suffix'>): string {
  let body: string;
  switch (cfg.format) {
    case 'A':
      body = toLetters(n, true);
      break;
    case 'a':
      body = toLetters(n, false);
      break;
    case 'I':
      body = toRoman(n, true);
      break;
    case 'i':
      body = toRoman(n, false);
      break;
    default:
      body = String(Math.max(1, Math.floor(n)));
  }
  return `${cfg.prefix}${body}${cfg.suffix}`;
}
