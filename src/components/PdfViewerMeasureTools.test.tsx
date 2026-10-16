import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { MeasurementsPanel } from './shell/MeasurementsPanel';
import { MenuBar } from './shell/MenuBar';
import { Ribbon } from './shell/Ribbon';
import { Rulers } from './viewer/Rulers';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const MM_PER_PT = 25.4 / 72;

/** En jsdom getBoundingClientRect devuelve 0: clientX/clientY son píxeles de página a escala 1 (800x600). */
const click = (svg: Element, x: number, y: number) => {
  fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
};
const drag = (svg: Element, x1: number, y1: number, x2: number, y2: number) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x1, clientY: y1 });
  });
  act(() => {
    fireEvent.mouseMove(svg, { clientX: x2, clientY: y2 });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x2, clientY: y2 });
  });
};

const renderViewer = async () => {
  await act(async () => {
    render(<PdfViewer />);
  });
  return screen.getByTestId('markup-overlay-svg');
};

describe('Perimeter, Volume, Angle, Radius y Diameter en el visor (ADR-0029)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({
      currentPageIndex: 0,
      scale: 1,
      rotation: 0,
      numPages: 1,
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfDoc: {} as never,
    });
    useCalibrationStore.setState({ calibrations: {} });
    useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false }, showMeasureLabels: true });
    useToolStore.setState({
      activeTool: 'select',
      measureLabel: '',
      volumeDepth: 1,
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('atajos de Revu: Shift+Alt+P perímetro, V volumen, G ángulo, R radio, D diámetro', async () => {
    await renderViewer();
    for (const [code, tool] of [
      ['KeyP', 'perimeter'],
      ['KeyV', 'volume'],
      ['KeyG', 'angle'],
      ['KeyR', 'radius'],
      ['KeyD', 'diameter'],
    ] as const) {
      act(() => {
        fireEvent.keyDown(window, { key: code.slice(3), code, shiftKey: true, altKey: true });
      });
      expect(useToolStore.getState().activeTool).toBe(tool);
    }
  });

  it('Angle: el tercer clic lo completa y mide el ángulo en el vértice central', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'angle' }));
    act(() => click(svg, 600, 300));
    act(() => click(svg, 400, 300));
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    act(() => click(svg, 400, 100));
    const [m] = useMarkupStore.getState().markups;
    expect(m.type).toBe('angle');
    expect(m.points).toHaveLength(3);
    expect(m.measurement!.formatted).toBe('90.0°');
    expect(screen.getByTestId(`markup-angle-${m.id}`)).toHaveTextContent('90.0°');
  });

  it('Radius y Diameter: dos puntos; el radio mide del centro al borde y la etiqueta lleva R / Ø', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'radius' }));
    drag(svg, 400, 300, 520, 300);
    act(() => useToolStore.setState({ activeTool: 'diameter' }));
    drag(svg, 100, 100, 300, 100);
    const [r, d] = useMarkupStore.getState().markups;
    expect(r.type).toBe('radius');
    expect(r.measurement!.value).toBeCloseTo(120 * MM_PER_PT, 6);
    expect(screen.getByTestId(`markup-radius-${r.id}`)).toHaveTextContent(/^R 42\.3 mm$/);
    expect(d.type).toBe('diameter');
    expect(d.measurement!.value).toBeCloseTo(200 * MM_PER_PT, 6);
    expect(screen.getByTestId(`markup-diameter-${d.id}`)).toHaveTextContent(/^Ø 70\.6 mm$/);
  });

  it('Volume: se cierra con Enter, multiplica el área por la profundidad y la guarda en la marca', async () => {
    useToolStore.setState({ volumeDepth: 3 });
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'volume' }));
    for (const [x, y] of [
      [80, 60],
      [400, 60],
      [400, 300],
      [80, 300],
    ]) {
      act(() => click(svg, x, y));
    }
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    const [v] = useMarkupStore.getState().markups;
    expect(v.type).toBe('volume');
    expect(v.customFields?.volumeDepth).toBe(3);
    expect(v.measurement!.value).toBeCloseTo(320 * 240 * MM_PER_PT * MM_PER_PT * 3, 4);
    expect(v.measurement!.formatted).toMatch(/ mm³$/);
    // Relleno translúcido por defecto aunque el estilo sea transparente
    expect(screen.getByTestId(`markup-volume-${v.id}`).querySelector('polygon')!.getAttribute('fill')).toBe(
      'rgba(124, 58, 237, 0.15)'
    );
  });

  it('Perimeter: cerrar con clic en el primer vértice; al arrastrar un vértice se recalcula', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'perimeter' }));
    for (const [x, y] of [
      [100, 100],
      [400, 100],
      [400, 500],
      [101, 101],
    ]) {
      act(() => click(svg, x, y));
    }
    const [p] = useMarkupStore.getState().markups;
    expect(p.type).toBe('perimeter');
    expect(p.points).toHaveLength(3);
    // Triángulo rectángulo 300 x 400 → hipotenusa 500
    expect(p.measurement!.value).toBeCloseTo(1200 * MM_PER_PT, 6);

    act(() => useToolStore.setState({ activeTool: 'select' }));
    act(() => useMarkupStore.setState({ selectedMarkupIds: [p.id] }));
    act(() => {
      fireEvent.mouseDown(screen.getByTestId('control-point-2'), { button: 0, clientX: 400, clientY: 500 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 400, clientY: 340 });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 400, clientY: 340 });
    });
    const after = useMarkupStore.getState().markups[0];
    // 300 x 240 → hipotenusa 384.2
    expect(after.measurement!.value).toBeCloseTo((300 + 240 + Math.hypot(300, 240)) * MM_PER_PT, 6);
    expect(after.text).toBe(after.measurement!.formatted);
  });
});

