import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { CalibrationModal } from './CalibrationModal';
import { CalibrateHint } from './viewer/CalibrateHint';
import { MenuBar } from './shell/MenuBar';
import { MeasurementsPanel } from './shell/MeasurementsPanel';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const MM_PER_PT = 25.4 / 72;
const down = (svg: Element, x: number, y: number) =>
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  });
const up = (svg: Element, x: number, y: number) =>
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
  });
const move = (svg: Element, x: number, y: number) =>
  act(() => {
    fireEvent.mouseMove(svg, { clientX: x, clientY: y });
  });
/** Un clic sin arrastre, como en el navegador (cada evento con su render). */
const click = (svg: Element, x: number, y: number) => {
  down(svg, x, y);
  up(svg, x, y);
};

const renderViewer = async () => {
  await act(async () => {
    render(<PdfViewer />);
  });
  return screen.getByTestId('markup-overlay-svg');
};

describe('Clic-clic y calibración por dos puntos (ADR-0031)', () => {
  beforeEach(() => {
    localStorage.clear();
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [], isDirty: false });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      numPages: 2,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useCalibrationStore.setState({
      calibrations: {},
      importedCalibrations: {},
      pendingCalibrationPoints: [],
      isCalibrationModalOpen: false,
    });
    useUiStore.setState({
      hiddenLayers: [],
      snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false },
    });
    useToolStore.setState({
      activeTool: 'select',
      measureLabel: '',
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('Length clic-clic: el trazo sigue al cursor entre el primer y el segundo clic', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'length' }));
    click(svg, 100, 300);
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    move(svg, 300, 300);
    expect(svg.querySelectorAll('line').length).toBeGreaterThan(0); // vista previa en vivo
    click(svg, 500, 300);
    const [m] = useMarkupStore.getState().markups;
    expect(m.type).toBe('length');
    expect(m.points).toEqual([
      { x: 100 / 800, y: 0.5 },
      { x: 500 / 800, y: 0.5 },
    ]);
    expect(m.measurement!.value).toBeCloseTo(400 * MM_PER_PT, 6);
  });

  it('el arrastre sigue funcionando; Esc o un segundo clic en el mismo punto cancelan el clic-clic', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'length' }));
    down(svg, 100, 100);
    move(svg, 300, 100);
    up(svg, 300, 100);
    expect(useMarkupStore.getState().markups).toHaveLength(1);

    click(svg, 100, 400);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    click(svg, 500, 400);
    // Tras Esc, ese clic es un nuevo punto 1: todavía no hay segunda medición
    expect(useMarkupStore.getState().markups).toHaveLength(1);
    click(svg, 500, 400);
    expect(useMarkupStore.getState().markups).toHaveLength(1);
  });

  it('Calibrate: aviso visible, dos clics abren el diálogo con la distancia; Esc sin trazo sale de la herramienta', async () => {
    const svg = await renderViewer();
    render(<CalibrateHint />);
    expect(screen.queryByTestId('calibrate-hint')).toBeNull();
    act(() => useToolStore.setState({ activeTool: 'calibrate' }));
    expect(screen.getByTestId('calibrate-hint')).toHaveTextContent('click the start and the end of a known distance');
    click(svg, 100, 300);
    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(false);
    click(svg, 300, 300);
    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(true);
    expect(useCalibrationStore.getState().pendingCalibrationPoints).toEqual([
      { x: 100 / 800, y: 0.5 },
      { x: 300 / 800, y: 0.5 },
    ]);
    expect(await screen.findByTestId('calibration-measured')).toHaveTextContent('200.00 pt');

    act(() => useToolStore.setState({ activeTool: 'calibrate' }));
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(useToolStore.getState().activeTool).toBe('select');
  });

  it('el diálogo acepta pies-pulgadas y guarda la escala legible "1 in = …"; puede aplicarse a todas las páginas', () => {
    useCalibrationStore.setState({
      pendingCalibrationPoints: [
        { x: 0.1, y: 0.5 },
        { x: 0.35, y: 0.5 },
      ],
      isCalibrationModalOpen: true,
    });
    render(<CalibrationModal pageIndex={0} pageSizePt={{ width: 800, height: 600 }} />);
    fireEvent.change(screen.getByTestId('calibration-unit-select'), { target: { value: 'ftin' } });
    fireEvent.change(screen.getByTestId('calibration-length-input'), { target: { value: "140'" } });
    fireEvent.click(screen.getByTestId('calibration-apply-all'));
    fireEvent.click(screen.getByTestId('calibration-confirm-btn'));
    const { calibrations, isCalibrationModalOpen } = useCalibrationStore.getState();
    expect(isCalibrationModalOpen).toBe(false);
    // 200 pt = 140 ft → 0.7 ft por punto, en las dos páginas
    expect(calibrations[0].scale).toBeCloseTo(0.7, 9);
    expect(calibrations[1].scale).toBeCloseTo(0.7, 9);
    expect(calibrations[0].format).toBe('ftin');
    expect(calibrations[0].ratio).toMatchObject({ paperValue: 1, paperUnit: 'in' });
    expect(calibrations[0].ratio!.realValue).toBeCloseTo(50.4, 9);
    expect(localStorage.getItem('rea-calibrate-unit')).toBe('ftin');
  });

  it('sin puntos, el diálogo no pide un número suelto: ofrece marcar los dos puntos', () => {
    useCalibrationStore.setState({ pendingCalibrationPoints: [], isCalibrationModalOpen: true });
    render(<CalibrationModal pageIndex={0} pageSizePt={{ width: 800, height: 600 }} />);
    expect(screen.queryByTestId('calibration-length-input')).toBeNull();
    fireEvent.click(screen.getByTestId('calibration-pick-points'));
    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(false);
    expect(useToolStore.getState().activeTool).toBe('calibrate');
  });

  it('calibrar recalcula las mediciones ya hechas en esa página; abrir un documento no las toca', async () => {
    const len: Markup = {
      id: 'len-old',
      type: 'length',
      pageIndex: 0,
      points: [
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.25 },
      ],
      style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
      author: 'A',
      createdAt: '',
      updatedAt: '',
      status: 'pending',
      measurement: { value: 200 * MM_PER_PT, unit: 'mm', formatted: '70.6 mm' },
      text: '70.6 mm',
    };
    useMarkupStore.setState({ markups: [len], isDirty: false });
    await renderViewer();

    // Cargar las escalas de un documento (al abrirlo) no recalcula ni marca cambios
    act(() => useCalibrationStore.getState().loadDocumentCalibrations({ 0: { scale: 1, unit: 'm', precision: 2 } }));
    expect(useMarkupStore.getState().markups[0].text).toBe('70.6 mm');
    expect(useMarkupStore.getState().isDirty).toBe(false);

    act(() =>
      useCalibrationStore.getState().setPageCalibration(0, { scale: 0.7, unit: 'ft', precision: 2, format: 'ftin', fractionDenominator: 16 })
    );
    const m = useMarkupStore.getState().markups[0];
    expect(m.measurement!.value).toBeCloseTo(140, 9);
    expect(m.text).toBe("140'-0\"");
    expect(useMarkupStore.getState().isDirty).toBe(true);
  });

  it('Tools ▸ Measure ▸ Calibrate Page Scale… y el botón Calibrate del panel activan los dos clics', () => {
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-herramientas'));
    fireEvent.mouseEnter(screen.getByTestId('menu-tools-measure'));
    fireEvent.click(screen.getByTestId('menu-calibrate'));
    expect(useToolStore.getState().activeTool).toBe('calibrate');
    expect(useCalibrationStore.getState().isCalibrationModalOpen).toBe(false);
    expect(screen.queryByText('Calibrate by Two Points')).toBeNull();
    unmount();

    act(() => useToolStore.setState({ activeTool: 'select' }));
    render(<MeasurementsPanel defaultCollapsed={false} />);
    fireEvent.click(screen.getByTestId('measure-calibrate-btn'));
    expect(useToolStore.getState().activeTool).toBe('calibrate');
  });

  it('el panel ofrece snap a intersecciones y al dibujo del PDF, y lo recuerda', () => {
    useUiStore.setState({ snap: { endpoint: true, midpoint: true, nearest: false, intersection: true, content: true } });
    render(<MeasurementsPanel defaultCollapsed={false} />);
    expect(screen.getByTestId('snap-intersection')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('snap-content'));
    expect(useUiStore.getState().snap.content).toBe(false);
    expect(JSON.parse(localStorage.getItem('rea-snap')!).content).toBe(false);
  });
});
