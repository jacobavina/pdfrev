import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { watchSelectionPanels } from './selectionPanelService';
import { panelForSelection } from '../core/markup/selectionPanel';
import { useMarkupStore } from '../store/useMarkupStore';
import { useUiStore } from '../store/useUiStore';
import { Markup, MarkupType } from '../types/markup';

const mk = (id: string, type: MarkupType, measured = false): Markup => ({
  id,
  type,
  pageIndex: 0,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
  style: { strokeColor: '#e02424', strokeWidth: 1, opacity: 1 },
  author: 'Reviewer',
  createdAt: '',
  updatedAt: '',
  status: 'pending',
  ...(measured ? { measurement: { value: 3, unit: 'm' as const, formatted: '3 m' } } : {}),
});

const callout = mk('co', 'callout');
const length = mk('ln', 'length', true);

describe('Panel que se abre al seleccionar (ADR-0043)', () => {
  let stop: () => void;
  beforeEach(() => {
    useMarkupStore.setState({ markups: [callout, length], selectedMarkupIds: [] });
    useUiStore.setState({ autoOpenPanels: true, propertiesOpenRequest: 0, measurementsOpenRequest: 0 });
    stop = watchSelectionPanels(window);
  });
  afterEach(() => stop());

  it('una marca abre Properties y una medición abre Measure; quitar la selección no abre nada', () => {
    expect(panelForSelection([callout])).toBe('properties');
    expect(panelForSelection([length])).toBe('measure');
    expect(panelForSelection([callout, length])).toBe('properties');
    expect(panelForSelection([])).toBeNull();
    useMarkupStore.getState().setSelectedMarkupIds(['co']);
    expect(useUiStore.getState().propertiesOpenRequest).toBe(1);
    useMarkupStore.getState().setSelectedMarkupIds(['ln']);
    expect(useUiStore.getState().measurementsOpenRequest).toBe(1);
    useMarkupStore.getState().setSelectedMarkupIds([]);
    expect(useUiStore.getState().propertiesOpenRequest + useUiStore.getState().measurementsOpenRequest).toBe(2);
  });

  it('con el botón pulsado espera a soltarlo, para no mover el plano en medio de un arrastre', () => {
    window.dispatchEvent(new Event('pointerdown'));
    useMarkupStore.getState().setSelectedMarkupIds(['co']);
    expect(useUiStore.getState().propertiesOpenRequest).toBe(0);
    window.dispatchEvent(new Event('pointerup'));
    expect(useUiStore.getState().propertiesOpenRequest).toBe(1);
  });

  it('se apaga en View ▸ Open Panel on Selection y la preferencia se guarda', () => {
    useUiStore.getState().setAutoOpenPanels(false);
    expect(localStorage.getItem('rea-auto-panels')).toBe('0');
    useMarkupStore.getState().setSelectedMarkupIds(['co']);
    expect(useUiStore.getState().propertiesOpenRequest).toBe(0);
    useUiStore.getState().setAutoOpenPanels(true);
  });
});
