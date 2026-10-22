import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CopyToolsDialog } from './CopyToolsDialog';
import { MenuBar } from '../shell/MenuBar';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useUiStore } from '../../store/useUiStore';
import type { Markup } from '../../types/markup';

const rect = (id: string): Markup =>
  ({
    id,
    type: 'rectangle',
    pageIndex: 0,
    points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
    style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    createdAt: '',
    updatedAt: '',
  }) as Markup;

const line = (id: string): Markup =>
  ({
    id,
    type: 'line',
    pageIndex: 0,
    points: [{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }],
    style: { strokeColor: '#e02424', fillColor: 'transparent', strokeWidth: 1, opacity: 1 },
    createdAt: '',
    updatedAt: '',
  }) as Markup;

const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('Diálogos Offset y Multiply (ADR-0107)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [rect('r1')], selectedMarkupIds: ['r1'] });
    // La página mide 600×400 pt a escala 1; la calibración por defecto son milímetros de papel
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, pdfBytes: new Uint8Array([1]), pageDimensions: { 0: { width: 600, height: 400 } } as never });
    useCalibrationStore.setState({ calibrations: { 0: { scale: 1, unit: 'mm' } } });
    useUiStore.setState({ copyToolDialog: null });
  });

  it('Multiply crea las copias de la cuadrícula, las deja seleccionadas y se puede deshacer de una vez', () => {
    useUiStore.setState({ copyToolDialog: 'multiply' });
    render(<CopyToolsDialog />);
    type('multiply-rows', '2');
    type('multiply-columns', '3');
    type('multiply-gap-x', '10');
    type('multiply-gap-y', '10');
    fireEvent.click(screen.getByTestId('copytools-apply'));
    const s = useMarkupStore.getState();
    expect(s.markups).toHaveLength(6);
    expect(s.selectedMarkupIds).toHaveLength(5);
    expect(s.selectedMarkupIds).not.toContain('r1');
    expect(useUiStore.getState().copyToolDialog).toBeNull();
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups).toHaveLength(1);
  });

  it('Multiply con una sola celda no se puede aplicar', () => {
    useUiStore.setState({ copyToolDialog: 'multiply' });
    render(<CopyToolsDialog />);
    type('multiply-rows', '1');
    type('multiply-columns', '1');
    expect(screen.getByTestId('copytools-apply')).toBeDisabled();
  });

  it('Offset hacia fuera agranda el rectángulo y hacia dentro lo encoge', () => {
    useUiStore.setState({ copyToolDialog: 'offset' });
    render(<CopyToolsDialog />);
    type('offset-distance', '5');
    fireEvent.click(screen.getByTestId('copytools-apply'));
    const out = useMarkupStore.getState().markups.find((m) => m.id !== 'r1')!;
    expect(out.points[0].x * 600).toBeCloseTo(55, 6);
    expect(out.points[1].y * 400).toBeCloseTo(85, 6);
  });

  it('Offset avisa de las marcas que no puede desplazar y se desactiva si ninguna puede', () => {
    useMarkupStore.setState({ markups: [{ ...rect('n1'), type: 'stickyNote', points: [{ x: 0.5, y: 0.5 }] } as Markup], selectedMarkupIds: ['n1'] });
    useUiStore.setState({ copyToolDialog: 'offset' });
    render(<CopyToolsDialog />);
    expect(screen.getByTestId('offset-note')).toHaveTextContent('1 selected markup(s) cannot be offset');
    expect(screen.getByTestId('copytools-apply')).toBeDisabled();
  });

  it('Offset de una línea a la derecha la copia por debajo del sentido de dibujo', () => {
    useMarkupStore.setState({ markups: [line('l1')], selectedMarkupIds: ['l1'] });
    useUiStore.setState({ copyToolDialog: 'offset' });
    render(<CopyToolsDialog />);
    type('offset-distance', '20');
    fireEvent.click(screen.getByTestId('offset-side-right'));
    fireEvent.click(screen.getByTestId('copytools-apply'));
    const copy = useMarkupStore.getState().markups.find((m) => m.id !== 'l1')!;
    expect(copy.points[0].y * 400).toBeCloseTo(220, 6);
  });

  it('Edit ▸ Offset y Multiply abren el diálogo con la selección y están desactivados sin ella', () => {
    useMarkupStore.setState({ markups: [rect('r1')], selectedMarkupIds: [] });
    const { rerender } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    expect(screen.getByTestId('menu-offset')).toBeDisabled();
    expect(screen.getByTestId('menu-multiply')).toBeDisabled();
    act(() => useMarkupStore.setState({ selectedMarkupIds: ['r1'] }));
    rerender(<MenuBar />);
    expect(screen.getByTestId('menu-offset')).toHaveTextContent('O');
    expect(screen.getByTestId('menu-multiply')).toHaveTextContent('Ctrl+M');
    fireEvent.click(screen.getByTestId('menu-multiply'));
    expect(useUiStore.getState().copyToolDialog).toBe('multiply');
  });

  it('Escape cierra el diálogo sin crear nada', () => {
    useUiStore.setState({ copyToolDialog: 'offset' });
    render(<CopyToolsDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().copyToolDialog).toBeNull();
    expect(useMarkupStore.getState().markups).toHaveLength(1);
  });
});
