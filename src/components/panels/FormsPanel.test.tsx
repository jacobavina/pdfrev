import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FormsPanel } from './FormsPanel';
import { MenuBar } from '../shell/MenuBar';
import { LeftDock } from '../shell/LeftDock';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import type { Markup } from '../../types/markup';

const toasts: string[] = [];
const exported: { name: string; text: string }[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/exportService', async () => {
  const real = await vi.importActual<typeof import('../../services/exportService')>('../../services/exportService');
  return {
    ...real,
    saveExportFileWithDialog: vi.fn().mockImplementation(async (name: string, _e: string, bytes: Uint8Array) => {
      exported.push({ name, text: new TextDecoder().decode(bytes.slice(3)) });
      return true;
    }),
  };
});

const field = (id: string, pageIndex: number, y: number, custom: Record<string, string | number>, extra: Partial<Markup> = {}): Markup =>
  ({ id, type: 'formField', pageIndex, points: [{ x: 0.1, y }, { x: 0.4, y: y + 0.05 }], style: { strokeColor: '#00f', strokeWidth: 1, opacity: 1 }, author: 'a', createdAt: '', updatedAt: '', status: 'pending', customFields: custom, ...extra }) as Markup;
const get = (id: string) => useMarkupStore.getState().markups.find((m) => m.id === id)!;

