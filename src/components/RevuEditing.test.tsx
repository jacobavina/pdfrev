import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { Ribbon } from './shell/Ribbon';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { scaleMarkup, rotateMarkup, canRotate, canScale, markupBounds } from '../core/markup/transformHandles';
import { emitMarkupOperators } from '../core/pdf/operators';
import { Markup, MarkupType } from '../types/markup';

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
const click = (svg: Element, x: number, y: number) => {
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
  });
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
  });
};
const renderViewer = async () => {
  await act(async () => {
    render(<PdfViewer />);
  });
  return screen.getByTestId('markup-overlay-svg');
};

describe('Tiradores de Revu: escalar y rotar (ADR-0039)', () => {
  const tri = mk('tri', 'polygon', [
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.25 },
    { x: 0.5, y: 0.5 },
  ]);

  it('escalar desde una esquina deja fija la opuesta; Mayús mantiene la proporción', () => {
    const r = scaleMarkup(tri, 2, { x: 0.75, y: 0.5 });
    expect(r.points).toEqual([
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.5 },
    ]);
    const u = scaleMarkup(tri, 2, { x: 0.75, y: 0.3 }, true);
    expect(u.points[2].x).toBeCloseTo(0.75, 9);
    expect(u.points[2].y).toBeCloseTo(0.75, 9);
  });

  it('rotar conserva las distancias en pt (no se deforma con la página rectangular) y gira las directrices', () => {
    const dims = { width: 800, height: 600 };
    const line = mk('ln', 'line', [
      { x: 0.25, y: 0.5 },
      { x: 0.75, y: 0.5 },
    ]);
    const r = rotateMarkup(line, Math.PI / 2, dims);
    const len = (ps: { x: number; y: number }[]) => Math.hypot((ps[1].x - ps[0].x) * 800, (ps[1].y - ps[0].y) * 600);
    expect(len(r.points)).toBeCloseTo(400, 6);
    expect(r.points[0].x).toBeCloseTo(0.5, 9);
    // Nube rectangular: pasa a sus cuatro esquinas para poder girarla
    const cloud = mk('c', 'cloud', [
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.3 },
    ]);
    expect(rotateMarkup(cloud, 0.3, dims).points).toHaveLength(4);
    expect(canRotate(mk('r', 'rectangle', cloud.points))).toBe(false);
    expect(canRotate(cloud)).toBe(true);
    expect(canScale(mk('n', 'count', [{ x: 0.1, y: 0.1 }]))).toBe(false);
    // La llamada conserva sus tiradores propios (la punta de su flecha cae en una esquina de la caja)
    expect(canScale(mk('co', 'callout', [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]))).toBe(false);
    expect(markupBounds(tri)).toEqual({ minX: 0.25, minY: 0.25, maxX: 0.5, maxY: 0.5 });
  });

  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
    useToolStore.setState({ activeTool: 'select', currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 } });
  });

  it('en el visor: cuadros en las esquinas y círculo de rotación; escalar es un paso deshacible', async () => {
    useMarkupStore.setState({ markups: [tri], selectedMarkupIds: ['tri'] });
    const svg = await renderViewer();
    expect(screen.getAllByTestId(/^scale-handle-/)).toHaveLength(4);
    expect(screen.getByTestId('rotate-handle')).toBeInTheDocument();
    // Los tiradores de vértice son pequeños (radio 3.5 px)
    expect(screen.getByTestId('control-point-0').getAttribute('r')).toBe('3.5');
    act(() => {
      fireEvent.mouseDown(screen.getByTestId('scale-handle-2'), { button: 0, clientX: 404, clientY: 304 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 600, clientY: 300 });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 600, clientY: 300 });
    });
    expect(useMarkupStore.getState().markups[0].points[1]).toEqual({ x: 0.75, y: 0.25 });
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].points).toEqual(tri.points);
  });

  it('un rectángulo se escala pero no muestra el círculo de rotación', async () => {
    useMarkupStore.setState({
      markups: [mk('rc', 'rectangle', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }])],
      selectedMarkupIds: ['rc'],
    });
    await renderViewer();
    expect(screen.getAllByTestId(/^scale-handle-/)).toHaveLength(4);
    expect(screen.queryByTestId('rotate-handle')).toBeNull();
  });
});

