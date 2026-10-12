import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkupsList } from './MarkupsList';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolChestStore } from '../store/useToolChestStore';
import * as toolChestService from '../services/toolChestService';
import { IDBFactory } from 'fake-indexeddb';
import { Markup } from '../types/markup';

describe('MarkupsList Context Menu (Añadir a Tool Chest B.4)', () => {
  beforeEach(async () => {
    const fakeIDB = new IDBFactory();
    toolChestService.setCustomIDBFactory(fakeIDB);
    await toolChestService.resetToolChestService();

    useMarkupStore.setState({
      markups: [
        {
          id: 'markup-test-1',
          type: 'rectangle',
          pageIndex: 0,
          points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }],
          style: { strokeColor: '#2563eb', strokeWidth: 3, opacity: 1 },
          text: 'Viga principal',
          author: 'Ing. Estructural',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'pending',
        },
      ],
      selectedMarkupIds: [],
    });

    useToolChestStore.setState({
      palettes: [
        {
          id: 'test-palette-1',
          name: 'Mis Herramientas',
          isDefault: true,
          order: 0,
          createdAt: new Date().toISOString(),
        },
      ],
      activePaletteId: 'test-palette-1',
      tools: [],
      recentTools: [],
      isLoading: false,
      isPersistent: true,
      persistenceError: null,
    });
  });

  it('abre menú contextual con opción "Añadir a Tool Chest" al hacer clic derecho en la fila', async () => {
    render(<MarkupsList />);

    const row = screen.getByTestId('markup-row-markup-test-1');
    expect(row).toBeInTheDocument();

    // Clic derecho (contextmenu)
    fireEvent.contextMenu(row, { clientX: 200, clientY: 300 });

    const menu = screen.getByTestId('markups-list-context-menu');
    expect(menu).toBeInTheDocument();

    const addBtn = screen.getByTestId('context-menu-add-to-toolchest');
    expect(addBtn).toBeInTheDocument();
    expect(addBtn.textContent).toContain('Add to Tool Chest');

    // Al hacer clic, añade la herramienta a la paleta activa
    fireEvent.click(addBtn);

    await waitFor(() => {
      const tools = useToolChestStore.getState().tools;
      expect(tools.length).toBe(1);
      expect(tools[0].type).toBe('rectangle');
      expect(tools[0].paletteId).toBe('test-palette-1');
    });

    // El menú debe cerrarse tras la acción
    expect(screen.queryByTestId('markups-list-context-menu')).toBeNull();
  });

  it('permite añadir a Tool Chest mediante el botón de acción en la fila', async () => {
    render(<MarkupsList />);

    const actionBtn = screen.getByTestId('add-to-toolchest-btn-markup-test-1');
    expect(actionBtn).toBeInTheDocument();

    fireEvent.click(actionBtn);

    await waitFor(() => {
      const tools = useToolChestStore.getState().tools;
      expect(tools.length).toBe(1);
      expect(tools[0].type).toBe('rectangle');
      expect(tools[0].text).toBe('Viga principal');
    });
  });

  describe('P2-C.1 Filtros, ordenación y barra de herramientas', () => {
    beforeEach(() => {
      useMarkupStore.setState({
        markups: [
          {
            id: 'm-1',
            type: 'rectangle',
            pageIndex: 0,
            points: [{ x: 0.1, y: 0.1 }],
            style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
            text: 'Viga IPE 300',
            author: 'Carlos Ing',
            createdAt: '2026-03-01T10:00:00.000Z',
            updatedAt: '2026-03-01T10:00:00.000Z',
            status: 'pending',
          },
          {
            id: 'm-2',
            type: 'cloud',
            pageIndex: 1,
            points: [{ x: 0.2, y: 0.2 }],
            style: { strokeColor: '#00ff00', strokeWidth: 2, opacity: 1 },
            text: 'Revisar cota',
            author: 'Beatriz Arq',
            createdAt: '2026-03-02T10:00:00.000Z',
            updatedAt: '2026-03-02T10:00:00.000Z',
            status: 'accepted',
            groupId: 'grp-1',
          },
        ],
        selectedMarkupIds: [],
      });
    });

    it('conserva los invariantes críticos de E2E: colapso en primer botón y primer input text en la fila', () => {
      render(<MarkupsList />);
      const panel = screen.getByTestId('markups-list-panel');

      // 1. El primer botón del panel debe ser el de colapsar/expandir
      const firstButton = panel.querySelectorAll('button')[0];
      expect(firstButton.textContent).toContain('Markups List');

      // Al colapsar, mide 32px
      fireEvent.click(firstButton);
      expect(panel).toHaveStyle({ height: '32px' });

      // Re-expandir
      fireEvent.click(firstButton);
      expect(panel).toHaveStyle({ height: '200px' });

      // 2. El primer input[type="text"] dentro del panel es el campo de comentario de la fila (guarda de foco A.6)
      const firstTextInput = panel.querySelector('input[type="text"]') as HTMLInputElement;
      expect(firstTextInput).not.toBeNull();
      expect(firstTextInput.value).toBe('Viga IPE 300');
    });

    it('filtra por término de búsqueda en markups-search-input', () => {
      render(<MarkupsList />);
      expect(screen.getByTestId('markup-row-m-1')).toBeInTheDocument();
      expect(screen.getByTestId('markup-row-m-2')).toBeInTheDocument();

      const searchInput = screen.getByTestId('markups-search-input');
      fireEvent.change(searchInput, { target: { value: 'cota' } });

      expect(screen.queryByTestId('markup-row-m-1')).toBeNull();
      expect(screen.getByTestId('markup-row-m-2')).toBeInTheDocument();
    });

    it('filtra por tipo en markups-filter-type', () => {
      render(<MarkupsList />);
      const typeSelect = screen.getByTestId('markups-filter-type');
      fireEvent.change(typeSelect, { target: { value: 'cloud' } });

      expect(screen.queryByTestId('markup-row-m-1')).toBeNull();
      expect(screen.getByTestId('markup-row-m-2')).toBeInTheDocument();
    });

    it('filtra por autor en markups-filter-author', () => {
      render(<MarkupsList />);
      const authorSelect = screen.getByTestId('markups-filter-author');
      fireEvent.change(authorSelect, { target: { value: 'Carlos Ing' } });

      expect(screen.getByTestId('markup-row-m-1')).toBeInTheDocument();
      expect(screen.queryByTestId('markup-row-m-2')).toBeNull();
    });

    it('filtra por estado en markups-filter-status', () => {
      render(<MarkupsList />);
      const statusSelect = screen.getByTestId('markups-filter-status');
      fireEvent.change(statusSelect, { target: { value: 'accepted' } });

      expect(screen.queryByTestId('markup-row-m-1')).toBeNull();
      expect(screen.getByTestId('markup-row-m-2')).toBeInTheDocument();
    });

    it('muestra mensaje vacío y permite restablecer con botón de limpiar', () => {
      render(<MarkupsList />);
      const searchInput = screen.getByTestId('markups-search-input');
      fireEvent.change(searchInput, { target: { value: 'sin_resultados_xyz' } });

      expect(screen.getByTestId('markups-empty-message')).toBeInTheDocument();

      const resetBtn = screen.getByTestId('markups-reset-filters-btn');
      fireEvent.click(resetBtn);

      expect(screen.getByTestId('markup-row-m-1')).toBeInTheDocument();
      expect(screen.getByTestId('markup-row-m-2')).toBeInTheDocument();
    });

    it('ordena por columna al hacer clic en la cabecera th', () => {
      render(<MarkupsList />);
      const authorTh = screen.getByTitle('Sort by author');

      // Clic inicial -> asc (Beatriz Arq antes de Carlos Ing)
      fireEvent.click(authorTh);
      expect(screen.getByTestId('sort-indicator-author')).toHaveTextContent('▲');

      let rows = screen.getAllByTestId(/^markup-row-/);
      expect(rows[0]).toHaveAttribute('data-testid', 'markup-row-m-2');
      expect(rows[1]).toHaveAttribute('data-testid', 'markup-row-m-1');

      // Segundo clic -> desc (Carlos Ing antes de Beatriz Arq)
      fireEvent.click(authorTh);
      expect(screen.getByTestId('sort-indicator-author')).toHaveTextContent('▼');

      rows = screen.getAllByTestId(/^markup-row-/);
      expect(rows[0]).toHaveAttribute('data-testid', 'markup-row-m-1');
      expect(rows[1]).toHaveAttribute('data-testid', 'markup-row-m-2');
    });

    it('abre menú contextual con clic derecho en la fila y muestra opciones de estado técnico', () => {
      render(<MarkupsList />);
      const row = screen.getByTestId('markup-row-m-1');

      // Clic derecho en la fila
      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 });

      const menu = screen.getByTestId('markups-list-context-menu');
      expect(menu).toBeInTheDocument();
      expect(screen.getByTestId('context-menu-add-to-toolchest')).toBeInTheDocument();
      expect(screen.getByTestId('context-menu-status-pending')).toBeInTheDocument();
      expect(screen.getByTestId('context-menu-status-accepted')).toBeInTheDocument();
      expect(screen.getByTestId('context-menu-status-rejected')).toBeInTheDocument();
      expect(screen.getByTestId('context-menu-status-completed')).toBeInTheDocument();
      expect(screen.getByTestId('context-menu-status-cancelled')).toBeInTheDocument();
    });

    it('permite cambiar estado a aceptado desde el menú contextual y cierra el menú', () => {
      render(<MarkupsList />);
      const row = screen.getByTestId('markup-row-m-1');

      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 });
      const acceptedOption = screen.getByTestId('context-menu-status-accepted');
      fireEvent.click(acceptedOption);

      // El menú debe cerrarse
      expect(screen.queryByTestId('markups-list-context-menu')).not.toBeInTheDocument();

      // El estado de m-1 debe ser 'accepted' en el store
      expect(useMarkupStore.getState().markups.find((m) => m.id === 'm-1')?.status).toBe('accepted');
    });

    it('cierra el menú contextual al presionar la tecla Escape', () => {
      render(<MarkupsList />);
      const row = screen.getByTestId('markup-row-m-1');

      fireEvent.contextMenu(row, { clientX: 100, clientY: 200 });
      expect(screen.getByTestId('markups-list-context-menu')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('markups-list-context-menu')).not.toBeInTheDocument();
    });

    it('Condición 3: cambia el estado de todo el grupo desde el menú contextual', () => {
      const g1: Markup = {
        id: 'grp-item-1',
        type: 'highlightText',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.15 }],
        style: { strokeColor: '#ffff00', strokeWidth: 1, opacity: 0.5 },
        status: 'pending',
        groupId: 'multiline-text-group',
        author: 'Revisor',
        createdAt: '2026-10-10T10:00:00.000Z',
        updatedAt: '2026-10-10T10:00:00.000Z',
      };
      const g2: Markup = {
        id: 'grp-item-2',
        type: 'highlightText',
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.16 }, { x: 0.35, y: 0.21 }],
        style: { strokeColor: '#ffff00', strokeWidth: 1, opacity: 0.5 },
        status: 'pending',
        groupId: 'multiline-text-group',
        author: 'Revisor',
        createdAt: '2026-10-10T10:00:00.000Z',
        updatedAt: '2026-10-10T10:00:00.000Z',
      };
      useMarkupStore.setState({ markups: [g1, g2] });

      render(<MarkupsList />);
      const row = screen.getByTestId('markup-row-grp-item-1');

      fireEvent.contextMenu(row, { clientX: 120, clientY: 220 });
      const completedOption = screen.getByTestId('context-menu-status-completed');
      fireEvent.click(completedOption);

      // Ambas marcas del grupo deben haberse actualizado atómicamente a 'completed'
      const state = useMarkupStore.getState();
      expect(state.markups.find((m) => m.id === 'grp-item-1')?.status).toBe('completed');
      expect(state.markups.find((m) => m.id === 'grp-item-2')?.status).toBe('completed');
    });
  });

  describe('Botones de Exportación (P2-C.4)', () => {
    it('renderiza los botones de exportar CSV y Reporte PDF en la cabecera', () => {
      render(<MarkupsList />);
      const csvBtn = screen.getByTestId('export-csv-button');
      const pdfBtn = screen.getByTestId('export-pdf-report-button');
      expect(csvBtn).toBeInTheDocument();
      expect(pdfBtn).toBeInTheDocument();
      expect(csvBtn).toHaveTextContent('CSV');
      expect(pdfBtn).toHaveTextContent('PDF Report');
    });
  });
});

