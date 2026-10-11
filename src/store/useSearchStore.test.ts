import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from './useSearchStore';
import { SearchMatch } from '../core/search/textSearch';

describe('useSearchStore', () => {
  beforeEach(() => {
    useSearchStore.getState().clearSearch();
    useSearchStore.setState({
      isOpen: false,
      caseSensitive: false,
      wholeWord: false,
    });
  });

  const mockMatches: SearchMatch[] = [
    {
      pageIndex: 0,
      matchIndex: 0,
      pageMatchIndex: 0,
      text: 'Viga',
      rects: [{ x: 0.1, y: 0.2, width: 0.05, height: 0.02 }],
    },
    {
      pageIndex: 1,
      matchIndex: 1,
      pageMatchIndex: 0,
      text: 'Viga',
      rects: [{ x: 0.3, y: 0.4, width: 0.05, height: 0.02 }],
    },
  ];

  it('inicializa con estado vacío y cerrado', () => {
    const state = useSearchStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe('');
    expect(state.matches).toEqual([]);
    expect(state.activeMatchIndex).toBe(-1);
  });

  it('establece coincidencias y activa la primera por defecto', () => {
    useSearchStore.getState().setMatches(mockMatches);
    const state = useSearchStore.getState();
    expect(state.matches).toHaveLength(2);
    expect(state.activeMatchIndex).toBe(0);
  });

  it('navega cíclicamente con nextMatch y prevMatch', () => {
    useSearchStore.getState().setMatches(mockMatches);

    useSearchStore.getState().nextMatch();
    expect(useSearchStore.getState().activeMatchIndex).toBe(1);

    // Vuelve al inicio (wrap around)
    useSearchStore.getState().nextMatch();
    expect(useSearchStore.getState().activeMatchIndex).toBe(0);

    // Va hacia atrás al último
    useSearchStore.getState().prevMatch();
    expect(useSearchStore.getState().activeMatchIndex).toBe(1);
  });

  it('conmuta opciones caseSensitive y wholeWord', () => {
    useSearchStore.getState().toggleCaseSensitive();
    expect(useSearchStore.getState().caseSensitive).toBe(true);

    useSearchStore.getState().toggleWholeWord();
    expect(useSearchStore.getState().wholeWord).toBe(true);
  });

  it('limpia las coincidencias y resetea el índice al cerrar', () => {
    useSearchStore.getState().setIsOpen(true);
    useSearchStore.getState().setQuery('Viga');
    useSearchStore.getState().setMatches(mockMatches);

    expect(useSearchStore.getState().matches).toHaveLength(2);

    useSearchStore.getState().setIsOpen(false);
    expect(useSearchStore.getState().query).toBe('');
    expect(useSearchStore.getState().matches).toHaveLength(0);
    expect(useSearchStore.getState().activeMatchIndex).toBe(-1);
  });
});
