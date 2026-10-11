import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from './TopBar';
import { useToolStore } from '../store/useToolStore';
import { useDocumentStore } from '../store/useDocumentStore';

describe('TopBar - Herramientas de Medición y Calibración (Paquete 4)', () => {
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
    render(<TopBar />);

    expect(screen.getByTestId('tool-calibrate')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-length')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-polyline')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-area')).toBeInTheDocument();
    expect(screen.getByTestId('tool-measure-count')).toBeInTheDocument();
  });

  it('permite seleccionar cada herramienta de medición actualizando el store', () => {
    render(<TopBar />);

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
});
