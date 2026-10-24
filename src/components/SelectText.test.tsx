import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { ALL_TOOLS } from './shell/toolDefinitions';
import { Markup } from '../types/markup';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

const rect: Markup = {
  id: 'r1',
  type: 'rectangle',
  pageIndex: 0,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Ana',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
};

describe('Seleccionar y copiar el texto del plano (ADR-0104)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [rect], selectedMarkupIds: ['r1'], clipboardMarkups: [] } as never);
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({ hiddenLayers: [] });
  });

  it('la herramienta Select Text está en la cinta con su atajo Shift+T', () => {
    const tool = ALL_TOOLS.find((t) => t.type === 'selectText');
    expect(tool).toMatchObject({ shortcut: 'Shift+T', testId: 'tool-select-text' });
  });

  it('con Select Text la capa de texto recibe el ratón y las marcas no; con Select ocurre lo contrario', async () => {
    useToolStore.setState({ activeTool: 'selectText' });
    await act(async () => {
      render(<PdfViewer />);
    });
    expect(screen.getByTestId('pdf-text-layer').style.pointerEvents).toBe('auto');
    expect(screen.getByTestId('markup-overlay-svg').getAttribute('class')).toContain('pointer-events-none');
    act(() => useToolStore.setState({ activeTool: 'select' }));
    expect(screen.getByTestId('pdf-text-layer').style.pointerEvents).toBe('none');
    expect(screen.getByTestId('markup-overlay-svg').getAttribute('class')).not.toContain('pointer-events-none');
  });

  it('Shift+T activa Select Text', async () => {
    useToolStore.setState({ activeTool: 'select' });
    await act(async () => {
      render(<PdfViewer />);
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'T', shiftKey: true });
    });
    expect(useToolStore.getState().activeTool).toBe('selectText');
  });

  it('Ctrl+C con texto seleccionado deja copiar el texto y no las marcas; sin texto seleccionado copia las marcas', async () => {
    useToolStore.setState({ activeTool: 'select' });
    await act(async () => {
      render(<PdfViewer />);
    });
    const spy = vi.spyOn(window, 'getSelection');
    spy.mockReturnValue({ toString: () => 'PLANO DE PRUEBA' } as Selection);
    let ev = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect((useMarkupStore.getState() as unknown as { clipboardMarkups: unknown[] }).clipboardMarkups).toHaveLength(0);
    spy.mockReturnValue({ toString: () => '' } as Selection);
    ev = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true, bubbles: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    spy.mockRestore();
  });

  it('la etiqueta corta de Select Text es "SelectText" y no "Copy"', () => {
    const tool = ALL_TOOLS.find((t) => t.type === 'selectText');
    expect(tool?.short).toBe('SelectText');
  });

  it('Escape regresa de Select Text a Select', async () => {
    useToolStore.setState({ activeTool: 'selectText' });
    await act(async () => {
      render(<PdfViewer />);
    });
    expect(useToolStore.getState().activeTool).toBe('selectText');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(useToolStore.getState().activeTool).toBe('select');
  });

  it('pdf-text-layer no impone width ni height inline que sobreescriban la rotación de PDF.js', async () => {
    await act(async () => {
      render(<PdfViewer />);
    });
    const textLayer = screen.getByTestId('pdf-text-layer');
    expect(textLayer.style.width).toBe('');
    expect(textLayer.style.height).toBe('');
    expect(textLayer.style.getPropertyValue('--scale-factor')).toBe('1');
  });
});
