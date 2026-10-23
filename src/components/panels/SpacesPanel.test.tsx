import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { SpacesPanel } from './SpacesPanel';
import { MenuBar } from '../shell/MenuBar';
import { LeftDock } from '../shell/LeftDock';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useUiStore } from '../../store/useUiStore';
import { saveIncrementalMarkups } from '../../core/pdf/incrementalWriter';
import { importPdfAnnotations } from '../../core/pdf/annotationReader';
import { measureLabelText } from '../../core/markup/render';
import { isSpace, spaceInfo } from '../../core/measurements/spaces';
import type { Markup } from '../../types/markup';

const toasts: string[] = [];
const exported: { name: string; ext: string; text: string }[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/exportService', async () => {
  const real = await vi.importActual<typeof import('../../services/exportService')>('../../services/exportService');
  return {
    ...real,
    saveExportFileWithDialog: vi.fn().mockImplementation(async (name: string, ext: string, bytes: Uint8Array) => {
      exported.push({ name, ext, text: new TextDecoder().decode(bytes.slice(3)) });
      return true;
    }),
  };
});

const area = (id: string, pageIndex: number, value: number, extra: Partial<Markup> = {}): Markup =>
  ({
    id,
    type: 'area',
    pageIndex,
    points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.5 }],
    style: { strokeColor: '#000', fillColor: '#ccc', strokeWidth: 1, opacity: 1 },
    author: 'a',
    createdAt: '',
    updatedAt: '',
    status: 'pending',
    measurement: { value, unit: 'm', formatted: `${value.toFixed(2)} m²`, perimeter: 10 },
    ...extra,
  }) as Markup;
const get = (id: string) => useMarkupStore.getState().markups.find((m) => m.id === id)!;

