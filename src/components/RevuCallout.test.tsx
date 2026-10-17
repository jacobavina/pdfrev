import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { Ribbon } from './shell/Ribbon';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { calloutLeaderLayout, calloutBoxFromDrag, CALLOUT_LANDING_PT } from '../core/markup/calloutLayout';
import { controlPointsOf, applyControlPointDrag, controlPointShape } from '../core/markup/controlPoints';
import { keepsLeaderTips } from '../utils/dragInteraction';
import { translateMarkup } from '../utils/coordinates';
import { getMarkupSvgDescriptor } from '../core/markup/render';
import { emitMarkupOperators, PageTransformInfo } from '../core/pdf/operators';
import { saveIncrementalMarkups } from '../core/pdf/incrementalWriter';
import { importPdfAnnotations } from '../core/pdf/annotationReader';
import { Markup, MarkupType } from '../types/markup';
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

const callout = mk('co', 'callout', [{ x: 0.3, y: 0.15 }, { x: 0.42, y: 0.19 }], {
  leaders: [[{ x: 0.1, y: 0.35 }]],
  text: 'Hola',
});

describe('Callout como el de Revu y Foxit (ADR-0042)', () => {
  it('la directriz llega en horizontal al centro del lado de la caja que mira al codo', () => {
    const box = { x: 300, y: 100, width: 100, height: 40 };
    const left = calloutLeaderLayout({ x: 100, y: 300 }, undefined, box, 18);
    expect(left.attach).toEqual({ x: 300, y: 120 });
    expect(left.knee).toEqual({ x: 282, y: 120 });
    const right = calloutLeaderLayout({ x: 600, y: 10 }, undefined, box, 18);
    expect(right.attach).toEqual({ x: 400, y: 120 });
    expect(right.knee).toEqual({ x: 418, y: 120 });
    // Un codo guardado fija el largo del tramo horizontal; nunca queda dentro de la caja
    expect(calloutLeaderLayout({ x: 100, y: 300 }, { x: 240, y: 999 }, box, 18).knee).toEqual({ x: 240, y: 120 });
    expect(calloutLeaderLayout({ x: 100, y: 300 }, { x: 320, y: 0 }, box, 18).knee.x).toBe(300);
  });

  it('al crearlo, la caja queda junto al punto donde se suelta (el codo), del lado contrario a la punta', () => {
    const size = { width: 0.1, height: 0.04 };
    const [a, b] = calloutBoxFromDrag({ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.3 }, size, 0.02);
    expect(a.x).toBeCloseTo(0.32, 9);
    expect((a.y + b.y) / 2).toBeCloseTo(0.3, 9);
    const [c] = calloutBoxFromDrag({ x: 0.6, y: 0.5 }, { x: 0.4, y: 0.3 }, size, 0.02);
    expect(c.x + size.width).toBeCloseTo(0.38, 9);
  });

  it('mover la caja deja la punta de la flecha donde estaba; con su nube (Cloud+) se mueve entera', () => {
    const delta = { x: 0.1, y: 0.05 };
    expect(keepsLeaderTips(callout, [callout])).toBe(true);
    const moved = translateMarkup(callout, delta, { keepLeaderTips: true });
    expect(moved.leaders![0][0]).toEqual(callout.leaders![0][0]);
    expect(moved.points[0].x).toBeCloseTo(0.4, 9);
    // El codo guardado se mueve con la caja
    const withKnee = { ...callout, leaders: [[{ x: 0.1, y: 0.35 }, { x: 0.25, y: 0.17 }]] };
    expect(translateMarkup(withKnee, delta, { keepLeaderTips: true }).leaders![0][1].x).toBeCloseTo(0.35, 9);
    const note = { ...callout, groupId: 'g' };
    const cloud = mk('cl', 'cloudPlus', [{ x: 0.05, y: 0.3 }, { x: 0.15, y: 0.4 }], { groupId: 'g' });
    expect(keepsLeaderTips(note, [note, cloud])).toBe(false);
  });

  it('en pantalla: flecha abierta fina, texto del color de la línea y caja solo si tiene relleno', () => {
    const t = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
    const desc = getMarkupSvgDescriptor(callout, t);
    const kids = desc.children!;
    expect(kids.filter((c) => c.tag === 'polyline')).toHaveLength(2); // directriz y flecha abierta
    expect(kids.find((c) => c.tag === 'rect')!.attrs.stroke).toBe('none');
    expect(kids.find((c) => c.tag === 'text')!.attrs.fill).toBe('#e02424');
    const boxed = getMarkupSvgDescriptor({ ...callout, style: { ...callout.style, fillColor: '#ffffff' } }, t);
    expect(boxed.children!.find((c) => c.tag === 'rect')!.attrs.stroke).toBe('#e02424');
    // El texto crece con el zoom, como el resto del plano
    const z2 = getMarkupSvgDescriptor(callout, { ...t, width: 1600, height: 1200, zoom: 2 });
    expect(z2.children!.find((c) => c.tag === 'text')!.attrs.fontSize).toBe(20);
  });

  it('la flecha abre 30° a cada lado, como en Revu y Foxit (más abierta que la de las medidas)', () => {
    const t = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
    const arrow = getMarkupSvgDescriptor(callout, t).children!.filter((c) => c.tag === 'polyline')[1];
    const [b1, tip, b2] = String(arrow.attrs.points)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    const a1 = Math.atan2(b1[1] - tip[1], b1[0] - tip[0]);
    const a2 = Math.atan2(b2[1] - tip[1], b2[0] - tip[0]);
    let opening = Math.abs(a1 - a2);
    if (opening > Math.PI) opening = 2 * Math.PI - opening;
    expect((opening * 180) / Math.PI).toBeCloseTo(60, 0);
  });

  it('en el PDF es un callout estándar: /IT /FreeTextCallout con /CL, /LE y /RD, y vuelve igual al abrirlo', async () => {
    const transform: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
    const ap = emitMarkupOperators(callout, transform).operators.split('\n');
    expect(ap.filter((l) => l === 'S').length).toBeGreaterThanOrEqual(2); // directriz y flecha abierta (sin relleno)
    expect(ap).not.toContain('B');
    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf')));
    const saved = await saveIncrementalMarkups(blueprint, [callout]);
    const raw = new TextDecoder('latin1').decode(saved);
    expect(raw).toContain('/IT /FreeTextCallout');
    // Punta (80, 390), codo a 18 pt de la caja (222, 498) y llegada al centro del lado izquierdo (240, 498)
    expect(raw).toContain('/CL [80.00 390.00 222.00 498.00 240.00 498.00]');
    expect(raw).toContain('/LE /OpenArrow');
    expect(raw).toMatch(/\/RD \[[\d. ]+\]/);
    const back = (await importPdfAnnotations(saved)).markups.find((m) => m.id === 'co')!;
    expect(back.leaders![0][0].x).toBeCloseTo(0.1, 5);
    expect(back.points[0].x).toBeCloseTo(0.3, 5);
  });

  it('tiradores de Revu: círculos en las esquinas, cuadros en los lados; un lado mueve solo ese lado', () => {
    const cps = controlPointsOf(callout)!;
    expect(cps).toHaveLength(8);
    expect(controlPointShape(callout, 0)).toBe('circle');
    expect(controlPointShape(callout, 5)).toBe('square');
    // Lado derecho hacia la derecha: la caja se ensancha sin moverse en vertical
    expect(applyControlPointDrag(callout, 5, { x: 0.5, y: 0.9 })).toEqual([
      { x: 0.3, y: 0.15 },
      { x: 0.5, y: 0.19 },
    ]);
    expect(CALLOUT_LANDING_PT).toBe(18);
  });
});

