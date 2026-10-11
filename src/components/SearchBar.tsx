import React, { useEffect, useRef, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, X, CaseSensitive, WholeWord } from 'lucide-react';
import { useSearchStore } from '../store/useSearchStore';
import { useDocumentStore } from '../store/useDocumentStore';
import {
  findMatchesInPageItems,
  indexGlobalMatches,
  TextItemData,
} from '../core/search/textSearch';

export const SearchBar: React.FC = () => {
  const {
    isOpen,
    query,
    isSearching,
    matches,
    activeMatchIndex,
    caseSensitive,
    wholeWord,
    setIsOpen,
    setQuery,
    setIsSearching,
    setMatches,
    nextMatch,
    prevMatch,
    toggleCaseSensitive,
    toggleWholeWord,
  } = useSearchStore();

  const { pdfDoc, numPages, setCurrentPage } = useDocumentStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus al abrir la barra
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen]);

  // Si cambia el activeMatchIndex, sincronizar la página activa en el visor
  useEffect(() => {
    if (activeMatchIndex >= 0 && activeMatchIndex < matches.length) {
      const match = matches[activeMatchIndex];
      setCurrentPage(match.pageIndex);
    }
  }, [activeMatchIndex, matches, setCurrentPage]);

  // Ejecución de búsqueda a través de todas las páginas del PDF
  const executeSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !pdfDoc || numPages <= 0) {
      setMatches([]);
      return;
    }

    setIsSearching(true);
    try {
      const pageMatchesPromises: Promise<ReturnType<typeof findMatchesInPageItems>>[] = [];

      for (let p = 0; p < numPages; p++) {
        pageMatchesPromises.push(
          (async (pageIdx) => {
            try {
              const page = await pdfDoc.getPage(pageIdx + 1);
              const textContent = await page.getTextContent();
              const viewport = page.getViewport({ scale: 1.0 });

              const items: TextItemData[] = (textContent.items as any[]).map((it) => ({
                str: it.str || '',
                transform: it.transform || [10, 0, 0, 10, 0, 0],
                width: it.width || 0,
                height: it.height || 0,
              }));

              return findMatchesInPageItems(
                pageIdx,
                items,
                trimmed,
                { width: viewport.width, height: viewport.height },
                { caseSensitive, matchWholeWord: wholeWord }
              );
            } catch {
              return [];
            }
          })(p)
        );
      }

      const resultsByPage = await Promise.all(pageMatchesPromises);
      const globalMatches = indexGlobalMatches(resultsByPage);
      setMatches(globalMatches);
    } catch (err) {
      console.error('[Search] Error buscando texto en PDF:', err);
      setMatches([]);
    } finally {
      setIsSearching(false);
    }
  }, [query, pdfDoc, numPages, caseSensitive, wholeWord, setMatches, setIsSearching]);

  // Búsqueda interactiva debounced o al pulsar Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else if (matches.length > 0) {
        nextMatch();
      } else {
        executeSearch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  if (!isOpen) return null;

  const countText = (() => {
    if (isSearching) return 'Buscando...';
    if (!query.trim()) return '';
    if (matches.length === 0) return '0 coincidencias';
    return `${activeMatchIndex + 1} de ${matches.length}`;
  })();

  return (
    <div
      data-testid="search-bar"
      className="absolute top-14 right-6 z-40 flex items-center space-x-1.5 rounded-lg border border-cad-border bg-cad-panel/95 px-3 py-1.5 text-xs text-gray-200 shadow-2xl backdrop-blur"
    >
      <Search size={14} className="text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        data-testid="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar texto en plano..."
        className="w-48 rounded border border-gray-600 bg-cad-dark px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
      />

      <span data-testid="search-count" className="min-w-[65px] font-mono text-[11px] text-gray-300">
        {countText}
      </span>

      <button
        type="button"
        data-testid="search-prev-btn"
        onClick={prevMatch}
        disabled={matches.length === 0}
        title="Coincidencia anterior (Shift+Enter)"
        className="rounded p-1 text-gray-300 hover:bg-cad-dark hover:text-white disabled:opacity-40"
      >
        <ChevronUp size={14} />
      </button>

      <button
        type="button"
        data-testid="search-next-btn"
        onClick={nextMatch}
        disabled={matches.length === 0}
        title="Siguiente coincidencia (Enter)"
        className="rounded p-1 text-gray-300 hover:bg-cad-dark hover:text-white disabled:opacity-40"
      >
        <ChevronDown size={14} />
      </button>

      <button
        type="button"
        data-testid="search-case-sensitive-toggle"
        onClick={() => {
          toggleCaseSensitive();
          executeSearch();
        }}
        title="Distinguir mayúsculas y minúsculas"
        className={`rounded p-1 transition-colors ${
          caseSensitive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-cad-dark hover:text-white'
        }`}
      >
        <CaseSensitive size={14} />
      </button>

      <button
        type="button"
        data-testid="search-whole-word-toggle"
        onClick={() => {
          toggleWholeWord();
          executeSearch();
        }}
        title="Palabras completas"
        className={`rounded p-1 transition-colors ${
          wholeWord ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-cad-dark hover:text-white'
        }`}
      >
        <WholeWord size={14} />
      </button>

      <div className="h-4 w-px bg-cad-border" />

      <button
        type="button"
        data-testid="search-close-btn"
        onClick={() => setIsOpen(false)}
        title="Cerrar búsqueda (Esc)"
        className="rounded p-1 text-gray-400 hover:bg-cad-dark hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  );
};