describe('Panel Measure: profundidad del volumen y reglas (ADR-0029)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useCalibrationStore.setState({ calibrations: {} });
    useDocumentStore.setState({ currentPageIndex: 0, numPages: 1, pdfBytes: new Uint8Array([1]) });
    useToolStore.setState({ volumeDepth: 1 });
    useUiStore.setState({ showRulers: false });
  });

  it('sin selección, Depth fija la profundidad de los volúmenes nuevos', () => {
    render(<MeasurementsPanel defaultCollapsed={false} />);
    fireEvent.change(screen.getByTestId('measure-volume-depth'), { target: { value: '2.5' } });
    expect(useToolStore.getState().volumeDepth).toBe(2.5);
    // Valores no válidos se ignoran
    fireEvent.change(screen.getByTestId('measure-volume-depth'), { target: { value: '-1' } });
    expect(useToolStore.getState().volumeDepth).toBe(2.5);
  });

  it('con un volumen seleccionado, Depth cambia su profundidad y su valor en un paso deshacible', () => {
    useMarkupStore.setState({
      markups: [
        {
          id: 'vol-sel',
          type: 'volume',
          pageIndex: 0,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.3, y: 0.1 },
            { x: 0.3, y: 0.3 },
          ],
          style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
          author: 'Reviewer',
          createdAt: '',
          updatedAt: '',
          status: 'pending',
          measurement: { value: 100, unit: 'mm', formatted: '100.0 mm³' },
          customFields: { volumeDepth: 2 },
        },
      ],
      selectedMarkupIds: ['vol-sel'],
    });
    render(<MeasurementsPanel defaultCollapsed={false} />);
    expect(screen.getByTestId('measure-volume-depth')).toHaveValue(2);
    fireEvent.change(screen.getByTestId('measure-volume-depth'), { target: { value: '5' } });
    const m = useMarkupStore.getState().markups[0];
    expect(m.customFields?.volumeDepth).toBe(5);
    expect(m.measurement!.value).toBeCloseTo(250, 9);
    expect(m.measurement!.formatted).toBe('250.0 mm³');
    expect(useToolStore.getState().volumeDepth).toBe(1);
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].measurement!.value).toBe(100);
  });

  it('la casilla Rulers activa las reglas y lo recuerda', () => {
    render(<MeasurementsPanel defaultCollapsed={false} />);
    fireEvent.click(screen.getByTestId('measure-show-rulers'));
    expect(useUiStore.getState().showRulers).toBe(true);
    expect(localStorage.getItem('rea-rulers')).toBe('1');
    fireEvent.click(screen.getByTestId('measure-show-rulers'));
    expect(localStorage.getItem('rea-rulers')).toBe('0');
  });
});

