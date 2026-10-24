import { describe, it, expect } from 'vitest';
import { FEATURE_GUIDE, allGuideEntries, searchGuide } from './featureGuide';
import { ALL_TOOLS } from '../../components/shell/toolDefinitions';

describe('Guía de funciones (ADR-0100)', () => {
  it('cada función tiene título, resumen, pasos y dónde está, y los identificadores no se repiten', () => {
    const entries = allGuideEntries();
    expect(entries.length).toBeGreaterThan(40);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(new Set(FEATURE_GUIDE.map((s) => s.id)).size).toBe(FEATURE_GUIDE.length);
    for (const e of entries) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(e.summary.trim().length, e.id).toBeGreaterThan(20);
      expect(e.steps.length, e.id).toBeGreaterThan(0);
      expect(e.where.trim(), e.id).not.toBe('');
    }
  });

  it('todas las herramientas de la cinta con atajo aparecen en la guía, para que una herramienta nueva no se quede sin documentar', () => {
    const text = allGuideEntries()
      .map((e) => `${e.shortcut ?? ''} ${e.steps.join(' ')} ${e.title} ${e.where}`)
      .join(' \n ');
    const missing = ALL_TOOLS.filter((t) => t.shortcut).filter((t) => {
      const keys = t.shortcut!.split('+');
      // Un atajo de una letra debe aparecer como palabra suelta; uno con modificadores, completo
      return !(keys.length === 1 ? new RegExp(`(^|[^A-Za-z])${keys[0]}([^A-Za-z]|$)`).test(text) : text.includes(t.shortcut!));
    });
    expect(missing.map((t) => `${t.short} (${t.shortcut})`)).toEqual([]);
  });

  it('el buscador encuentra por título, por atajo, por menú y por palabras sueltas, y sin consulta devuelve todo', () => {
    expect(searchGuide('').length).toBe(allGuideEntries().length);
    expect(searchGuide('callout').some((e) => e.id === 'text')).toBe(true);
    expect(searchGuide('Shift+Alt+C').some((e) => e.id === 'count')).toBe(true);
    expect(searchGuide('View Profiles').some((e) => e.id === 'profiles')).toBe(true);
    expect(searchGuide('dynamic fill gap').map((e) => e.id)).toContain('dynamic-fill');
    expect(searchGuide('Reuse').some((e) => e.id === 'reuse-tools')).toBe(true);
    expect(searchGuide('More tools').some((e) => e.id === 'ribbon-and-status')).toBe(true);
    expect(searchGuide('Tools ▸ Stamp').some((e) => e.id === 'stamp')).toBe(true);
    expect(searchGuide('zzzz-no-existe')).toEqual([]);
  });
});
