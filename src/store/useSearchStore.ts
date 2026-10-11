import { create } from 'zustand';
import { SearchMatch } from '../core/search/textSearch';

interface SearchState {
  isOpen: boolean;
  query: string;
  isSearching: boolean;
  matches: SearchMatch[];
  activeMatchIndex: number;
  caseSensitive: boolean;
  wholeWord: boolean;

  setIsOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
  setMatches: (matches: SearchMatch[]) => void;
  setActiveMatchIndex: (index: number) => void;
  toggleCaseSensitive: () => void;
  toggleWholeWord: () => void;
  nextMatch: () => void;
  prevMatch: () => void;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  query: '',
  isSearching: false,
  matches: [],
  activeMatchIndex: -1,
  caseSensitive: false,
  wholeWord: false,

  setIsOpen: (open: boolean) => {
    set({ isOpen: open });
    if (!open) {
      get().clearSearch();
    }
  },

  setQuery: (query: string) => {
    set({ query });
  },

  setIsSearching: (isSearching: boolean) => {
    set({ isSearching });
  },

  setMatches: (matches: SearchMatch[]) => {
    set({
      matches,
      activeMatchIndex: matches.length > 0 ? 0 : -1,
      isSearching: false,
    });
  },

  setActiveMatchIndex: (index: number) => {
    const total = get().matches.length;
    if (total === 0) {
      set({ activeMatchIndex: -1 });
      return;
    }
    const safeIdx = (index + total) % total;
    set({ activeMatchIndex: safeIdx });
  },

  toggleCaseSensitive: () => {
    set((state) => ({ caseSensitive: !state.caseSensitive }));
  },

  toggleWholeWord: () => {
    set((state) => ({ wholeWord: !state.wholeWord }));
  },

  nextMatch: () => {
    const { matches, activeMatchIndex } = get();
    if (matches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matches.length;
    set({ activeMatchIndex: nextIdx });
  },

  prevMatch: () => {
    const { matches, activeMatchIndex } = get();
    if (matches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + matches.length) % matches.length;
    set({ activeMatchIndex: prevIdx });
  },

  clearSearch: () => {
    set({
      query: '',
      matches: [],
      activeMatchIndex: -1,
      isSearching: false,
    });
  },
}));