describe('Tipo de flecha del callout configurable (ADR-0042)', () => {
  beforeEach(() => {
    useToolStore.setState({ activeTool: 'select', currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 } });
  });

  it('la barra muestra la flecha abierta del callout y permite cambiarla por cerrada, círculo o ninguna', () => {
    useMarkupStore.setState({ markups: [callout], selectedMarkupIds: ['co'] });
    render(<RibbonWithStyle />);
    const start = screen.getByTestId('ribbon-line-start');
    expect(start).toHaveAttribute('data-value', 'openArrow');
    fireEvent.click(start);
    fireEvent.click(screen.getByTestId('ribbon-line-start-option-closedArrow'));
    const m = useMarkupStore.getState().markups[0];
    expect(m.style.lineEndingStart).toBe('closedArrow');
    const t = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
    // Flecha cerrada rellena, con la misma apertura de 30°
    expect(getMarkupSvgDescriptor(m, t).children!.some((c) => c.tag === 'polygon' && c.attrs.fill === '#e02424')).toBe(true);
    const none = { ...m, style: { ...m.style, lineEndingStart: 'none' as const } };
    expect(getMarkupSvgDescriptor(none, t).children!.filter((c) => c.tag === 'polyline')).toHaveLength(1);
    expect(emitMarkupOperators(m, { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 }).operators).toMatch(/^f$/m);
  });
});

