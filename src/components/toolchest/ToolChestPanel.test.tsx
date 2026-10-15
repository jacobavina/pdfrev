import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToolChestPanel } from './ToolChestPanel';
import { RightRail } from '../shell/RightRail';
import { useToolChestStore } from '../../store/useToolChestStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useToolStore } from '../../store/useToolStore';
import * as toolChestService from '../../services/toolChestService';
import { IDBFactory } from 'fake-indexeddb';

describe('ToolChestPanel (Panel Lateral de Tool Chest B.4)', () => {
  beforeEach(async () => {
    // Aislar base de datos en memoria para cada prueba
    const fakeIDB = new IDBFactory();
    toolChestService.setCustomIDBFactory(fakeIDB);
    await toolChestService.resetToolChestService();

    // Reset de stores
    useToolChestStore.setState({
      palettes: [],
      activePaletteId: null,
      tools: [],
      activeToolId: null,
      recentTools: [],
      isLoading: true,
      isPersistent: true,
      persistenceError: null,
    });
    await useToolChestStore.getState().init();

    useMarkupStore.setState({
      markups: [],
      selectedMarkupIds: [],
    });
    useToolStore.setState({
      activeTool: 'select',
      currentStyle: { strokeColor: '#000000', strokeWidth: 2, opacity: 1 },
    });
  });

  it('renderiza panel con paleta por defecto y sección de recientes', async () => {
    render(<ToolChestPanel defaultCollapsed={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('tool-chest-panel')).toBeInTheDocument();
      expect(screen.getByText('Tool Chest')).toBeInTheDocument();
      expect(screen.getByTestId('recent-tools-section')).toBeInTheDocument();
      const select = screen.getByTestId('palette-select') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('permite colapsar y expandir el panel lateral', async () => {
    // Plegado, el panel se abre desde el riel derecho (ADR-0044)
    render(
      <>
        <ToolChestPanel defaultCollapsed={false} />
        <RightRail />
      </>
    );

    await waitFor(() => {
      expect(screen.getByTestId('collapse-tool-chest-btn')).toBeInTheDocument();
    });

    // Colapsar
    await act(async () => {
      fireEvent.click(screen.getByTestId('collapse-tool-chest-btn'));
    });
    const panel = screen.getByTestId('tool-chest-panel');
    expect(panel.getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByTestId('expand-tool-chest-btn')).toBeInTheDocument();

    // Expandir
    await act(async () => {
      fireEvent.click(screen.getByTestId('expand-tool-chest-btn'));
    });
    expect(screen.getByTestId('tool-chest-panel').getAttribute('data-collapsed')).toBe('false');
  });

  it('permite alternar el modo de herramienta entre Dibujo (D) y Propiedad (P)', async () => {
    render(<ToolChestPanel defaultCollapsed={false} />);

    await waitFor(() => {
      expect(useToolChestStore.getState().isLoading).toBe(false);
      expect(useToolChestStore.getState().activePaletteId).not.toBeNull();
    });
    const palId = useToolChestStore.getState().activePaletteId!;

    let tool: any;
    await act(async () => {
      tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Rectángulo Estructural',
        type: 'rectangle',
        style: { strokeColor: '#0284c7', fillColor: 'rgba(2,132,199,0.1)', strokeWidth: 2, opacity: 1 },
        mode: 'drawing',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId(`tool-item-${tool.id}`)).toBeInTheDocument();
    });

    const toggleBtn = screen.getByTestId(`tool-mode-toggle-${tool.id}`);
    expect(toggleBtn.textContent).toBe('D');

    // Cambiar a Modo Propiedad
    await act(async () => {
      fireEvent.click(toggleBtn);
    });
    await waitFor(() => {
      expect(toggleBtn.textContent).toBe('P');
    });

    // Cambiar de vuelta a Modo Dibujo
    await act(async () => {
      fireEvent.click(toggleBtn);
    });
    await waitFor(() => {
      expect(toggleBtn.textContent).toBe('D');
    });
  });

  it('permite crear una nueva paleta con el formulario interactivo', async () => {
    render(<ToolChestPanel defaultCollapsed={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('create-palette-btn')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('create-palette-btn'));
    });
    const input = screen.getByTestId('new-palette-name-input');
    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Instalaciones Eléctricas' } });
      fireEvent.click(screen.getByTestId('save-palette-btn'));
    });

    await waitFor(() => {
      const select = screen.getByTestId('palette-select') as HTMLSelectElement;
      expect(select.textContent).toContain('Instalaciones Eléctricas');
    });
  });

  it('permite eliminar una herramienta de la paleta', async () => {
    render(<ToolChestPanel defaultCollapsed={false} />);

    await waitFor(() => {
      expect(useToolChestStore.getState().isLoading).toBe(false);
      expect(useToolChestStore.getState().activePaletteId).not.toBeNull();
    });
    const palId = useToolChestStore.getState().activePaletteId!;

    let tool: any;
    await act(async () => {
      tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Línea de Eje',
        type: 'line',
        style: { strokeColor: '#ef4444', strokeWidth: 2, opacity: 1 },
        mode: 'drawing',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId(`tool-item-${tool.id}`)).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTestId(`tool-delete-${tool.id}`);
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      expect(screen.queryByTestId(`tool-item-${tool.id}`)).toBeNull();
    });
  });

  it('aplica herramienta en Modo Dibujo al hacer clic activándola en useToolStore', async () => {
    render(<ToolChestPanel defaultCollapsed={false} />);

    await waitFor(() => {
      expect(useToolChestStore.getState().isLoading).toBe(false);
      expect(useToolChestStore.getState().activePaletteId).not.toBeNull();
    });
    const palId = useToolChestStore.getState().activePaletteId!;

    let tool: any;
    await act(async () => {
      tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Nube de Revisión',
        type: 'cloud',
        style: { strokeColor: '#16a34a', strokeWidth: 3, opacity: 0.8 },
        mode: 'drawing',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId(`tool-item-${tool.id}`)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId(`tool-item-${tool.id}`));
    });

    expect(useToolStore.getState().activeTool).toBe('cloud');
    expect(useToolStore.getState().currentStyle.strokeColor).toBe('#16a34a');
    expect(useToolStore.getState().currentStyle.strokeWidth).toBe(3);
  });

  it('aplica herramienta en Modo Propiedad sobre marcas seleccionadas en un único comando', async () => {
    // Crear marcas previas en useMarkupStore
    const m1 = {
      id: 'm1',
      type: 'rectangle' as const,
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }],
      style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: '',
      updatedAt: '',
      status: 'pending' as const,
    };
    const m2 = {
      id: 'm2',
      type: 'circle' as const,
      pageIndex: 0,
      points: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }],
      style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: '',
      updatedAt: '',
      status: 'pending' as const,
    };
    useMarkupStore.getState().addMarkup(m1);
    useMarkupStore.getState().addMarkup(m2);
    useMarkupStore.getState().selectMarkup('m1', false);
    useMarkupStore.getState().selectMarkup('m2', true); // m1 y m2 seleccionadas

    render(<ToolChestPanel defaultCollapsed={false} />);

    await waitFor(() => {
      expect(useToolChestStore.getState().isLoading).toBe(false);
      expect(useToolChestStore.getState().activePaletteId).not.toBeNull();
    });
    const palId = useToolChestStore.getState().activePaletteId!;

    let tool: any;
    await act(async () => {
      tool = await useToolChestStore.getState().createTool({
        paletteId: palId,
        name: 'Estilo Crítico',
        type: 'rectangle',
        style: { strokeColor: '#db2777', fillColor: 'rgba(219,39,119,0.3)', strokeWidth: 4, opacity: 0.9 },
        mode: 'properties',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId(`tool-item-${tool.id}`)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId(`tool-item-${tool.id}`));
    });

    const updatedMarkups = useMarkupStore.getState().markups;
    const updatedM1 = updatedMarkups.find((m) => m.id === 'm1')!;
    const updatedM2 = updatedMarkups.find((m) => m.id === 'm2')!;

    expect(updatedM1.style.strokeColor).toBe('#db2777');
    expect(updatedM1.style.strokeWidth).toBe(4);
    expect(updatedM2.style.strokeColor).toBe('#db2777');
    expect(updatedM2.style.strokeWidth).toBe(4);

    // Reversible en un único comando de historial (Ctrl+Z revierte ambas marcas)
    useMarkupStore.getState().undo();
    const revertedMarkups = useMarkupStore.getState().markups;
    expect(revertedMarkups.find((m) => m.id === 'm1')!.style.strokeColor).toBe('#000000');
    expect(revertedMarkups.find((m) => m.id === 'm2')!.style.strokeColor).toBe('#000000');
  });

  it('permite limpiar el historial de herramientas recientes', async () => {
    render(<ToolChestPanel defaultCollapsed={false} />);

    await waitFor(() => {
      expect(useToolChestStore.getState().isLoading).toBe(false);
    });

    const recentSample = {
      id: 'rec-1',
      name: 'Nota reciente',
      type: 'stickyNote' as const,
      style: { strokeColor: '#ca8a04', fillColor: '#fef08a', strokeWidth: 1, opacity: 1 },
      mode: 'drawing' as const,
      lastUsedAt: new Date().toISOString(),
      useCount: 1,
    };
    await act(async () => {
      await useToolChestStore.getState().recordRecent(recentSample as any);
    });

    await waitFor(() => {
      expect(screen.getByTestId('clear-recent-tools-btn')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('clear-recent-tools-btn'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('clear-recent-tools-btn')).toBeNull();
      expect(screen.getByText('No recent tools')).toBeInTheDocument();
    });
  });
});