describe('Panel Forms (ADR-0121)', () => {
  beforeEach(() => {
    toasts.length = 0;
    exported.length = 0;
    useDocumentStore.setState({ numPages: 2, currentPageIndex: 0, fileName: 'Solicitud.pdf', pageLabels: null });
    useUiStore.setState({ leftOpen: true, leftTab: 'forms' });
    useMarkupStore.setState({
      markups: [
        field('nom', 0, 0.1, { fieldType: 'text', fieldName: 'Nombre', fieldValue: 'Ana' }),
        field('ape', 0, 0.2, { fieldType: 'text', fieldName: 'Apellido' }),
        field('ok', 0, 0.3, { fieldType: 'checkbox', fieldName: 'Acepto', fieldValue: 'Off' }),
        field('r1', 1, 0.1, { fieldType: 'radio', fieldName: 'Tipo', radioValue: 'A', fieldValue: 'Yes' }),
        field('r2', 1, 0.2, { fieldType: 'radio', fieldName: 'Tipo', radioValue: 'B', fieldValue: 'Off' }),
        field('pais', 1, 0.3, { fieldType: 'dropdown', fieldName: 'Pais', fieldOptions: 'México\nPerú' }),
        field('firma', 1, 0.4, { fieldType: 'signature', fieldName: 'Firma1' }),
        field('bloq', 1, 0.5, { fieldType: 'text', fieldName: 'Fijo' }, { locked: true }),
      ],
      selectedMarkupIds: [],
    });
    useMarkupStore.getState().clearHistory();
  });

  it('lista los campos por página con su avance, sin las firmas', () => {
    render(<FormsPanel />);
    expect(screen.getByTestId('forms-progress')).toHaveTextContent('2 of 7 filled');
    expect(screen.getByTestId('forms-page-0').querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByTestId('forms-page-1').querySelectorAll('li')).toHaveLength(4);
    expect(screen.queryByTestId('form-row-firma')).toBeNull();
    expect(screen.getByTestId('form-value-nom')).toHaveValue('Ana');
  });

  it('un texto se guarda al salir del campo o con Enter, Escape lo descarta y se deshace', () => {
    render(<FormsPanel />);
    const box = screen.getByTestId('form-value-ape');
    fireEvent.change(box, { target: { value: 'López' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.blur(box);
    expect(get('ape').customFields?.fieldValue).toBe('López');
    fireEvent.change(box, { target: { value: 'otra cosa' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveValue('López');
    act(() => useMarkupStore.getState().undo());
    expect(get('ape').customFields?.fieldValue).toBeUndefined();
    expect(screen.getByTestId('forms-progress')).toHaveTextContent('2 of 7 filled');
  });

  it('una casilla se marca y un botón de opción deja solo uno marcado en su grupo', () => {
    render(<FormsPanel />);
    fireEvent.click(screen.getByTestId('form-check-ok'));
    expect(get('ok').customFields?.fieldValue).toBe('Yes');
    fireEvent.click(screen.getByTestId('form-check-r2'));
    expect(get('r2').customFields?.fieldValue).toBe('Yes');
    expect(get('r1').customFields?.fieldValue).toBe('Off');
  });

  it('un desplegable ofrece sus opciones y guarda la elegida', () => {
    render(<FormsPanel />);
    const select = screen.getByTestId('form-select-pais');
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['—', 'México', 'Perú']);
    fireEvent.change(select, { target: { value: 'Perú' } });
    expect(get('pais').customFields?.fieldValue).toBe('Perú');
  });

  it('un campo bloqueado no se edita', () => {
    render(<FormsPanel />);
    expect(screen.getByTestId('form-value-bloq')).toBeDisabled();
  });

  it('el botón del siguiente vacío va a ese campo y lo selecciona, y da la vuelta al llegar al final', () => {
    render(<FormsPanel />);
    fireEvent.click(screen.getByTestId('forms-next-empty'));
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['ape']);
    expect(useDocumentStore.getState().currentPageIndex).toBe(0);
    fireEvent.click(screen.getByTestId('forms-next-empty'));
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['ok']);
    act(() => useMarkupStore.setState({ selectedMarkupIds: ['pais'] }));
    fireEvent.click(screen.getByTestId('forms-next-empty'));
    // Tras el desplegable solo queda el campo bloqueado (se salta): vuelve al principio
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['ape']);
  });

  it('con todo relleno avisa de que no queda nada vacío', () => {
    useMarkupStore.setState({ markups: [field('a', 0, 0.1, { fieldType: 'text', fieldName: 'A', fieldValue: 'x' })] });
    render(<FormsPanel />);
    fireEvent.click(screen.getByTestId('forms-next-empty'));
    expect(toasts.at(-1)).toBe('Every field is filled in.');
  });

  it('vaciar el formulario limpia lo rellenado menos los bloqueados y se deshace', () => {
    render(<FormsPanel />);
    fireEvent.click(screen.getByTestId('form-check-ok'));
    fireEvent.click(screen.getByTestId('forms-clear'));
    expect(get('nom').customFields?.fieldValue).toBe('');
    expect(get('ok').customFields?.fieldValue).toBe('Off');
    expect(get('r1').customFields?.fieldValue).toBe('Off');
    expect(screen.getByTestId('forms-progress')).toHaveTextContent('0 of 7 filled');
    expect(toasts.at(-1)).toMatch(/cleared/);
    act(() => useMarkupStore.getState().undo());
    act(() => useMarkupStore.getState().undo());
    expect(get('nom').customFields?.fieldValue).toBe('Ana');
  });

  it('exporta los valores como CSV', async () => {
    render(<FormsPanel />);
    fireEvent.click(screen.getByTestId('forms-export'));
    await waitFor(() => expect(exported).toHaveLength(1));
    expect(exported[0].name).toBe('Solicitud_form.csv');
    const lines = exported[0].text.split('\r\n');
    expect(lines[0]).toBe('Page,Name,Type,Value');
    expect(lines).toContain('Page 1,Nombre,Text Box,Ana');
    expect(lines).toContain('Page 2,Tipo,Radio Button,A');
  });

  it('sin campos lo explica, y View ▸ Panels ▸ Forms Panel y la pestaña abren el panel', () => {
    useMarkupStore.setState({ markups: [] });
    const { unmount } = render(<FormsPanel />);
    expect(screen.getByTestId('forms-empty')).toHaveTextContent('no form fields');
    unmount();
    useUiStore.setState({ leftOpen: false, leftTab: 'pages' });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
    fireEvent.click(screen.getByTestId('menu-panel-forms'));
    expect(useUiStore.getState()).toMatchObject({ leftTab: 'forms', leftOpen: true });
    render(<LeftDock />);
    expect(screen.getByTestId('left-tab-forms')).toBeInTheDocument();
  });
});
