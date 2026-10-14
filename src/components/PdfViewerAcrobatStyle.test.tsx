import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { MeasurementsPanel } from './shell/MeasurementsPanel';
import { Ribbon } from './shell/Ribbon';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { Markup } from '../types/markup';

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
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('una distancia nueva lleva flechas abiertas y el "Caption" elegido; la vista previa ya muestra el valor', async () => {
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
    expect(m.style.lineEndingStart).toBe('openArrow');
    expect(m.style.lineEndingEnd).toBe('openArrow');
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
    render(<Ribbon />);
    fireEvent.click(screen.getByTestId('ribbon-line-end'));
    expect(screen.getByTestId('ribbon-line-end-option-rOpenArrow')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ribbon-line-end-option-rClosedArrow'));
    expect(useToolStore.getState().currentStyle.lineEndingEnd).toBe('rClosedArrow');
  });
});
