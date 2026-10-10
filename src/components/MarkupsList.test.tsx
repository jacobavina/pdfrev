import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarkupsList } from './MarkupsList';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolChestStore } from '../store/useToolChestStore';
import * as toolChestService from '../services/toolChestService';
import { IDBFactory } from 'fake-indexeddb';

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
    expect(addBtn.textContent).toContain('Añadir a Tool Chest');

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
});
