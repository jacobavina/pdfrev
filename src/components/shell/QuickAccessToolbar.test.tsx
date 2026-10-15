import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MenuBar } from './MenuBar';
import { Ribbon } from './Ribbon';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useToolStore } from '../../store/useToolStore';
import { distanceGeometry, MEASURE_CAPTION_PT, MEASURE_END_TICK_PT } from '../../core/markup/measureCaption';
import { lineEndingSize } from '../../core/markup/lineEndings';
import { Markup } from '../../types/markup';

const mk = (id: string): Markup => ({
  id,
  type: 'rectangle',
  pageIndex: 0,
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
  ],
  style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
  author: 'A',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
});

describe('Interfaz más limpia (ADR-0034)', () => {
  beforeEach(() => {
    useDocumentStore.setState({ numPages: 1, currentPageIndex: 0, scale: 1, pdfBytes: new Uint8Array([1]), fileName: 'plan.pdf', filePath: null });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [], isDirty: false });
    useToolStore.setState({ activeTool: 'select' });
  });

  it('acceso rápido junto a los menús: abrir, guardar, guardar como, deshacer, rehacer y exportar', () => {
    render(<MenuBar />);
    const bar = screen.getByTestId('quick-access-toolbar');
    for (const id of ['open-button', 'save-button', 'save-as-button', 'undo-button', 'redo-button', 'export-button']) {
      expect(bar.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }
    expect(screen.getByTestId('undo-button')).toBeDisabled();
    expect(screen.getByTestId('save-button')).toBeEnabled();
    expect(screen.queryByTestId('save-dirty-dot')).toBeNull();
  });

  it('un punto ámbar sobre Guardar indica cambios pendientes; Deshacer funciona desde la barra', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver')); // abrir y cerrar un menú no afecta a la barra
    fireEvent.click(screen.getByTestId('menu-ver'));
    act(() => useMarkupStore.getState().addMarkup(mk('r1')));
    expect(screen.getByTestId('save-dirty-dot')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('undo-button'));
    expect(useMarkupStore.getState().markups).toHaveLength(0);
  });

  it('la cinta ya no tiene los botones grandes de archivo ni el grupo de historial', () => {
    render(<Ribbon />);
    const ribbon = screen.getByTestId('ribbon');
    expect(ribbon).not.toHaveTextContent('Save As');
    expect(ribbon).not.toHaveTextContent('History');
    expect(ribbon.querySelector('[data-testid="save-button"]')).toBeNull();
    expect(screen.getByTestId('ribbon-group-measure')).toHaveTextContent('Measure');
  });

  it('distancia sin desplazamiento: guías perpendiculares centradas en cada extremo, y texto en proporción a la flecha', () => {
    const g = distanceGeometry(
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
      5,
      MEASURE_END_TICK_PT
    )!;
    expect(g.leaders).toEqual([
      [
        { x: 0, y: 100 - MEASURE_END_TICK_PT },
        { x: 0, y: 100 + MEASURE_END_TICK_PT },
      ],
      [
        { x: 200, y: 100 - MEASURE_END_TICK_PT },
        { x: 200, y: 100 + MEASURE_END_TICK_PT },
      ],
    ]);
    // Proporción de Acrobat: la flecha (1 pt de línea) mide algo más que el texto
    expect(lineEndingSize(1) / MEASURE_CAPTION_PT).toBeGreaterThan(1);
    expect(lineEndingSize(1) / MEASURE_CAPTION_PT).toBeLessThan(1.3);
  });
});
