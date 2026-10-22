import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { MenuBar } from './shell/MenuBar';
import { Ribbon } from './shell/Ribbon';
import { UndoHistoryDialog } from './modals/UndoHistoryDialog';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import type { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));
const toasts: string[] = [];
vi.mock('../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));

const rect = (id: string, x: number, y: number): Markup =>
  ({
    id,
    type: 'rectangle',
    pageIndex: 0,
    points: [{ x, y }, { x: x + 0.1, y: y + 0.1 }],
    style: { strokeColor: '#000000', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    author: 'Reviewer',
    createdAt: '',
    updatedAt: '',
    status: 'pending',
  }) as Markup;

/** En jsdom getBoundingClientRect devuelve 0: clientX/clientY son píxeles de página a escala 1 (800×600). */
const drag = (svg: Element, path: [number, number][], opts: { shiftKey?: boolean } = {}) => {
  const [first, ...rest] = path;
  act(() => {
    fireEvent.mouseDown(svg, { button: 0, clientX: first[0], clientY: first[1], ...opts });
  });
  for (const [x, y] of rest) {
    act(() => {
      fireEvent.mouseMove(svg, { clientX: x, clientY: y });
    });
  }
  const last = rest[rest.length - 1] ?? first;
  act(() => {
    fireEvent.mouseUp(svg, { button: 0, clientX: last[0], clientY: last[1] });
  });
};

const renderViewer = async () => {
  await act(async () => {
    render(<PdfViewer />);
  });
  return screen.getByTestId('markup-overlay-svg');
};

// Marcas de 80×60 px: a en (80,60), b en (400,60), c en (80,400)
const MARKUPS = () => [rect('a', 0.1, 0.1), rect('b', 0.5, 0.1), rect('c', 0.1, 0.667)];

describe('Lasso (ADR-0110)', () => {
  beforeEach(() => {
    toasts.length = 0;
    useMarkupStore.setState({ markups: MARKUPS(), selectedMarkupIds: [] });
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1, 2, 3]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {} });
    useUiStore.setState({ hiddenLayers: [] });
    useToolStore.setState({ activeTool: 'select' });
  });

  it('Shift+O activa el lazo y la cinta lo ofrece con su atajo en el título', async () => {
    await renderViewer();
    act(() => {
      fireEvent.keyDown(window, { key: 'O', code: 'KeyO', shiftKey: true });
    });
    expect(useToolStore.getState().activeTool).toBe('lasso');
    const { unmount } = render(<Ribbon />);
    expect(screen.getByTestId('tool-lasso').getAttribute('title')).toMatch(/Lasso \(Shift\+O\)/);
    unmount();
  });

  it('arrastrar un lazo alrededor de dos marcas las elige, deja la tercera y vuelve a Select', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'lasso' }));
    // Lazo irregular que rodea a y b (y no a c): arriba de la página, de 40 a 520 px de ancho
    drag(svg, [[40, 30], [300, 20], [520, 40], [540, 150], [300, 170], [40, 160], [30, 90], [40, 30]]);
    expect(useMarkupStore.getState().selectedMarkupIds.sort()).toEqual(['a', 'b']);
    expect(useToolStore.getState().activeTool).toBe('select');
    expect(screen.queryByTestId('lasso-path')).toBeNull();
  });

  it('mientras se arrastra se ve el contorno y Escape lo cancela sin elegir nada', async () => {
    const svg = await renderViewer();
    act(() => useToolStore.setState({ activeTool: 'lasso' }));
    act(() => {
      fireEvent.mouseDown(svg, { button: 0, clientX: 40, clientY: 30 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 300, clientY: 20 });
    });
    act(() => {
      fireEvent.mouseMove(svg, { clientX: 300, clientY: 170 });
    });
    expect(screen.getByTestId('lasso-path')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('lasso-path')).toBeNull();
    act(() => {
      fireEvent.mouseUp(svg, { button: 0, clientX: 300, clientY: 170 });
    });
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual([]);
  });

  it('con Shift se suma a la selección anterior y un lazo que no toca nada avisa y conserva la selección', async () => {
    const svg = await renderViewer();
    useMarkupStore.setState({ selectedMarkupIds: ['c'] });
    act(() => useToolStore.setState({ activeTool: 'lasso' }));
    drag(svg, [[40, 30], [300, 20], [300, 150], [40, 160], [40, 30]], { shiftKey: true });
    expect(useMarkupStore.getState().selectedMarkupIds.sort()).toEqual(['a', 'c']);
    act(() => useToolStore.setState({ activeTool: 'lasso' }));
    drag(svg, [[600, 500], [700, 500], [700, 580], [600, 580], [600, 500]], { shiftKey: true });
    expect(useMarkupStore.getState().selectedMarkupIds.sort()).toEqual(['a', 'c']);
    expect(toasts.at(-1)).toMatch(/did not touch any markup/);
  });

  it('no elige marcas ocultas', async () => {
    const svg = await renderViewer();
    useMarkupStore.setState({ markups: [{ ...rect('a', 0.1, 0.1), hidden: true }, rect('b', 0.5, 0.1)] });
    act(() => useToolStore.setState({ activeTool: 'lasso' }));
    drag(svg, [[40, 30], [520, 20], [540, 150], [40, 160], [40, 30]]);
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['b']);
  });
});