describe('Reglas, menú View ▸ Rulers y cinta (ADR-0029)', () => {
  beforeEach(() => {
    localStorage.clear();
    useCalibrationStore.setState({ calibrations: {} });
    useDocumentStore.setState({ currentPageIndex: 0, numPages: 1, scale: 1, rotation: 0, pdfBytes: new Uint8Array([1]) });
    useUiStore.setState({ showRulers: false });
    useToolStore.setState({ activeTool: 'select' });
  });

  it('View ▸ Rulers (Ctrl+R) alterna las reglas con la marca de activo', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    const item = screen.getByRole('menuitem', { name: /Rulers/ });
    expect(item).toHaveTextContent('Ctrl+R');
    fireEvent.click(item);
    expect(useUiStore.getState().showRulers).toBe(true);
    fireEvent.click(screen.getByTestId('menu-ver'));
    expect(screen.getByRole('menuitem', { name: /Rulers/ }).querySelector('.ring-1')).not.toBeNull();
  });

  it('la cinta ofrece las cinco mediciones nuevas con su atajo en el título', () => {
    render(<Ribbon />);
    fireEvent.click(screen.getByTestId('ribbon-tab-measure'));
    for (const [id, tool, title] of [
      ['perimeter', 'perimeter', /Perimeter \(Shift\+Alt\+P\)/],
      ['volume', 'volume', /Volume \(Shift\+Alt\+V\)/],
      ['angle', 'angle', /Angle \(Shift\+Alt\+G\)/],
      ['radius', 'radius', /Radius \(Shift\+Alt\+U\)/], // atajo de Revu (ADR-0052)
      ['diameter', 'diameter', /Diameter \(Shift\+Alt\+D\)/],
    ] as const) {
      const btn = screen.getByTestId(`tool-measure-${id}`);
      expect(btn.getAttribute('title')).toMatch(title);
      expect(btn.querySelector('svg')).not.toBeNull();
      fireEvent.click(btn);
      expect(useToolStore.getState().activeTool).toBe(tool);
    }
  });

  it('las reglas numeran desde la esquina de la hoja en la unidad de la escala', async () => {
    // Hoja de 800 pt a escala 1, con su esquina 120 px a la derecha y 70 px abajo del área de las reglas
    const page = document.createElement('div');
    page.setAttribute('data-testid', 'pdf-page-container');
    document.body.appendChild(page);
    page.getBoundingClientRect = () => ({ left: 120, top: 70, width: 800, height: 600, right: 920, bottom: 670, x: 120, y: 70, toJSON: () => ({}) });
    const hostRef = { current: null as HTMLDivElement | null };
    const Host = () => (
      <div
        ref={(el) => {
          if (el) el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0, toJSON: () => ({}) });
          hostRef.current = el;
        }}
      >
        <Rulers hostRef={hostRef} />
      </div>
    );
    // 1 pt = 1 cm reales
    useCalibrationStore.setState({ calibrations: { 0: { scale: 0.01, unit: 'm', precision: 2 } } });
    await act(async () => {
      render(<Host />);
    });
    expect(screen.getByTestId('ruler-corner')).toHaveTextContent('m');
    // Esquina a 100 px del inicio de la regla (120 − 20 de la regla izquierda); 1 px = 0.01 m → paso 1 m
    const labels = [...screen.getByTestId('ruler-top').querySelectorAll('text')].map((t) => [t.textContent, Number(t.getAttribute('x')) - 2]);
    expect(labels.slice(0, 3)).toEqual([
      ['-1', 0],
      ['0', 100],
      ['1', 200],
    ]);
    const left = [...screen.getByTestId('ruler-left').querySelectorAll('text')].map((t) => t.textContent);
    expect(left.slice(0, 2)).toEqual(['0', '1']);
    page.remove();
  });
});
