import { describe, it, expect } from 'vitest';
import { parsePdfDateToIso, formatDateForDisplay, parseDateToTimestamp } from './dateUtils';

describe('dateUtils (ISO 32000-1 §7.9.4 & ISO 8601)', () => {
  const fallback = '2026-01-01T00:00:00.000Z';

  describe('parsePdfDateToIso', () => {
    it('convierte fecha PDF en UTC (Z)', () => {
      expect(parsePdfDateToIso('D:20261018141530Z', fallback)).toBe('2026-10-18T14:15:30.000Z');
    });

    it('convierte fecha PDF con paréntesis externos (D:...)', () => {
      expect(parsePdfDateToIso('(D:20261018141530Z)', fallback)).toBe('2026-10-18T14:15:30.000Z');
    });

    it('convierte fecha PDF con huso horario negativo (-05\'00\') a UTC exacto', () => {
      // 14:15:30 en UTC-5 equivale a 19:15:30 en UTC
      expect(parsePdfDateToIso("D:20261018141530-05'00'", fallback)).toBe('2026-10-18T19:15:30.000Z');
    });

    it('convierte fecha PDF con huso horario positivo (+02\'00\') a UTC exacto', () => {
      // 14:15:30 en UTC+2 equivale a 12:15:30 en UTC
      expect(parsePdfDateToIso("D:20261018141530+02'00'", fallback)).toBe('2026-10-18T12:15:30.000Z');
    });

    it('convierte fecha PDF truncada solo año-mes-día (D:20261018)', () => {
      expect(parsePdfDateToIso('D:20261018', fallback)).toBe('2026-10-18T00:00:00.000Z');
    });

    it('respeta cadenas ISO estándar ya formateadas', () => {
      expect(parsePdfDateToIso('2026-10-18T14:15:30.000Z', fallback)).toBe('2026-10-18T14:15:30.000Z');
    });

    it('devuelve fallback en cadenas vacías, nulas o no válidas', () => {
      expect(parsePdfDateToIso('', fallback)).toBe(fallback);
      expect(parsePdfDateToIso(null, fallback)).toBe(fallback);
      expect(parsePdfDateToIso('not_a_date', fallback)).toBe(fallback);
    });
  });

  describe('formatDateForDisplay', () => {
    it('formatea fechas válidas sin producir Invalid Date', () => {
      const res = formatDateForDisplay('2026-10-18T14:15:30.000Z');
      expect(res).not.toContain('Invalid Date');
      expect(res).toContain('2026');
    });

    it('formatea fechas PDF D:... sin error', () => {
      const res = formatDateForDisplay('D:20261018141530Z');
      expect(res).not.toContain('Invalid Date');
      expect(res).toContain('2026');
    });

    it('devuelve raya para valores nulos o inválidos', () => {
      expect(formatDateForDisplay(null)).toBe('—');
      expect(formatDateForDisplay('')).toBe('—');
      expect(formatDateForDisplay('garbage')).toBe('—');
    });
  });

  describe('parseDateToTimestamp', () => {
    it('calcula timestamps válidos para ordenación', () => {
      const t1 = parseDateToTimestamp('2026-10-18T10:00:00.000Z');
      const t2 = parseDateToTimestamp('2026-10-18T11:00:00.000Z');
      expect(t2).toBeGreaterThan(t1);
    });

    it('calcula timestamps para cadenas PDF D:...', () => {
      const t = parseDateToTimestamp('D:20261018100000Z');
      expect(t).toBeGreaterThan(0);
    });

    it('devuelve 0 para fechas inválidas', () => {
      expect(parseDateToTimestamp(null)).toBe(0);
      expect(parseDateToTimestamp('invalid')).toBe(0);
    });
  });
});
