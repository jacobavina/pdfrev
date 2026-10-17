import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { MeasurementsPanel } from './shell/MeasurementsPanel';
import { Ribbon } from './shell/Ribbon';
import { PropertiesInspectorPanel } from './PropertiesInspectorPanel';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { Markup } from '../types/markup';
import { StyleSection } from './shell/StyleSection';
/** La cinta y la sección de estilo, que desde ADR-0064 vive en el panel de Propiedades. */
const RibbonWithStyle: React.FC = () => (
  <>
    <Ribbon />
    <StyleSection />
  </>
);


vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const click = (svg: Element, x: number, y: number) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
  });
};

describe('Estilo de Acrobat en la interfaz (ADR-0032)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      numPages: 1,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({
      hiddenLayers: [],
      showMeasureLabels: true,
      snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false },
    });
    useToolStore.setState({
      activeTool: 'select',
      measureLabel: '',
      measureCaption: 'inline',
      measureLeaders: false,
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('una distancia nueva lleva flechas cerradas y el "Caption" elegido; la vista previa ya muestra el valor', async () => {
    useToolStore.setState({ measureCaption: 'top' });
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => useToolStore.setState({ activeTool: 'length' }));
    click(svg, 100, 300);
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 300, clientY: 300 });
    });
    expect(svg.querySelector('[data-testid="markup-length-preview-length"] text')).toHaveTextContent('70.6 mm');
    click(svg, 500, 300);
    // El texto de las mediciones no puede iniciar una selección (desplazaría el visor al arrastrar)
    expect(svg).toHaveClass('select-none');
    const [m] = useMarkupStore.getState().markups;
    expect(m.style.lineEndingStart).toBe('closedArrow');
    expect(m.style.lineEndingEnd).toBe('closedArrow');
    expect(m.customFields?.captionStyle).toBe('top');
  });

  it('Caption en el panel Measure: fija el de las distancias nuevas o cambia el de la seleccionada', () => {
    const len: Markup = {
      id: 'len-sel',
      type: 'length',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ],
      style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
      author: 'A',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
      measurement: { value: 141.1, unit: 'mm', formatted: '141.1 mm' },
    };
    const { unmount } = render(<MeasurementsPanel defaultCollapsed={false} />);
    fireEvent.change(screen.getByTestId('measure-caption'), { target: { value: 'top' } });
    expect(useToolStore.getState().measureCaption).toBe('top');
    unmount();

    useMarkupStore.setState({ markups: [len], selectedMarkupIds: ['len-sel'] });
    render(<MeasurementsPanel defaultCollapsed={false} />);
    expect(screen.getByTestId('measure-caption')).toHaveValue('inline');
    fireEvent.change(screen.getByTestId('measure-caption'), { target: { value: 'top' } });
    expect(useMarkupStore.getState().markups[0].customFields?.captionStyle).toBe('top');
  });

  it('la cinta ofrece las flechas invertidas de Acrobat como extremos', () => {
    render(<RibbonWithStyle />);
    fireEvent.click(screen.getByTestId('ribbon-line-end'));
    expect(screen.getByTestId('ribbon-line-end-option-rOpenArrow')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ribbon-line-end-option-rClosedArrow'));
    expect(useToolStore.getState().currentStyle.lineEndingEnd).toBe('rClosedArrow');
  });
  it('Leader lines: el tercer clic fija el desplazamiento de la línea de medida (Acrobat, ADR-0033); Esc lo cancela', async () => {
    useToolStore.setState({ measureLeaders: true });
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => useToolStore.setState({ activeTool: 'length' }));
    click(svg, 100, 300);
    click(svg, 400, 300);
    expect(useMarkupStore.getState().markups).toHaveLength(0); // falta el desplazamiento
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 250, clientY: 250 });
    });
    // La vista previa ya muestra las líneas de referencia
    expect(svg.querySelectorAll('[data-testid="markup-length-preview-length"] [data-testid="distance-leader"]')).toHaveLength(2);
    click(svg, 250, 250);
    const [m] = useMarkupStore.getState().markups;
    expect(m.points).toEqual([
      { x: 100 / 800, y: 0.5 },
      { x: 400 / 800, y: 0.5 },
      { x: 250 / 800, y: 250 / 600 },
    ]);
    expect(m.measurement!.value).toBeCloseTo(300 * (25.4 / 72), 6); // la medida es entre los puntos medidos

    click(svg, 100, 500);
    click(svg, 400, 500);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    click(svg, 250, 450);
    expect(useMarkupStore.getState().markups).toHaveLength(1);
    act(() => useToolStore.setState({ measureLeaders: false }));
  });

  it('el inspector de propiedades ofrece la posición del valor de la distancia seleccionada', () => {
    const len: Markup = {
      id: 'len-insp',
      type: 'length',
      pageIndex: 0,
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ],
      style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
      author: 'A',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
      measurement: { value: 1, unit: 'ft', formatted: '1.00 ft' },
    };
    useMarkupStore.setState({ markups: [len], selectedMarkupIds: ['len-insp'] });
    render(<PropertiesInspectorPanel defaultCollapsed={false} />);
    // Sin extremos guardados, la distancia muestra flechas cerradas (en la sección de estilo del panel, ADR-0064)
    expect(screen.getByTestId('ribbon-line-start')).toHaveAttribute('data-value', 'closedArrow');
    fireEvent.change(screen.getByTestId('prop-caption'), { target: { value: 'top' } });
    expect(useMarkupStore.getState().markups[0].customFields?.captionStyle).toBe('top');
  });
});