describe('Borde de la caja del callout (ADR-0042)', () => {
  beforeEach(() => {
    useToolStore.setState({ activeTool: 'select', calloutBorder: undefined, currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 } });
  });

  it('el borde se elige aparte del relleno: borde sin relleno, relleno sin borde, en pantalla y en el PDF', () => {
    useMarkupStore.setState({ markups: [callout], selectedMarkupIds: ['co'] });
    render(<RibbonWithStyle />);
    const btn = screen.getByTestId('ribbon-callout-border');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    const m = useMarkupStore.getState().markups[0];
    expect(m.customFields?.calloutBorder).toBe(1);
    const t = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
    const rect = getMarkupSvgDescriptor(m, t).children!.find((c) => c.tag === 'rect')!;
    expect(rect.attrs).toMatchObject({ stroke: '#e02424', fill: 'transparent' });
    const tr: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
    // Solo borde: el /AP traza la caja sin rellenarla
    expect(emitMarkupOperators(m, tr).operators.split('\n').filter((l) => l === 'S').length).toBeGreaterThanOrEqual(3);
    // Relleno sin borde
    const filledNoBorder = { ...m, style: { ...m.style, fillColor: '#ffffff' }, customFields: { calloutBorder: 0 } };
    expect(getMarkupSvgDescriptor(filledNoBorder, t).children!.find((c) => c.tag === 'rect')!.attrs).toMatchObject({ stroke: 'none', fill: '#ffffff' });
    expect(emitMarkupOperators(filledNoBorder, tr).operators).toMatch(/^f$/m);
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].customFields?.calloutBorder).toBeUndefined();
  });

  it('el tipo de línea del callout discontinúa la directriz y el borde de la caja, en pantalla y en el PDF; la punta sigue continua (ADR-0067)', () => {
    useMarkupStore.setState({ markups: [{ ...callout, customFields: { calloutBorder: 1 } }], selectedMarkupIds: ['co'] });
    render(<RibbonWithStyle />);
    fireEvent.click(screen.getByTestId('ribbon-line-style'));
    fireEvent.click(screen.getByTestId('ribbon-line-style-option-dashed'));
    const m = useMarkupStore.getState().markups[0];
    expect(m.style.dashArray).toEqual([4, 3]);
    const t = { width: 800, height: 600, scale: 1, offsetX: 0, offsetY: 0, zoom: 1 };
    const kids = getMarkupSvgDescriptor(m, t).children!;
    const [leader, arrow] = kids.filter((c) => c.tag === 'polyline');
    expect(leader.attrs.strokeDasharray).toBe('4 3');
    expect(arrow.attrs.strokeDasharray).toBeUndefined();
    expect(kids.find((c) => c.tag === 'rect')!.attrs.strokeDasharray).toBe('4 3');
    // /AP con dos directrices: cada una se traza discontinua aunque la punta anterior volviera a continuo
    const two = { ...m, leaders: [[{ x: 0.1, y: 0.35 }], [{ x: 0.6, y: 0.4 }]] };
    const tr: PageTransformInfo = { rotation: 0, widthPt: 800, heightPt: 600, originX: 0, originY: 0 };
    const ops = emitMarkupOperators(two, tr).operators.split('\n');
    const dashedAt = (i: number) => {
      for (let k = i; k >= 0; k--) {
        if (/^\[.*\] 0 d$/.test(ops[k])) return ops[k] !== '[] 0 d';
      }
      return false;
    };
    // Directriz: "0 j" y su trazo; punta: "0 J", el color de relleno y su trazo
    const starts = ops.flatMap((l, i) => (l.endsWith(' m') ? [i] : []));
    const leaderStarts = starts.filter((i) => ops[i - 1] === '0 j');
    const arrowStarts = starts.filter((i) => ops[i - 2] === '0 J');
    expect(leaderStarts).toHaveLength(2);
    expect(arrowStarts).toHaveLength(2);
    for (const i of leaderStarts) expect(dashedAt(i)).toBe(true);
    for (const i of arrowStarts) expect(dashedAt(i)).toBe(false);
  });

  it('con la herramienta Callout, el botón define el borde de los callouts nuevos', () => {
    useToolStore.setState({ activeTool: 'callout' });
    render(<RibbonWithStyle />);
    fireEvent.click(screen.getByTestId('ribbon-callout-border'));
    expect(useToolStore.getState().calloutBorder).toBe(true);
  });
});

