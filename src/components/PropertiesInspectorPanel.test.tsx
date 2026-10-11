import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PropertiesInspectorPanel } from './PropertiesInspectorPanel';
import { useMarkupStore } from '../store/useMarkupStore';
import { Markup } from '../types/markup';

describe('PropertiesInspectorPanel (P2-C.6 / ADR-0012)', () => {
  beforeEach(() => {
    useMarkupStore.setState({
      markups: [],
      selectedMarkupIds: [],
    });
  });

  it('muestra mensaje vacío informativo cuando no hay marcas seleccionadas', () => {
    render(<PropertiesInspectorPanel />);
    const panel = screen.getByTestId('properties-inspector-panel');
    expect(panel).toBeInTheDocument();
    const emptyMsg = screen.getByTestId('properties-empty-message');
    expect(emptyMsg).toHaveTextContent(/selecciona una o más marcas/i);
  });

  it('muestra las propiedades exactas de una única marca seleccionada', () => {
    const mk1: Markup = {
      id: 'single-1',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }],
      style: {
        strokeColor: '#ff0000',
        fillColor: '#00ff00',
        strokeWidth: 3,
        opacity: 0.8,
      },
      text: 'Nota inicial',
      author: 'Arquitecto Principal',
      status: 'pending',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
    };

    useMarkupStore.setState({
      markups: [mk1],
      selectedMarkupIds: ['single-1'],
    });

    render(<PropertiesInspectorPanel />);

    expect(screen.getByTestId('selection-count-badge')).toHaveTextContent('1 marca');
    expect(screen.getByTestId('prop-stroke-color')).toHaveValue('#ff0000');
    expect(screen.getByTestId('prop-stroke-width')).toHaveValue(3);
    expect(screen.getByTestId('prop-status')).toHaveValue('pending');
    expect(screen.getByTestId('prop-author')).toHaveValue('Arquitecto Principal');
    expect(screen.getByTestId('prop-text')).toHaveValue('Nota inicial');
  });

  it('muestra valores mixtos (—) en multiselección cuando los valores difieren', () => {
    const mk1: Markup = {
      id: 'multi-1',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0, y: 0 }],
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      text: 'Texto A',
      author: 'Autor A',
      status: 'accepted',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
    };

    const mk2: Markup = {
      id: 'multi-2',
      type: 'circle',
      pageIndex: 0,
      points: [{ x: 0, y: 0 }],
      style: { strokeColor: '#0000ff', strokeWidth: 5, opacity: 1 },
      text: 'Texto B',
      author: 'Autor B',
      status: 'rejected',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
    };

    useMarkupStore.setState({
      markups: [mk1, mk2],
      selectedMarkupIds: ['multi-1', 'multi-2'],
    });

    render(<PropertiesInspectorPanel />);

    expect(screen.getByTestId('selection-count-badge')).toHaveTextContent('2 marcas');

    // Grosor difiere: input numérico debe tener placeholder '—'
    const strokeWidthInput = screen.getByTestId('prop-stroke-width');
    expect(strokeWidthInput).toHaveAttribute('placeholder', '—');

    // Estado difiere: select debe tener valor ''
    const statusSelect = screen.getByTestId('prop-status');
    expect(statusSelect).toHaveValue('');

    // Texto difiere: textarea debe tener placeholder '—'
    const textInput = screen.getByTestId('prop-text');
    expect(textInput).toHaveAttribute('placeholder', '—');
  });

  it('aplica cambios uniformemente a toda la selección con soporte para deshacer (undo)', () => {
    const mk1: Markup = {
      id: 'undo-1',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0, y: 0 }],
      style: { strokeColor: '#111111', strokeWidth: 2, opacity: 1 },
      author: 'A',
      status: 'pending',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
    };

    const mk2: Markup = {
      id: 'undo-2',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0, y: 0 }],
      style: { strokeColor: '#222222', strokeWidth: 2, opacity: 1 },
      author: 'B',
      status: 'pending',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
    };

    useMarkupStore.setState({
      markups: [mk1, mk2],
      selectedMarkupIds: ['undo-1', 'undo-2'],
    });

    render(<PropertiesInspectorPanel />);

    // Cambiar estado a 'completed'
    const statusSelect = screen.getByTestId('prop-status');
    act(() => {
      fireEvent.change(statusSelect, { target: { value: 'completed' } });
    });

    let state = useMarkupStore.getState();
    expect(state.markups[0].status).toBe('completed');
    expect(state.markups[1].status).toBe('completed');

    // Deshacer con undo
    act(() => {
      useMarkupStore.getState().undo();
    });

    state = useMarkupStore.getState();
    expect(state.markups[0].status).toBe('pending');
    expect(state.markups[1].status).toBe('pending');
  });
});