describe('Spaces: panel de salas sobre mediciones de área (ADR-0118)', () => {
  beforeEach(() => {
    toasts.length = 0;
    exported.length = 0;
    useDocumentStore.setState({ numPages: 3, currentPageIndex: 0, fileName: 'Obra.pdf', pageLabels: null, pdfDoc: {} as never, pdfBytes: new Uint8Array([1]) });
    useUiStore.setState({ leftOpen: true, leftTab: 'spaces' });
    useMarkupStore.setState({
      markups: [area('a', 0, 12.5), area('b', 0, 20), area('c', 1, 30), { ...area('r', 0, 5), type: 'rectangle', measurement: undefined } as Markup],
      selectedMarkupIds: [],
    });
    useMarkupStore.getState().clearHistory();
  });

  it('Make space convierte las áreas seleccionadas en espacios con nombre automático y etiqueta sobre el plano', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['a', 'b', 'r'] });
    render(<SpacesPanel />);
    expect(screen.getByTestId('spaces-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('spaces-make'));
    expect(isSpace(get('a'))).toBe(true);
    expect(spaceInfo(get('a')).name).toBe('Space 1');
    expect(spaceInfo(get('b')).name).toBe('Space 2');
    expect(isSpace(get('r'))).toBe(false); // un rectángulo no es una medición de área
    // El nombre es la etiqueta de la medición: se ve sobre el plano y en el PDF
    expect(measureLabelText(get('a'), '12.50 m²')).toContain('Space 1');
    expect(toasts.at(-1)).toBe('2 spaces created. Name and number them in the Spaces panel.');
    expect(screen.getByTestId('space-name-a')).toHaveValue('Space 1');
  });

  it('sin áreas seleccionadas el botón está desactivado y el comando de Edit lo explica', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['r'] });
    render(<SpacesPanel />);
    expect(screen.getByTestId('spaces-make')).toBeDisabled();
    expect(useMarkupStore.getState().markups.some(isSpace)).toBe(false);
  });

  it('número y nombre se guardan al salir del campo o con Enter, Escape descarta, y cada cambio se deshace', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['a'] });
    render(<SpacesPanel />);
    fireEvent.click(screen.getByTestId('spaces-make'));
    const name = screen.getByTestId('space-name-a');
    fireEvent.change(name, { target: { value: 'Sala de juntas' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.blur(name);
    const number = screen.getByTestId('space-number-a');
    fireEvent.change(number, { target: { value: '101' } });
    fireEvent.blur(number);
    expect(spaceInfo(get('a'))).toEqual({ name: 'Sala de juntas', number: '101' });
    expect(get('a').customFields?.measureLabel).toBe('101 · Sala de juntas');
    // Escape devuelve el valor guardado
    fireEvent.change(name, { target: { value: 'Otra cosa' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(name).toHaveValue('Sala de juntas');
    expect(spaceInfo(get('a')).name).toBe('Sala de juntas');
    act(() => useMarkupStore.getState().undo());
    expect(spaceInfo(get('a')).number).toBe('');
    act(() => useMarkupStore.getState().undo());
    expect(spaceInfo(get('a')).name).toBe('Space 1');
  });

  it('agrupa por nivel con su subtotal, ordena por número natural y suma el total', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['a', 'b', 'c'] });
    render(<SpacesPanel />);
    fireEvent.click(screen.getByTestId('spaces-make'));
    act(() => {
      useMarkupStore.getState().replaceMarkups([{ ...get('a'), customFields: { ...get('a').customFields, spaceNumber: '10' } }, { ...get('b'), customFields: { ...get('b').customFields, spaceNumber: '2' } }], 'n');
    });
    const rows = [...screen.getByTestId('spaces-level-0').querySelectorAll('li')].map((li) => li.getAttribute('data-testid'));
    expect(rows).toEqual(['space-row-b', 'space-row-a']);
    expect(screen.getByTestId('spaces-subtotal-0')).toHaveTextContent('32.50 m²');
    expect(screen.getByTestId('spaces-subtotal-1')).toHaveTextContent('30.00 m²');
    expect(screen.getByTestId('spaces-total')).toHaveTextContent('Total · 3 spaces');
    expect(screen.getByTestId('spaces-total')).toHaveTextContent('62.50 m²');
    expect(screen.getByTestId('space-figures-a')).toHaveTextContent('12.50 m² · perimeter 10.00 m');
    // El nivel usa la etiqueta de página si el PDF la tiene
    act(() => useDocumentStore.setState({ pageLabels: { 0: 'P-01' } as never }));
    expect(screen.getByTestId('spaces-level-0')).toHaveTextContent('P-01');
  });

  it('un clic en el icono va a la página del espacio y lo selecciona; quitar el espacio deja la medición', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['c'] });
    render(<SpacesPanel />);
    fireEvent.click(screen.getByTestId('spaces-make'));
    useMarkupStore.setState({ selectedMarkupIds: [] });
    fireEvent.click(screen.getByTestId('space-row-c').querySelector('button')!);
    expect(useDocumentStore.getState().currentPageIndex).toBe(1);
    expect(useMarkupStore.getState().selectedMarkupIds).toEqual(['c']);
    fireEvent.click(screen.getByTestId('space-remove-c'));
    expect(isSpace(get('c'))).toBe(false);
    expect(get('c').measurement?.value).toBe(30);
    expect(get('c').customFields?.measureLabel).toBeUndefined();
    act(() => useMarkupStore.getState().undo());
    expect(isSpace(get('c'))).toBe(true);
  });

  it('una medición bloqueada no se convierte ni se edita', () => {
    useMarkupStore.setState({ markups: [area('l', 0, 9, { locked: true })], selectedMarkupIds: ['l'] });
    render(<SpacesPanel />);
    expect(screen.getByTestId('spaces-make')).toBeDisabled();
  });

  it('exporta una tabla CSV con nivel, número, nombre, área, perímetro y unidad', async () => {
    useMarkupStore.setState({ selectedMarkupIds: ['a', 'c'] });
    render(<SpacesPanel />);
    fireEvent.click(screen.getByTestId('spaces-make'));
    fireEvent.change(screen.getByTestId('space-name-a'), { target: { value: 'Sala, "norte"' } });
    fireEvent.blur(screen.getByTestId('space-name-a'));
    fireEvent.click(screen.getByTestId('spaces-export'));
    await waitFor(() => expect(exported).toHaveLength(1));
    expect(exported[0]).toMatchObject({ name: 'Obra_spaces.csv', ext: 'csv' });
    expect(exported[0].text.split('\r\n')).toEqual(['Level,Number,Name,Area,Perimeter,Unit', 'Page 1,,"Sala, ""norte""",12.50,10.00,m', 'Page 2,,Space 2,30.00,10.00,m', '']);
  });

  it('Edit ▸ Make Space, View ▸ Panels ▸ Spaces Panel y la pestaña del riel', () => {
    useMarkupStore.setState({ selectedMarkupIds: ['a'] });
    const { unmount } = render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-editar'));
    fireEvent.click(screen.getByTestId('menu-make-space'));
    return waitFor(() => expect(isSpace(get('a'))).toBe(true)).then(() => {
      fireEvent.click(screen.getByTestId('menu-ver'));
      fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
      useUiStore.setState({ leftOpen: false, leftTab: 'pages' });
      fireEvent.click(screen.getByTestId('menu-panel-spaces'));
      expect(useUiStore.getState()).toMatchObject({ leftTab: 'spaces', leftOpen: true });
      unmount();
      render(<LeftDock />);
      expect(screen.getByTestId('left-tab-spaces')).toBeInTheDocument();
    });
  });

  it('el espacio se guarda en el PDF con su número, nombre y etiqueta y vuelve al abrirlo', async () => {
    useMarkupStore.setState({ selectedMarkupIds: ['a'] });
    render(<SpacesPanel />);
    fireEvent.click(screen.getByTestId('spaces-make'));
    fireEvent.change(screen.getByTestId('space-number-a'), { target: { value: '101' } });
    fireEvent.blur(screen.getByTestId('space-number-a'));
    const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
    const saved = await saveIncrementalMarkups(blueprint, [get('a')]);
    const back = (await importPdfAnnotations(saved)).markups.find((m) => m.id === 'a')!;
    expect(isSpace(back)).toBe(true);
    expect(spaceInfo(back)).toEqual({ name: 'Space 1', number: '101' });
    expect(back.customFields?.measureLabel).toBe('101 · Space 1');
  });
});
