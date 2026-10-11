import { describe, it, expect } from 'vitest';
import {
  findMatchesInPageItems,
  indexGlobalMatches,
  calculateTextItemRect,
  normalizeSearchString,
  TextItemData,
} from './textSearch';

describe('Text Search Engine (Paquete 5)', () => {
  const pageDims = { width: 600, height: 800 };

  const sampleItems: TextItemData[] = [
    {
      str: 'PLANO DE ESTRUCTURAS - NIVEL 2',
      transform: [12, 0, 0, 12, 50, 750],
      width: 300,
      height: 12,
    },
    {
      str: 'Detalle viga V-101 y columnas C1, C2',
      transform: [10, 0, 0, 10, 50, 700],
      width: 250,
      height: 10,
    },
    {
      str: 'Revisión estructural completada',
      transform: [10, 0, 0, 10, 50, 650],
      width: 200,
      height: 10,
    },
  ];

  it('normaliza cadenas en minúsculas cuando caseSensitive es falso', () => {
    expect(normalizeSearchString('PlAnO 123', false)).toBe('plano 123');
    expect(normalizeSearchString('PlAnO 123', true)).toBe('PlAnO 123');
  });

  it('encuentra coincidencias insensibles a mayúsculas por defecto', () => {
    const matches = findMatchesInPageItems(0, sampleItems, 'plano', pageDims);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('PLANO');
    expect(matches[0].pageIndex).toBe(0);
    expect(matches[0].pageMatchIndex).toBe(0);
    expect(matches[0].rects[0].x).toBeCloseTo(50 / 600, 3);
  });

  it('respeta la opción caseSensitive cuando está activa', () => {
    const noMatch = findMatchesInPageItems(0, sampleItems, 'plano', pageDims, {
      caseSensitive: true,
    });
    expect(noMatch).toHaveLength(0);

    const matchExact = findMatchesInPageItems(0, sampleItems, 'PLANO', pageDims, {
      caseSensitive: true,
    });
    expect(matchExact).toHaveLength(1);
    expect(matchExact[0].text).toBe('PLANO');
  });

  it('encuentra múltiples ocurrencias en diferentes ítems de texto', () => {
    const matches = findMatchesInPageItems(0, sampleItems, 'estructur', pageDims);
    // Aparece en 'ESTRUCTURAS' (ítem 0) y 'estructural' (ítem 2)
    expect(matches).toHaveLength(2);
    expect(matches[0].text).toBe('ESTRUCTUR');
    expect(matches[1].text).toBe('estructur');
  });

  it('filtra correctamente palabras completas cuando matchWholeWord es verdadero', () => {
    // 'viga' aparece como palabra completa
    const vigaMatch = findMatchesInPageItems(0, sampleItems, 'viga', pageDims, {
      matchWholeWord: true,
    });
    expect(vigaMatch).toHaveLength(1);
    expect(vigaMatch[0].text).toBe('viga');

    // 'vig' es un prefijo, no palabra completa
    const vigNoMatch = findMatchesInPageItems(0, sampleItems, 'vig', pageDims, {
      matchWholeWord: true,
    });
    expect(vigNoMatch).toHaveLength(0);
  });

  it('calcula coordenadas normalizadas válidas dentro del rango [0, 1]', () => {
    const item: TextItemData = {
      str: 'Cálculo de Cotas',
      transform: [10, 0, 0, 10, 100, 400],
      width: 200,
      height: 10,
    };
    const rect = calculateTextItemRect(item, 0, item.str.length, pageDims);

    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x).toBeLessThanOrEqual(1);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(1);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1);
  });

  it('asigna correlatividad global de índices a través de múltiples páginas', () => {
    const page0Matches = findMatchesInPageItems(0, sampleItems, 'estructur', pageDims); // 2 matches
    const page1Matches = findMatchesInPageItems(1, sampleItems, 'viga', pageDims); // 1 match

    const global = indexGlobalMatches([page0Matches, page1Matches]);
    expect(global).toHaveLength(3);
    expect(global[0].matchIndex).toBe(0);
    expect(global[0].pageIndex).toBe(0);
    expect(global[1].matchIndex).toBe(1);
    expect(global[1].pageIndex).toBe(0);
    expect(global[2].matchIndex).toBe(2);
    expect(global[2].pageIndex).toBe(1);
  });

  it('devuelve array vacío ante búsquedas vacías o con espacios', () => {
    expect(findMatchesInPageItems(0, sampleItems, '', pageDims)).toEqual([]);
    expect(findMatchesInPageItems(0, sampleItems, '   ', pageDims)).toEqual([]);
  });
});
