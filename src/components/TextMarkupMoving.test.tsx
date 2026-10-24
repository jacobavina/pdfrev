import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PdfViewer } from './PdfViewer';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';
import { useToolStore } from '../store/useToolStore';
import { useUiStore } from '../store/useUiStore';
import { Markup } from '../types/markup';
import { getMarkupBounds, hitTestMarkup } from '../utils/coordinates';

vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
}));

describe('Interacción y movimiento de marcas de texto (Text Markup)', () => {
  beforeEach(() => {
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [], clipboardMarkups: [] } as never);
    useDocumentStore.setState({ currentPageIndex: 0, scale: 1, rotation: 0, numPages: 1, pdfBytes: new Uint8Array([1]), pdfDoc: {} as never });
    useCalibrationStore.setState({ calibrations: {}, importedCalibrations: {} });
    useUiStore.setState({ hiddenLayers: [] });
  });

  it('un cuadro de texto recién creado con clic tiene bounds mínimos no nulos y responde a hitTest', () => {
    const pageDims = { width: 800, height: 600 };
    const textMarkup: Markup = {
      id: 'txt-click',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.2 + 120 / 800, y: 0.2 + 30 / 600 },
      ],
      text: 'Hola',
      style: { strokeColor: '#000000', fillColor: '#fffbe8', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    const bounds = getMarkupBounds(textMarkup, pageDims);
    expect(bounds.width).toBeGreaterThanOrEqual(80 / 800);
    expect(bounds.height).toBeGreaterThanOrEqual(26 / 600);

    // Clic en la palabra "Hola" (dentro del cuadro renderizado)
    const clickPoint = { x: 0.25, y: 0.22 };
    expect(hitTestMarkup(clickPoint, textMarkup, 0.015, pageDims)).toBe(true);
  });

  it('al hacer clic sobre un texto existente en modo select, se selecciona y prepara para arrastre en vez de deseleccionar', async () => {
    const textMarkup: Markup = {
      id: 'txt-1',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.35, y: 0.25 },
      ],
      text: 'Texto de prueba',
      style: { strokeColor: '#000000', fillColor: '#fffbe8', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    useMarkupStore.setState({ markups: [textMarkup], selectedMarkupIds: [] } as never);
    useToolStore.setState({ activeTool: 'select' });

    await act(async () => {
      render(<PdfViewer />);
    });

    const svg = screen.getByTestId('markup-overlay-svg');
    // Simular mousedown sobre el texto
    act(() => {
      fireEvent.mouseDown(svg, {
        clientX: 200,
        clientY: 130,
        button: 0,
      });
    });

    // La marca debe quedar seleccionada
    expect(useMarkupStore.getState().selectedMarkupIds).toContain('txt-1');
  });

  it('un texto ya seleccionado no se deselecciona al hacer clic en su interior', async () => {
    const textMarkup: Markup = {
      id: 'txt-selected',
      type: 'text',
      pageIndex: 0,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.35, y: 0.25 },
      ],
      text: 'Texto seleccionado',
      style: { strokeColor: '#000000', fillColor: '#fffbe8', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
    };

    useMarkupStore.setState({ markups: [textMarkup], selectedMarkupIds: ['txt-selected'] } as never);
    useToolStore.setState({ activeTool: 'select' });

    await act(async () => {
      render(<PdfViewer />);
    });

    const svg = screen.getByTestId('markup-overlay-svg');
    act(() => {
      fireEvent.mouseDown(svg, {
        clientX: 200,
        clientY: 130,
        button: 0,
      });
    });

    // Sigue seleccionada
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['txt-selected']);
  });
});
