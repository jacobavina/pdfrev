import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';
import { useSearchStore } from '../store/useSearchStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { SearchMatch } from '../core/search/textSearch';

describe('SearchBar Component (Paquete 5)', () => {
  const sampleMatches: SearchMatch[] = [
    {
      pageIndex: 0,
      matchIndex: 0,
      pageMatchIndex: 0,
      text: 'Columna',
      rects: [{ x: 0.1, y: 0.2, width: 0.05, height: 0.02 }],
    },
    {
      pageIndex: 1,
      matchIndex: 1,
      pageMatchIndex: 0,
      text: 'Columna',
      rects: [{ x: 0.3, y: 0.4, width: 0.05, height: 0.02 }],
    },
  ];

  beforeEach(() => {
    useSearchStore.getState().clearSearch();
    useSearchStore.setState({
      isOpen: true,
      query: 'Columna',
      matches: sampleMatches,
      activeMatchIndex: 0,
      caseSensitive: false,
      wholeWord: false,
    });
    useDocumentStore.setState({
      currentPageIndex: 0,
      numPages: 2,
    });
  });

  it('renderiza todos los controles de la barra de búsqueda con sus data-testid', () => {
    render(<SearchBar />);

    expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-count')).toHaveTextContent('1 de 2');
    expect(screen.getByTestId('search-prev-btn')).toBeInTheDocument();
    expect(screen.getByTestId('search-next-btn')).toBeInTheDocument();
    expect(screen.getByTestId('search-case-sensitive-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('search-whole-word-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('search-close-btn')).toBeInTheDocument();
  });

  it('avanza a la siguiente coincidencia y sincroniza la página del documento', () => {
    render(<SearchBar />);

    const nextBtn = screen.getByTestId('search-next-btn');
    fireEvent.click(nextBtn);

    expect(useSearchStore.getState().activeMatchIndex).toBe(1);
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
    expect(screen.getByTestId('search-count')).toHaveTextContent('2 de 2');
  });

  it('retrocede con el botón anterior', () => {
    render(<SearchBar />);

    const prevBtn = screen.getByTestId('search-prev-btn');
    fireEvent.click(prevBtn);

    // Salta a la última coincidencia (índice 1, página 1)
    expect(useSearchStore.getState().activeMatchIndex).toBe(1);
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
  });

  it('cierra la barra al pulsar el botón de cierre', () => {
    render(<SearchBar />);

    const closeBtn = screen.getByTestId('search-close-btn');
    fireEvent.click(closeBtn);

    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it('cierra la barra al pulsar la tecla Escape en el input', () => {
    render(<SearchBar />);

    const input = screen.getByTestId('search-input');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useSearchStore.getState().isOpen).toBe(false);
  });
});
