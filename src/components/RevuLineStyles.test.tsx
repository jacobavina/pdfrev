import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { Ribbon } from './shell/Ribbon';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore, cloudCreationFields } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { cloudRadius } from '../core/markup/revisionCloud';
import { SELECTION_GAP_PX } from '../core/markup/transformHandles';
import { Markup, MarkupType } from '../types/markup';
import { StyleSection } from './shell/StyleSection';
import { getMarkupSvgDescriptor } from '../core/markup/render';
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

const mk = (id: string, type: MarkupType, points: { x: number; y: number }[], extra: Partial<Markup> = {}): Markup => ({
  id,
  type,
  pageIndex: 0,
  points,
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
  ...extra,
});

const rect = mk('rc', 'rectangle', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }]);
const line = mk('ln', 'line', [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }]);

beforeEach(() => {
  useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
  useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
  useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
  useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
  useToolStore.setState({
    activeTool: 'select',
    currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    cloudSize: 2,
    cloudInvert: false,
  });
});

describe('Tipos de línea en la barra de propiedades (ADR-0041)', () => {
  it('la lista muestra marca, nombre y dibujo de cada tipo, con los patrones aparte, como en Revu', () => {
    render(<RibbonWithStyle />);
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    const list = screen.getByTestId('ribbon-line-style-list');
    expect(list).toHaveTextContent('Dashed 6');
    expect(screen.getByTestId('ribbon-line-style-option-road')).toHaveTextContent('Road');
    expect(screen.getByTestId('ribbon-line-style-option-gas').querySelector('svg[data-pattern="gas"]')).not.toBeNull();
    expect(list.querySelector('[role="separator"]')).not.toBeNull();
  });

  it('con selección aplica el patrón en un paso deshacible; Cloud convierte el rectángulo en nube', () => {
    useMarkupStore.setState({ markups: [rect, line], selectedMarkupIds: ['rc', 'ln'] });
    render(<RibbonWithStyle />);
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-cloud'));
    let [r, l] = useMarkupStore.getState().markups;
    expect(r.type).toBe('cloud');
    expect(l.style.lineStyle).toBe('cloud');
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-tracks'));
    [r, l] = useMarkupStore.getState().markups;
    expect(r.type).toBe('rectangle');
    expect(r.style.lineStyle).toBe('tracks');
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].type).toBe('cloud');
  });

  it('sin selección define el tipo de línea, el tamaño y la inversión de las nubes nuevas', () => {
    render(<RibbonWithStyle />);
    // El botón de tamaño de nube solo se habilita con el tipo de línea Cloud
    expect(screen.getByTestId('ribbon-cloud-style')).toBeDisabled();
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-cloud'));
    expect(useToolStore.getState().currentStyle.lineStyle).toBe('cloud');
    fireEvent.click(screen.getByTestId('ribbon-cloud-style'));
    const size = screen.getByTestId('ribbon-cloud-size');
    fireEvent.change(size, { target: { value: '3.5' } });
    fireEvent.keyDown(size, { key: 'Enter' });
    fireEvent.click(screen.getByTestId('ribbon-cloud-invert'));
    expect(cloudCreationFields()).toEqual({ arcStep: 35, cloudInvert: 1 });
    // Un discontinuo quita el patrón
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-dashed5'));
    expect(useToolStore.getState().currentStyle).toMatchObject({ lineStyle: undefined, dashArray: [8, 3, 3, 3] });
  });

  it('en una nube, un discontinuo o Solid la dejan como nube y la lista lo muestra; solo un patrón la vuelve rectángulo (ADR-0067)', () => {
    useMarkupStore.setState({ markups: [mk('cl', 'cloud', rect.points, { customFields: { arcStep: 20 } })], selectedMarkupIds: ['cl'] });
    render(<RibbonWithStyle />);
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-dashed'));
    let m = useMarkupStore.getState().markups[0];
    expect(m.type).toBe('cloud');
    expect(m.style.dashArray).toEqual([4, 3]);
    expect(screen.getByTestId('ribbon-line-style')).toHaveAttribute('data-value', 'dashed');
    // El tamaño de los lóbulos sigue editable en la nube discontinua
    expect(screen.getByTestId('ribbon-cloud-style')).not.toBeDisabled();
    const t = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
    expect(JSON.stringify(getMarkupSvgDescriptor(m, t))).toContain('"strokeDasharray":"4 3"');
    // Solid: nube continua
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-solid'));
    m = useMarkupStore.getState().markups[0];
    expect(m.type).toBe('cloud');
    expect(m.style.dashArray).toBeUndefined();
    expect(screen.getByTestId('ribbon-line-style')).toHaveAttribute('data-value', 'cloud');
    // Un patrón no se combina con los lóbulos
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-gas'));
    expect(useMarkupStore.getState().markups[0].type).toBe('rectangle');
  });

  it('Size e Invert editan la nube seleccionada', () => {
    useMarkupStore.setState({ markups: [mk('cl', 'cloud', rect.points, { customFields: { arcStep: 20 } })], selectedMarkupIds: ['cl'] });
    render(<RibbonWithStyle />);
    fireEvent.click(screen.getByTestId('ribbon-cloud-style'));
    fireEvent.click(screen.getByTestId('ribbon-cloud-size-up'));
    expect(useMarkupStore.getState().markups[0].customFields?.arcStep).toBe(22.5);
    fireEvent.click(screen.getByTestId('ribbon-cloud-invert'));
    expect(useMarkupStore.getState().markups[0].customFields?.cloudInvert).toBe(1);
  });
});

describe('Caja de selección separada del dibujo, como en Revu (ADR-0041)', () => {
  it('en una nube los cuadros azules rodean los lóbulos y quedan lejos de los vértices amarillos', async () => {
    useMarkupStore.setState({ markups: [mk('cl', 'cloud', rect.points, { customFields: { arcStep: 20 } })], selectedMarkupIds: ['cl'] });
    await act(async () => {
      render(<PdfViewer />);
    });
    const handle = screen.getByTestId('scale-handle-0');
    const vertex = screen.getByTestId('control-point-0');
    const hx = Number(handle.getAttribute('x')) + 3.5;
    const vx = Number(vertex.getAttribute('cx'));
    // Lóbulo (radio de la nube) + margen de la caja + medio grosor
    expect(vx - hx).toBeCloseTo(cloudRadius(20) + SELECTION_GAP_PX + 0.5, 1);
    expect(Number(screen.getByTestId('selection-bbox').getAttribute('x'))).toBeCloseTo(hx, 1);
  });
});
