import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SketchToScaleDialog } from './SketchToScaleDialog';
import { MenuBar } from '../shell/MenuBar';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { useUiStore } from '../../store/useUiStore';

const toasts: string[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));

const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('Diálogo Sketch to Scale (ADR-0128)', () => {
  beforeEach(() => {
    toasts.length = 0;
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    // La hoja mide 1000×800 pt a escala de vista 2 (2000×1600 px); 1 pt = 0,01 m
    useDocumentStore.setState({ currentPageIndex: 0, scale: 2, pdfBytes: new Uint8Array([1]), pageDimensions: { 0: { width: 2000, height: 1600 } } as never });
    useCalibrationStore.setState({ calibrations: { 0: { scale: 0.01, unit: 'm' } } });
    useUiStore.setState({ sketchScaleOpen: false });
  });

  it('Edit ▸ Sketch to Scale solo está disponible con un documento abierto', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    expect(screen.getByTestId('menu-sketch-to-scale')).toBeDisabled();
  });

  it('un rectángulo de 4 × 3 m se dibuja centrado, queda seleccionado y se deshace de una vez', () => {
    useUiStore.setState({ sketchScaleOpen: true });
    render(<SketchToScaleDialog />);
    expect(screen.getByTestId('sketch-width').nextSibling).toHaveTextContent('m');
    fireEvent.click(screen.getByTestId('sketch-apply'));
    const { markups, selectedMarkupIds } = useMarkupStore.getState();
    expect(markups).toHaveLength(1);
    const [a, b] = markups[0].points;
    expect((b.x - a.x) * 1000).toBeCloseTo(400, 6);
    expect((b.y - a.y) * 800).toBeCloseTo(300, 6);
    expect(selectedMarkupIds).toEqual([markups[0].id]);
    expect(useUiStore.getState().sketchScaleOpen).toBe(false);
    act(() => useMarkupStore.getState().undo());
    expect(useMarkupStore.getState().markups).toHaveLength(0);
  });

  it('cada forma pide sus medidas y avisa de lo que no es válido', () => {
    useUiStore.setState({ sketchScaleOpen: true });
    render(<SketchToScaleDialog />);
    type('sketch-shape', 'line');
    expect(screen.queryByTestId('sketch-height')).toBeNull();
    expect(screen.getByTestId('sketch-angle')).toBeInTheDocument();
    type('sketch-width', '0');
    expect(screen.getByTestId('sketch-problem')).toHaveTextContent('length must be greater than zero');
    expect(screen.getByTestId('sketch-apply')).toBeDisabled();
    type('sketch-shape', 'polygon');
    type('sketch-width', '2');
    type('sketch-sides', '2');
    expect(screen.getByTestId('sketch-problem')).toHaveTextContent('between 3 and 24');
    type('sketch-sides', '5');
    expect(screen.queryByTestId('sketch-problem')).toBeNull();
    fireEvent.click(screen.getByTestId('sketch-apply'));
    expect(useMarkupStore.getState().markups[0]).toMatchObject({ type: 'polygon' });
    expect(useMarkupStore.getState().markups[0].points).toHaveLength(5);
  });

  it('una forma que no cabe en la hoja no se crea y lo dice', () => {
    useUiStore.setState({ sketchScaleOpen: true });
    render(<SketchToScaleDialog />);
    type('sketch-width', '50');
    fireEvent.click(screen.getByTestId('sketch-apply'));
    expect(useMarkupStore.getState().markups).toHaveLength(0);
    expect(toasts.at(-1)).toMatch(/does not fit on the page/);
    expect(useUiStore.getState().sketchScaleOpen).toBe(true);
  });

  it('en una página sin escala avisa de que mide en milímetros de papel', () => {
    useCalibrationStore.setState({ calibrations: {} });
    useUiStore.setState({ sketchScaleOpen: true });
    render(<SketchToScaleDialog />);
    expect(screen.getByTestId('sketch-uncalibrated')).toHaveTextContent('paper millimetres');
  });

  it('Escape cierra el diálogo', () => {
    useUiStore.setState({ sketchScaleOpen: true });
    render(<SketchToScaleDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().sketchScaleOpen).toBe(false);
  });
});
