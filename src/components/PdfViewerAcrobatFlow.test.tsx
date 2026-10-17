import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { PdfViewer } from './PdfViewer';
import { PropertiesInspectorPanel } from './PropertiesInspectorPanel';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { getMarkupSvgDescriptor, SvgRenderDescriptor } from '../core/markup/render';
import { emitMarkupOperators } from '../core/pdf/operators';
import { saveIncrementalMarkups } from '../core/pdf/incrementalWriter';
import { controlPointsOf, applyControlPointDrag } from '../core/markup/controlPoints';
import { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf')));
const flatten = (d: SvgRenderDescriptor): SvgRenderDescriptor[] => [d, ...(d.children ?? []).flatMap(flatten)];
const click = (svg: Element, x: number, y: number) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
  });
};
const move = (svg: Element, x: number, y: number) =>
  act(() => {
    fireEvent.mouseMove(svg, { clientX: x, clientY: y });
  });

const length: Markup = {
  id: 'len-a',
  type: 'length',
  pageIndex: 0,
  points: [
    { x: 100 / 800, y: 0.5 },
    { x: 400 / 800, y: 0.5 },
  ],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'A',
  createdAt: '2026-10-14T12:00:00Z',
  updatedAt: '2026-10-14T12:00:00Z',
  status: 'pending',
  measurement: { value: 1852.94, unit: 'ft', formatted: '1,852.94 ft' },
};

describe('Distancia en tres pasos como Acrobat (ADR-0035)', () => {
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
    useUiStore.setState({ hiddenLayers: [], showMeasureLabels: true, snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
    useToolStore.setState({
      activeTool: 'select',
      measureLabel: '',
      measureCaption: 'inline',
      measureLeaders: true,
      currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    });
  });

  it('por defecto: clic, clic (guías y valor al lado, sin flechas), mover para desplazar y tercer clic', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => useToolStore.setState({ activeTool: 'length' }));
    click(svg, 100, 300);
    move(svg, 300, 300);
    // Paso 1: guías cortas en los extremos y ninguna flecha
    const preview = () => svg.querySelector('[data-testid="markup-length-preview-length"]')!;
    expect(preview().querySelectorAll('[data-testid="distance-leader"]')).toHaveLength(2);
    expect(preview().querySelectorAll('polygon')).toHaveLength(0);
    click(svg, 400, 300);
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    // Paso 2: la "U": la línea sigue al cursor y las guías se estiran desde los puntos medidos
    move(svg, 250, 360);
    expect(preview().querySelectorAll('[data-testid="distance-leader"]')).toHaveLength(2);
    // Paso 3: tercer clic, flechas cerradas y el valor dentro de la línea
    click(svg, 250, 360);
    const [m] = useMarkupStore.getState().markups;
    expect(m.points).toHaveLength(3);
    expect(m.style.lineEndingStart).toBe('closedArrow');
    expect(svg.querySelectorAll(`[data-testid="markup-length-${m.id}"] polygon`)).toHaveLength(2);
  });

  it('arrastrar crea una distancia rápida de dos puntos (sin tercer clic)', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => useToolStore.setState({ activeTool: 'length' }));
    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 100, clientY: 200 });
    });
    move(svg, 300, 200);
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 300, clientY: 200 });
    });
    const [m] = useMarkupStore.getState().markups;
    expect(m.points).toHaveLength(2);
  });

  it('"Leader lines" se recuerda; apagado, la distancia vuelve a ser de dos clics', () => {
    useToolStore.getState().setMeasureLeaders(false);
    expect(localStorage.getItem('rea-measure-leaders')).toBe('0');
    useToolStore.getState().setMeasureLeaders(true);
    expect(localStorage.getItem('rea-measure-leaders')).toBe('1');
  });

  it('una distancia ya creada se desplaza con el tirador central: aparecen sus guías hasta los puntos medidos', () => {
    const handles = controlPointsOf(length)!;
    expect(handles).toHaveLength(3);
    expect(handles[2]).toEqual({ x: 250 / 800, y: 0.5 });
    const moved = applyControlPointDrag(length, 2, { x: 250 / 800, y: 360 / 600 });
    expect(moved).toEqual([...length.points, { x: 250 / 800, y: 360 / 600 }]);
  });

  it('puntas de diseñador: las flechas cerradas son solo relleno (sin contorno redondeado)', () => {
    const nodes = flatten(
      getMarkupSvgDescriptor(
        { ...length, style: { ...length.style, lineEndingStart: 'closedArrow', lineEndingEnd: 'closedArrow' } },
        { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 }
      )
    );
    const heads = nodes.filter((n) => n.tag === 'polygon');
    expect(heads).toHaveLength(2);
    expect(heads.every((h) => h.attrs.stroke === 'none' && h.attrs.strokeLinejoin === undefined)).toBe(true);
  });
});

describe('Texto del valor: fuente, tamaño, color, negrita y cursiva (ADR-0035)', () => {
  const styled: Markup = {
    ...length,
    style: { ...length.style, fontFamily: 'Times', fontSize: 11, textColor: '#1d4ed8' },
    textFormat: { bold: true, italic: true },
  };

  it('en pantalla', () => {
    const text = flatten(
      getMarkupSvgDescriptor(styled, { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 2 })
    ).find((n) => n.tag === 'text')!;
    expect(text.attrs.fontSize).toBe(22);
    expect(text.attrs.fill).toBe('#1d4ed8');
    expect(String(text.attrs.fontFamily)).toContain('Times');
    expect(text.attrs.fontWeight).toBe('bold');
    expect(text.attrs.fontStyle).toBe('italic');
  });

  it('en el PDF: Times-BoldItalic estándar como recurso del /AP, en su color', async () => {
    const out = emitMarkupOperators(styled, { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 });
    expect(out.extraFonts).toEqual({ TiBI: 'Times-BoldItalic' });
    expect(out.operators).toContain('/TiBI 11.00 Tf');
    expect(out.operators).toContain('0.114 0.306 0.847 rg');
    const saved = await saveIncrementalMarkups(blueprint, [styled]);
    expect(new TextDecoder('latin1').decode(saved)).toContain('/TiBI << /Type /Font /Subtype /Type1 /BaseFont /Times-BoldItalic');
  });

  it('en el inspector de propiedades', () => {
    useMarkupStore.setState({ markups: [length], selectedMarkupIds: ['len-a'] });
    render(<PropertiesInspectorPanel defaultCollapsed={false} />);
    // Desde ADR-0064 los controles de texto son los de la sección de estilo del panel
    expect(screen.getByTestId('ribbon-font-size')).toHaveValue(8);
    fireEvent.change(screen.getByTestId('ribbon-font-family'), { target: { value: 'Courier' } });
    fireEvent.change(screen.getByTestId('ribbon-text-color'), { target: { value: '#16a34a' } });
    fireEvent.click(screen.getByTestId('ribbon-font-bold'));
    fireEvent.click(screen.getByTestId('ribbon-font-italic'));
    const m = useMarkupStore.getState().markups[0];
    expect(m.style.fontFamily).toBe('Courier');
    expect(m.style.textColor).toBe('#16a34a');
    expect(m.textFormat).toEqual({ bold: true, italic: true });
  });
});