describe('Callout en el visor (ADR-0042)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({ hiddenLayers: [], snap: { endpoint: false, midpoint: false, nearest: false, intersection: false, content: false } });
    useToolStore.setState({ activeTool: 'select', currentStyle: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 } });
  });

  it('clic en la punta y clic donde va el texto crean el callout sin mantener el botón pulsado (ADR-0067)', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => useToolStore.setState({ activeTool: 'callout' }));
    const click = (x: number, y: number) => {
      act(() => {
        fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
      });
      act(() => {
        fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
      });
    };
    click(80, 300);
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    // Entre los dos clics la vista previa sigue al cursor
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 240, clientY: 180 });
    });
    expect(screen.getByTestId('callout-preview')).toBeInTheDocument();
    click(240, 180);
    const [m] = useMarkupStore.getState().markups;
    expect(m.type).toBe('callout');
    expect(m.leaders![0][0].x).toBeCloseTo(80 / 800, 3);
    expect(m.leaders![0][0].y).toBeCloseTo(300 / 600, 3);
    // La caja queda junto al segundo clic, del lado contrario a la punta
    expect(m.points[0].x).toBeGreaterThan(240 / 800);
  });

  it('arrastrar la caja mueve el texto y el codo; la punta sigue señalando el mismo sitio', async () => {
    useMarkupStore.setState({ markups: [callout], selectedMarkupIds: ['co'] });
    await act(async () => {
      render(<PdfViewer />);
    });
    const svg = screen.getByTestId('markup-overlay-svg');
    // Tiradores del codo y de la caja, como en Revu
    expect(screen.getByTestId('callout-knee-handle-0')).toBeInTheDocument();
    expect(screen.getByTestId('control-point-5').tagName.toLowerCase()).toBe('rect');
    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 280, clientY: 100 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 380, clientY: 160 });
    });
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 380, clientY: 160 });
    });
    const m = useMarkupStore.getState().markups[0];
    expect(m.leaders![0][0]).toEqual({ x: 0.1, y: 0.35 });
    expect(m.points[0].x).toBeCloseTo(0.425, 6);
    expect(m.points[0].y).toBeCloseTo(0.25, 6);
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups[0].points[0]).toEqual({ x: 0.3, y: 0.15 });
  });
});
