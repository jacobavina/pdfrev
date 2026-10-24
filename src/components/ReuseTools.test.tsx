import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StatusBar } from './shell/StatusBar';
import { MenuBar } from './shell/MenuBar';
import { PdfViewer } from './PdfViewer';
import { useUiStore, readStoredReuseTools } from '../store/useUiStore';
import { useToolStore } from '../store/useToolStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useCalibrationStore } from '../store/useCalibrationStore';

// Mock de renderPageToCanvas para entorno jsdom
vi.mock('../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    hasText: true,
  }),
}));

describe('Modo Reuse de Herramientas (ADR-0135)', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useUiStore.setState({ reuseTools: true });
      useToolStore.setState({ activeTool: 'select' });
    });
  });

  describe('useUiStore - Persistencia y estado', () => {
    it('inicia por defecto con reuseTools = true para compatibilidad con Revu y tests', () => {
      expect(readStoredReuseTools()).toBe(true);
      expect(useUiStore.getState().reuseTools).toBe(true);
    });

    it('toggleReuseTools cambia el estado y lo persiste en localStorage', () => {
      act(() => useUiStore.getState().toggleReuseTools());
      expect(useUiStore.getState().reuseTools).toBe(false);
      expect(localStorage.getItem('rea-reuse-tools')).toBe('0');

      act(() => useUiStore.getState().toggleReuseTools());
      expect(useUiStore.getState().reuseTools).toBe(true);
      expect(localStorage.getItem('rea-reuse-tools')).toBe('1');
    });

    it('setReuseTools asigna explícitamente el valor', () => {
      act(() => useUiStore.getState().setReuseTools(false));
      expect(useUiStore.getState().reuseTools).toBe(false);
      act(() => useUiStore.getState().setReuseTools(true));
      expect(useUiStore.getState().reuseTools).toBe(true);
    });
  });

  describe('StatusBar - Botón Reuse', () => {
    it('muestra el botón Reuse con aria-pressed reflejando el estado activo', () => {
      render(<StatusBar />);
      const btn = screen.getByTestId('reuse-tools-toggle');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-pressed', 'true');
      expect(btn).toHaveTextContent('Reuse');
    });

    it('hacer clic en el botón Reuse de la barra de estado alterna el modo', () => {
      render(<StatusBar />);
      const btn = screen.getByTestId('reuse-tools-toggle');
      fireEvent.click(btn);
      expect(useUiStore.getState().reuseTools).toBe(false);
      expect(btn).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(btn);
      expect(useUiStore.getState().reuseTools).toBe(true);
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('MenuBar - Menú Tools ▸ Reuse', () => {
    it('el menú Tools incluye la opción Reuse para activar/desactivar el modo', () => {
      render(<MenuBar />);
      const toolsMenuBtn = screen.getByTestId('menu-herramientas');
      fireEvent.click(toolsMenuBtn);

      const reuseItem = screen.getByTestId('menu-tools-reuse');
      expect(reuseItem).toBeInTheDocument();
      expect(reuseItem).toHaveTextContent('Reuse');

      fireEvent.click(reuseItem);
      expect(useUiStore.getState().reuseTools).toBe(false);
    });
  });

  describe('PdfViewer - Comportamiento al finalizar trazo de marca', () => {
    beforeEach(() => {
      useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
      useDocumentStore.setState({
        currentPageIndex: 0,
        scale: 1,
        rotation: 0,
        pdfBytes: new Uint8Array([1, 2, 3]),
        pdfDoc: {} as never,
      });
      useCalibrationStore.setState({ calibrations: {} });
      useUiStore.setState({ hiddenLayers: [] });
    });

    it('con reuseTools = true (por defecto), la herramienta permanece activa tras finalizar la marca', async () => {
      useUiStore.setState({ reuseTools: true });
      await act(async () => {
        render(<PdfViewer />);
      });
      act(() => useToolStore.setState({ activeTool: 'area' }));
      const svg = screen.getByTestId('markup-overlay-svg');

      for (const [x, y] of [[80, 60], [400, 60], [400, 300], [80, 300]]) {
        act(() => {
          fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
          fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
        });
      }
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });

      expect(useMarkupStore.getState().markups).toHaveLength(1);
      expect(useToolStore.getState().activeTool).toBe('area');
    });

    it('con reuseTools = false, la herramienta revierte a select tras finalizar la marca', async () => {
      useUiStore.setState({ reuseTools: false });
      await act(async () => {
        render(<PdfViewer />);
      });
      act(() => useToolStore.setState({ activeTool: 'area' }));
      const svg = screen.getByTestId('markup-overlay-svg');

      for (const [x, y] of [[80, 60], [400, 60], [400, 300], [80, 300]]) {
        act(() => {
          fireEvent.mouseDown(svg, { button: 0, clientX: x, clientY: y });
          fireEvent.mouseUp(svg, { button: 0, clientX: x, clientY: y });
        });
      }
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });

      expect(useMarkupStore.getState().markups).toHaveLength(1);
      expect(useToolStore.getState().activeTool).toBe('select');
    });

    it('con reuseTools = false, herramientas continuas como count no revierten a select', async () => {
      useUiStore.setState({ reuseTools: false });
      await act(async () => {
        render(<PdfViewer />);
      });
      act(() => useToolStore.setState({ activeTool: 'count' }));
      const svg = screen.getByTestId('markup-overlay-svg');

      act(() => {
        fireEvent.mouseDown(svg, { button: 0, clientX: 100, clientY: 100 });
        fireEvent.mouseUp(svg, { button: 0, clientX: 100, clientY: 100 });
      });

      expect(useMarkupStore.getState().markups).toHaveLength(1);
      expect(useToolStore.getState().activeTool).toBe('count');
    });
  });
});