describe('Undo History (ADR-0110)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useMarkupStore.getState().clearHistory();
    useUiStore.setState({ undoHistoryOpen: false });
  });

  const addThree = () => {
    const s = useMarkupStore.getState();
    s.addMarkups([rect('a', 0.1, 0.1)], 'Add A');
    s.addMarkups([rect('b', 0.3, 0.1)], 'Add B');
    s.addMarkups([rect('c', 0.5, 0.1)], 'Add C');
  };

  it('Edit ▸ Undo History abre la lista con el documento original, cada paso y dónde se está', () => {
    addThree();
    render(<MenuBar />);
    render(<UndoHistoryDialog />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    fireEvent.click(screen.getByTestId('menu-undo-history'));
    const list = screen.getByTestId('undo-history-list');
    expect(list.textContent).toContain('Document as opened');
    expect(['Add A', 'Add B', 'Add C'].every((t) => list.textContent!.includes(t))).toBe(true);
    expect(screen.getByTestId('undo-history-step-3')).toHaveAttribute('aria-current', 'step');
  });

  it('elegir un paso anterior deshace hasta él, y uno futuro lo rehace', () => {
    addThree();
    useUiStore.setState({ undoHistoryOpen: true });
    render(<UndoHistoryDialog />);
    fireEvent.click(screen.getByTestId('undo-history-step-1'));
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['a']);
    expect(useUiStore.getState().undoHistoryOpen).toBe(false);
    act(() => useUiStore.setState({ undoHistoryOpen: true }));
    expect(screen.getByTestId('undo-history-step-1')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('undo-history-step-3').className).toContain('text-gray-500');
    fireEvent.click(screen.getByTestId('undo-history-step-3'));
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('el paso "Document as opened" vuelve al principio y un cambio nuevo descarta lo rehacible', () => {
    addThree();
    useUiStore.setState({ undoHistoryOpen: true });
    render(<UndoHistoryDialog />);
    fireEvent.click(screen.getByTestId('undo-history-step-0'));
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    act(() => useMarkupStore.getState().addMarkups([rect('d', 0.7, 0.1)], 'Add D'));
    act(() => useUiStore.setState({ undoHistoryOpen: true }));
    // Lo rehacible (B y C) se descartó: solo quedan el original y D
    expect(screen.queryByTestId('undo-history-step-2')).toBeNull();
    expect(screen.getByTestId('undo-history-step-1')).toHaveAttribute('aria-current', 'step');
    expect(useMarkupStore.getState().canRedo).toBe(false);
  });

  it('Escape cierra la lista sin tocar el historial', () => {
    addThree();
    useUiStore.setState({ undoHistoryOpen: true });
    render(<UndoHistoryDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().undoHistoryOpen).toBe(false);
    expect(useMarkupStore.getState().markups).toHaveLength(3);
  });
});
