import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MenuBar } from './MenuBar';
import { StatusBar } from './StatusBar';
import { LeftDock } from './LeftDock';
import { MeasurementsPanel } from './MeasurementsPanel';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useToolStore } from '../../store/useToolStore';
import { useUiStore } from '../../store/useUiStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { Markup, MarkupType } from '../../types/markup';

const mk = (id: string, type: MarkupType, layer?: string, value?: number, pageIndex = 0): Markup => ({
  id,
  type,
  pageIndex,
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
  ],
  style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
  author: 'A',
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  status: 'pending',
  layer,
  measurement:
    value === undefined ? undefined : { value, unit: 'm', formatted: `${value} m`, perimeter: type === 'area' ? 10 : undefined },
});

describe('Espacio de trabajo (ADR-0017)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'light';
    useUiStore.setState({ theme: 'light', leftTab: 'pages', leftOpen: true, hiddenLayers: [], cursorPt: null });
    useToolStore.setState({ activeTool: 'select' });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useCalibrationStore.setState({ calibrations: {} });
    useDocumentStore.setState({
      numPages: 3,
      currentPageIndex: 0,
      scale: 1,
      pdfBytes: new Uint8Array([1]),
      fileName: 'plano.pdf',
      filePath: null,
    });
  });

  describe('Barra de menús', () => {
    it('abre un menú, ejecuta su entrada y se cierra (Medición → Área activa la herramienta)', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-medicion'));
      expect(screen.getByTestId('menu-popup-medicion')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('menuitem', { name: /^Area/ }));
      expect(useToolStore.getState().activeTool).toBe('area');
      expect(screen.queryByTestId('menu-popup-medicion')).toBeNull();
    });

    it('Escape cierra el menú abierto', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-archivo'));
      expect(screen.getByTestId('menu-popup-archivo')).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });
      expect(screen.queryByTestId('menu-popup-archivo')).toBeNull();
    });

    it('el botón de tema alterna claro/oscuro, lo aplica al documento y lo recuerda', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('theme-toggle-btn'));
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(localStorage.getItem('rea-theme')).toBe('dark');
      fireEvent.click(screen.getByTestId('theme-toggle-btn'));
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('Guardar está deshabilitado en modo demostración (sin ruta de archivo)', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-archivo'));
      expect(screen.getByTestId('menu-save')).toBeDisabled();
    });
  });

  describe('Barra de estado', () => {
    it('muestra la página, el zoom y navega entre páginas', () => {
      render(<StatusBar />);
      expect(screen.getByTestId('page-indicator')).toHaveTextContent('1 / 3');
      fireEvent.click(screen.getByTitle('Next page'));
      expect(useDocumentStore.getState().currentPageIndex).toBe(1);
      expect(screen.getByTitle('Reset zoom to 100%')).toHaveTextContent('100%');
    });

    it('convierte la posición del cursor a unidades reales según la calibración', () => {
      render(<StatusBar />);
      act(() => useUiStore.getState().setCursorPt({ x: 72, y: 144 }));
      // Sin calibrar: escala de papel en mm (72 pt = 25.4 mm)
      expect(screen.getByTestId('cursor-coordinates')).toHaveTextContent('X 25.4 Y 50.8 mm');
      act(() => useCalibrationStore.getState().setPageCalibration(0, { scale: 0.02, unit: 'm', precision: 2 }));
      expect(screen.getByTestId('cursor-coordinates')).toHaveTextContent('X 1.44 Y 2.88 m');
    });
  });

  describe('Panel izquierdo: capas', () => {
    it('lista las capas con su número de marcas y oculta/muestra cada una', () => {
      useMarkupStore.setState({
        markups: [mk('a', 'rectangle', 'Arquitectura'), mk('b', 'cloud', 'Arquitectura'), mk('c', 'line')],
      });
      render(<LeftDock />);
      fireEvent.click(screen.getByTestId('left-tab-layers'));
      const panel = screen.getByTestId('layers-panel');
      expect(panel).toHaveTextContent('Arquitectura');
      expect(panel).toHaveTextContent('No layer');

      fireEvent.click(screen.getByTestId('layer-toggle-Arquitectura'));
      expect(useUiStore.getState().hiddenLayers).toEqual(['Arquitectura']);
      fireEvent.click(screen.getByTestId('layer-toggle-Arquitectura'));
      expect(useUiStore.getState().hiddenLayers).toEqual([]);
    });

    it('pulsar la pestaña activa pliega el panel', () => {
      render(<LeftDock />);
      fireEvent.click(screen.getByTestId('left-tab-layers'));
      expect(screen.getByTestId('layers-panel')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('left-tab-layers'));
      expect(screen.queryByTestId('layers-panel')).toBeNull();
    });
  });

  describe('Panel de mediciones', () => {
    it('muestra totales por tipo (longitud, área con perímetro, conteo) de la página o del documento', () => {
      useMarkupStore.setState({
        markups: [
          mk('l1', 'length', undefined, 2),
          mk('l2', 'polylineMeasure', undefined, 3),
          mk('a1', 'area', undefined, 12),
          mk('c1', 'count', undefined, 1),
          mk('l3', 'length', undefined, 100, 1),
        ],
      });
      render(<MeasurementsPanel defaultCollapsed={false} />);
      expect(screen.getByTestId('measurements-total-length')).toHaveTextContent('5.00 m');
      expect(screen.getByTestId('measurements-total-area')).toHaveTextContent('12.00 m²');
      expect(screen.getByTestId('measurements-total-count')).toHaveTextContent('1 ea');
      expect(screen.getByTestId('measurements-totals')).toHaveTextContent('Perimeter');

      fireEvent.click(screen.getByTestId('measurements-scope-document'));
      expect(screen.getByTestId('measurements-total-length')).toHaveTextContent('105.00 m');
    });

    it('se abre al pedirlo desde el menú (Ver → Panel de mediciones)', () => {
      render(<MeasurementsPanel />);
      expect(screen.getByTestId('measurements-panel')).toHaveAttribute('data-collapsed', 'true');
      act(() => useUiStore.getState().requestMeasurementsPanel());
      expect(screen.getByTestId('measurements-panel')).toHaveAttribute('data-collapsed', 'false');
    });
  });
});
