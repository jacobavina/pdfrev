import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Ribbon } from './Ribbon';
import { RightRail } from './RightRail';
import { MeasurementsPanel } from './MeasurementsPanel';
import { PropertiesInspectorPanel } from '../PropertiesInspectorPanel';
import { useToolStore } from '../../store/useToolStore';
import { useUiStore } from '../../store/useUiStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { App } from '../../App';

vi.mock('../../services/pdfService', () => ({
  renderPageToCanvas: vi.fn().mockResolvedValue({ width: 800, height: 600, hasText: true }),
  loadPdfDocument: vi.fn().mockRejectedValue(new Error('sin PDF en la prueba')),
}));

describe('Cinta con pestañas, barra de propiedades y riel de paneles (ADR-0044)', () => {
  beforeEach(() => {
    useToolStore.setState({ activeTool: 'select' });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useDocumentStore.setState({ numPages: 1, currentPageIndex: 0, scale: 1 });
    useUiStore.setState({ rightPanel: null });
  });

  it('la pestaña sigue a la herramienta activa (un atajo de medición abre Measure) y muestra su nombre y atajo', () => {
    render(<Ribbon />);
    expect(screen.getByTestId('ribbon-tab-markup')).toHaveAttribute('aria-selected', 'true');
    act(() => useToolStore.getState().setActiveTool('area'));
    expect(screen.getByTestId('ribbon-tab-measure')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tool-measure-area')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ribbon-active-tool')).toHaveTextContent('Area');
    act(() => useToolStore.getState().setActiveTool('stamp'));
    expect(screen.getByTestId('ribbon-tab-insert')).toHaveAttribute('aria-selected', 'true');
    // Select y Pan siguen a la vista en cualquier pestaña
    expect(screen.getByTestId('tool-select')).toBeInTheDocument();
  });

  it('la cinta ya no lleva la tira de propiedades: el estilo vive en el panel de Propiedades (ADR-0064)', () => {
    render(<Ribbon />);
    expect(screen.queryByTestId('properties-bar')).toBeNull();
    expect(screen.queryByTestId('ribbon-group-style')).toBeNull();
    expect(screen.queryByTestId('ribbon-stroke-width')).toBeNull();
  });

  it('el riel derecho abre un panel a la vez y un segundo clic lo pliega', () => {
    render(
      <>
        <PropertiesInspectorPanel defaultCollapsed />
        <MeasurementsPanel defaultCollapsed />
        <RightRail />
      </>
    );
    fireEvent.click(screen.getByTestId('expand-properties-btn'));
    expect(screen.getByTestId('properties-inspector-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('expand-properties-btn')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('expand-measurements-btn'));
    expect(screen.getByTestId('measurements-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('properties-inspector-panel')).toHaveAttribute('data-collapsed', 'true');
    fireEvent.click(screen.getByTestId('expand-measurements-btn'));
    expect(screen.getByTestId('measurements-panel')).toHaveAttribute('data-collapsed', 'true');
  });
});

describe('Estructura de la ventana: menos bandas y lienzo como sujeto (ADR-0064)', () => {
  beforeEach(() => {
    useToolStore.setState({ activeTool: 'select' });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useUiStore.setState({ rightPanel: null, markupsListOpen: false });
  });

  it('una sola fila de navegación: los menús y las pestañas de la cinta comparten la cabecera y la tira de propiedades no existe', async () => {
    await act(async () => {
      render(<App />);
    });
    const tablists = screen.getAllByRole('tablist');
    expect(tablists).toHaveLength(1);
    const header = screen.getByRole('menubar').closest('header')!;
    expect(header).toContainElement(tablists[0]);
    expect(header).toContainElement(screen.getByTestId('ribbon-tab-markup'));
    // La cinta queda en una sola banda de herramientas, sin fila de pestañas propia ni tira de propiedades
    const ribbon = screen.getByTestId('ribbon');
    expect(ribbon.querySelector('[role="tablist"]')).toBeNull();
    expect(screen.getByTestId('ribbon-tools')).toHaveClass('h-[52px]');
    const selectGroup = screen.getByTestId('ribbon-group-select');
    expect(selectGroup.firstElementChild).toHaveClass('h-[28px]', 'shrink-0');
    expect(screen.queryByTestId('properties-bar')).toBeNull();
    expect(screen.queryByTestId('ribbon-group-style')).toBeNull();
  });

  it('el panel de Propiedades arranca plegado y el estilo se edita dentro de él al abrirlo', async () => {
    await act(async () => {
      render(<App />);
    });
    const panel = await screen.findByTestId('properties-inspector-panel');
    expect(panel).toHaveAttribute('data-collapsed', 'true');
    expect(useUiStore.getState().rightPanel).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('expand-properties-btn'));
    });
    expect(screen.getByTestId('properties-inspector-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('properties-style')).toBeInTheDocument();
  });

  it('herramientas planas sin tarjeta; la activa sin el azul del acento; grupos con divisor; lienzo como token más oscuro que los paneles', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');
    const rule = (sel: string) => {
      const i = css.indexOf(`${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    expect(rule('  .ribbon-tool')).toMatch(/border-radius: 0;/);
    expect(rule("  .ribbon-tool[aria-pressed='true']")).not.toMatch(/cad-accent/);
    expect(rule('  .ribbon-group')).toMatch(/gap: 4px;/);
    expect(rule('  .ribbon-group')).toMatch(/padding: 4px 8px;/);
    expect(rule('  .ribbon-group-label')).toMatch(/flex-shrink: 0;/);
    expect(rule('  .ribbon-group + .ribbon-group::before')).toMatch(/width: 1px;/);
    expect(rule('  .panel-header')).toMatch(/border-bottom: 1px solid/);
    // El lienzo es un token del tema, más oscuro que los paneles en ambos temas
    const tok = (block: string, name: string) => {
      const m = new RegExp(`--${name}: (\\d+) (\\d+) (\\d+);`).exec(block)!;
      return Number(m[1]) + Number(m[2]) + Number(m[3]);
    };
    const light = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const dark = css.slice(css.indexOf("[data-theme='dark'] {"), css.indexOf('}', css.indexOf("[data-theme='dark'] {")));
    expect(tok(light, 'cad-canvas')).toBeLessThan(tok(light, 'cad-panel'));
    expect(tok(dark, 'cad-canvas')).toBeLessThan(tok(dark, 'cad-panel'));
  });
});
