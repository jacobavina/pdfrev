import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Ribbon } from './Ribbon';
import { useToolStore } from '../../store/useToolStore';
import { useDocumentStore } from '../../store/useDocumentStore';

// Antes probaba la barra superior plana (TopBar); desde ADR-0017 las herramientas viven en la cinta.
describe('Cinta de herramientas - Medición y calibración (Paquete 4)', () => {
  beforeEach(() => {
    useToolStore.setState({
      activeTool: 'select',
    });
    useDocumentStore.setState({
      numPages: 1,
      currentPageIndex: 0,
      scale: 1,
    });
  });

  it('renderiza todos los botones de medición y calibración con sus data-testid correspondientes', () => {
    render(<Ribbon />);

    expect(screen.getByTestId('tool-calibrate')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-length')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-polyline')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-area')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-count')).toBeInTheDocument();
  });

  it('permite seleccionar cada herramienta de medición actualizando el store', () => {
    render(<Ribbon />);

    fireEvent.click(screen.getByTestId('tool-calibrate'));
    expect(useToolStore.getState().activeTool).toBe('calibrate');

    fireEvent.click(screen.getByTestId('tool-measure-length'));
    expect(useToolStore.getState().activeTool).toBe('length');

    fireEvent.click(screen.getByTestId('tool-measure-polyline'));
    expect(useToolStore.getState().activeTool).toBe('polylineMeasure');

    fireEvent.click(screen.getByTestId('tool-measure-area'));
    expect(useToolStore.getState().activeTool).toBe('area');

    fireEvent.click(screen.getByTestId('tool-measure-count'));
    expect(useToolStore.getState().activeTool).toBe('count');
  });

  it('agrupa las herramientas por tarea con rótulo visible (Selección, Texto y revisión, Dibujo, Medición)', () => {
    render(<Ribbon />);
    for (const id of ['select', 'text', 'draw', 'measure']) {
      expect(screen.getByTestId(`ribbon-group-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('ribbon-group-measure')).toHaveTextContent('Measure');
    // La herramienta activa se marca con aria-pressed
    fireEvent.click(screen.getByTestId('tool-rectangle'));
    expect(screen.getByTestId('tool-rectangle')).toHaveAttribute('aria-pressed', 'true');
  });
});
