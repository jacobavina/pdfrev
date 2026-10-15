import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Ribbon } from './Ribbon';
import { RightRail } from './RightRail';
import { MeasurementsPanel } from './MeasurementsPanel';
import { PropertiesInspectorPanel } from '../PropertiesInspectorPanel';
import { useToolStore } from '../../store/useToolStore';
import { useUiStore } from '../../store/useUiStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';

describe('Cinta con pestañas, barra de propiedades y riel de paneles (ADR-0044)', () => {
  beforeEach(() => {
    useToolStore.setState({ activeTool: 'select' });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ numPages: 1, currentPageIndex: 0, scale: 1 });
    useUiStore.setState({ rightPanel: null });
  });

  it('la pestaña sigue a la herramienta activa (un atajo de medición abre Measure) y muestra su nombre y atajo', () => {
    render(<Ribbon />);
    expect(screen.getByTestId('ribbon-tab-markup')).toHaveAttribute('aria-selected', 'true');
    act(() => useToolStore.getState().setActiveTool('area'));
    expect(screen.getByTestId('ribbon-tab-measure')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tool-measure-area')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ribbon-active-tool')).toHaveTextContent('Area');
    act(() => useToolStore.getState().setActiveTool('stamp'));
    expect(screen.getByTestId('ribbon-tab-insert')).toHaveAttribute('aria-selected', 'true');
    // Select y Pan siguen a la vista en cualquier pestaña
    expect(screen.getByTestId('tool-select')).toBeInTheDocument();
  });

  it('la barra de propiedades va en su propia franja, con estilo y texto, separada de las herramientas', () => {
    render(<Ribbon />);
    const bar = screen.getByTestId('properties-bar');
    expect(bar).toContainElement(screen.getByTestId('ribbon-group-style'));
    expect(bar).toContainElement(screen.getByTestId('ribbon-group-font'));
    expect(bar).toHaveTextContent('Style (new markups)');
  });

  it('el riel derecho abre un panel a la vez y un segundo clic lo pliega', () => {
    render(
      <>
        <PropertiesInspectorPanel defaultCollapsed />
        <MeasurementsPanel defaultCollapsed />
        <RightRail />
      </>
    );
    fireEvent.click(screen.getByTestId('expand-properties-btn'));
    expect(screen.getByTestId('properties-inspector-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('expand-properties-btn')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('expand-measurements-btn'));
    expect(screen.getByTestId('measurements-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('properties-inspector-panel')).toHaveAttribute('data-collapsed', 'true');
    fireEvent.click(screen.getByTestId('expand-measurements-btn'));
    expect(screen.getByTestId('measurements-panel')).toHaveAttribute('data-collapsed', 'true');
  });
});