describe('Nube de forma libre (ADR-0039)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
    useToolStore.setState({ activeTool: 'select', currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 } });
  });

  it('clic en cada vértice y Enter: nube poligonal; arrastrar sigue creando la rectangular', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'cloud' }));
    for (const [x, y] of [
      [200, 100],
      [400, 120],
      [450, 300],
      [180, 280],
    ]) {
      click(svg, x, y);
    }
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    const [c] = useMarkupStore.getState().markups;
    expect(c.type).toBe('cloud');
    expect(c.points).toHaveLength(4);
    expect(c.points[0]).toEqual({ x: 0.25, y: 100 / 600 });

    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 500, clientY: 400 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 650, clientY: 500 });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 650, clientY: 500 });
    });
    expect(useMarkupStore.getState().markups[1].points).toHaveLength(2);
  });

  it('Cloud+ de forma libre: nube poligonal y llamada agrupadas, con la flecha en un vértice', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'cloudPlus' }));
    for (const [x, y] of [
      [200, 200],
      [400, 210],
      [380, 380],
    ]) {
      click(svg, x, y);
    }
    click(svg, 201, 201); // clic en el primer vértice: cierra
    const ms = useMarkupStore.getState().markups;
    expect(ms.map((m) => m.type)).toEqual(['cloudPlus', 'callout']);
    expect(ms[0].groupId).toBe(ms[1].groupId);
    expect(ms[0].points).toHaveLength(3);
    expect(ms[1].leaders![0][0]).toEqual(ms[0].points[1]); // vértice más cercano a la esquina superior derecha
  });
});

describe('Barra de propiedades contextual con fuentes (ADR-0040)', () => {
  const callout = mk('co', 'callout', [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.15 }], { text: 'Hola', leaders: [[{ x: 0.05, y: 0.3 }]] });

  beforeEach(() => {
    useDocumentStore.setState({ numPages: 1, currentPageIndex: 0, pdfBytes: new Uint8Array([1]) });
    useToolStore.setState({ activeTool: 'select', currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 } });
  });

  it('con selección edita la marca (no el estilo por defecto), incluido el tipo de letra', () => {
    useMarkupStore.setState({ markups: [callout], selectedMarkupIds: ['co'] });
    render(<Ribbon />);
    expect(screen.getByTestId('ribbon-group-style')).toHaveTextContent('Properties · 1 selected');
    fireEvent.change(screen.getByTestId('ribbon-font-family'), { target: { value: 'Times' } });
    fireEvent.change(screen.getByTestId('ribbon-font-size'), { target: { value: '14' } });
    fireEvent.click(screen.getByTestId('ribbon-font-bold'));
    fireEvent.change(screen.getByTestId('ribbon-text-color'), { target: { value: '#1d4ed8' } });
    const m = useMarkupStore.getState().markups[0];
    expect(m.style).toMatchObject({ fontFamily: 'Times', fontSize: 14, textColor: '#1d4ed8' });
    expect(m.textFormat).toEqual({ bold: true, italic: false });
    expect(useToolStore.getState().currentStyle.fontFamily).toBeUndefined();
  });

  it('sin selección define el estilo de las marcas nuevas; negrita y cursiva piden una selección', () => {
    useMarkupStore.setState({ markups: [callout], selectedMarkupIds: [] });
    render(<Ribbon />);
    expect(screen.getByTestId('ribbon-group-style')).toHaveTextContent('Style (new markups)');
    fireEvent.change(screen.getByTestId('ribbon-font-family'), { target: { value: 'Courier' } });
    expect(useToolStore.getState().currentStyle.fontFamily).toBe('Courier');
    expect(screen.getByTestId('ribbon-font-bold')).toBeDisabled();
    expect(useMarkupStore.getState().markups[0].style.fontFamily).toBeUndefined();
  });

  it('con una herramienta de dibujo activa define el estilo de lo que se va a dibujar aunque haya selección', () => {
    useMarkupStore.setState({ markups: [callout], selectedMarkupIds: ['co'] });
    useToolStore.setState({ activeTool: 'line' });
    render(<Ribbon />);
    expect(screen.getByTestId('ribbon-group-style')).toHaveTextContent('Style (new markups)');
    fireEvent.change(screen.getByTestId('ribbon-font-family'), { target: { value: 'Times' } });
    expect(useToolStore.getState().currentStyle.fontFamily).toBe('Times');
    expect(useMarkupStore.getState().markups[0].style.fontFamily).toBeUndefined();
  });

  it('la llamada (y la nota de Cloud+) escriben su texto con esa fuente en el PDF', () => {
    const styled = { ...callout, style: { ...callout.style, fontFamily: 'Times', fontSize: 14, textColor: '#1d4ed8' }, textFormat: { bold: true } };
    const out = emitMarkupOperators(styled, { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 });
    expect(out.extraFonts).toEqual({ TiBo: 'Times-Bold' });
    expect(out.operators).toContain('/TiBo 14.00 Tf');
    expect(out.operators).toContain('0.114 0.306 0.847 rg');
  });
});
