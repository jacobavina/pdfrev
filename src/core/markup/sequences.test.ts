import { describe, it, expect } from 'vitest';
import { formatSequence, toLetters, toRoman } from './sequences';

describe('Secuencias numeradas (ADR-0094)', () => {
  it('formatea números, letras y romanos con prefijo y sufijo', () => {
    expect(formatSequence(3, { format: '1', prefix: '', suffix: '' })).toBe('3');
    expect(formatSequence(3, { format: 'A', prefix: '', suffix: '' })).toBe('C');
    expect(formatSequence(2, { format: 'a', prefix: '', suffix: '' })).toBe('b');
    expect(formatSequence(4, { format: 'I', prefix: '', suffix: '' })).toBe('IV');
    expect(formatSequence(9, { format: 'i', prefix: '', suffix: '' })).toBe('ix');
    expect(formatSequence(7, { format: '1', prefix: 'P-', suffix: '.' })).toBe('P-7.');
  });

  it('las letras continúan como columnas de hoja de cálculo y los romanos llegan a 3999', () => {
    expect([26, 27, 28, 52, 53, 702, 703].map((n) => toLetters(n))).toEqual(['Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(toRoman(1994)).toBe('MCMXCIV');
    expect(toRoman(3999)).toBe('MMMCMXCIX');
    expect(toRoman(5000)).toBe('MMMCMXCIX');
  });

  it('un número menor que 1 se trata como 1', () => {
    expect(formatSequence(0, { format: '1', prefix: '', suffix: '' })).toBe('1');
    expect(formatSequence(-3, { format: 'A', prefix: '', suffix: '' })).toBe('A');
  });
});
