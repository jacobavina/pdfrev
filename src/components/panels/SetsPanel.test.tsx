import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SetsPanel } from './SetsPanel';
import { MenuBar } from '../shell/MenuBar';
import { LeftDock } from '../shell/LeftDock';
import { usePdfSetsStore } from '../../store/usePdfSetsStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useDocumentTabsStore } from '../../store/useDocumentTabsStore';
import { useUiStore } from '../../store/useUiStore';
import { SETS_STORAGE_KEY } from '../../core/sets/pdfSets';

let tauri = true;
const opened: string[] = [];
const failing = new Set<string>();
let picked: string[] | null = null;
const toasts: string[] = [];
vi.mock('../../services/bbxPersistenceService', () => ({ isTauriEnvironment: () => tauri }));
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn().mockImplementation(async () => picked) }));
vi.mock('../../services/fileDialogService', async () => {
  const real = await vi.importActual<typeof import('../../services/fileDialogService')>('../../services/fileDialogService');
  return {
    ...real,
    openPdfFromPath: vi.fn().mockImplementation(async (path: string) => {
      opened.push(path);
      if (failing.has(path)) useDocumentStore.getState().setError('Could not open file');
    }),
  };
});

const createdIds = () => usePdfSetsStore.getState().sets.map((s) => s.id);

describe('Panel Sets (ADR-0119)', () => {
  beforeEach(() => {
    tauri = true;
    opened.length = 0;
    failing.clear();
    picked = null;
    toasts.length = 0;
    localStorage.clear();
    usePdfSetsStore.setState({ sets: [] });
    useDocumentTabsStore.setState({ tabs: [], activeTabId: null });
    useDocumentStore.setState({ filePath: null, error: null });
    useUiStore.setState({ leftOpen: true, leftTab: 'sets' });
  });

  it('en el navegador explica que los conjuntos necesitan la aplicación de escritorio y no ofrece nada más', () => {
    tauri = false;
    render(<SetsPanel />);
    expect(screen.getByTestId('sets-desktop-only')).toHaveTextContent('desktop app');
    expect(screen.queryByTestId('sets-create')).toBeNull();
  });

  it('crea un conjunto vacío con el nombre escrito (con Enter también), sin repetir nombres', () => {
    render(<SetsPanel />);
    expect(screen.getByTestId('sets-empty')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('sets-new-name'), { target: { value: 'Obra Norte' } });
    fireEvent.click(screen.getByTestId('sets-create'));
    fireEvent.change(screen.getByTestId('sets-new-name'), { target: { value: 'Obra Norte' } });
    fireEvent.keyDown(screen.getByTestId('sets-new-name'), { key: 'Enter' });
    expect(usePdfSetsStore.getState().sets.map((s) => s.name)).toEqual(['Obra Norte', 'Obra Norte (2)']);
    expect(screen.getByTestId('sets-new-name')).toHaveValue('');
  });

  it('crea un conjunto con los documentos abiertos que tienen ruta, sin repetirlos', async () => {
    useDocumentTabsStore.setState({ tabs: [{ id: 't', filePath: 'C:\\p\\a.pdf' }, { id: 'u', filePath: null }] as never });
    useDocumentStore.setState({ filePath: 'c:/P/A.pdf' });
    render(<SetsPanel />);
    fireEvent.click(screen.getByTestId('sets-create-open'));
    await waitFor(() => expect(usePdfSetsStore.getState().sets).toHaveLength(1));
    expect(usePdfSetsStore.getState().sets[0].files.map((f) => f.name)).toEqual(['a.pdf']);
  });

  it('añadir archivos con el selector los pone en el conjunto y avisa de repetidos y de lo que no es PDF', async () => {
    const id = usePdfSetsStore.getState().createSet('Obra', ['C:\\p\\a.pdf'])!;
    picked = ['C:\\p\\a.pdf', 'C:\\p\\b.pdf', 'C:\\p\\nota.txt'];
    render(<SetsPanel />);
    fireEvent.click(screen.getByLabelText('Expand set'));
    fireEvent.click(screen.getByTestId(`set-add-files-${id}`));
    await waitFor(() => expect(toasts.at(-1)).toBe('1 file added, 1 already in the set.'));
    expect(usePdfSetsStore.getState().sets[0].files.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    // Cancelar el selector no cambia nada
    picked = null;
    fireEvent.click(screen.getByTestId(`set-add-files-${id}`));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(usePdfSetsStore.getState().sets[0].files).toHaveLength(2);
  });

  it('abrir un archivo del conjunto lo abre por su ruta y marca los que ya están abiertos', async () => {
    usePdfSetsStore.getState().createSet('Obra', ['C:\\p\\a.pdf', 'C:\\p\\b.pdf']);
    useDocumentTabsStore.setState({ tabs: [{ id: 't', filePath: 'c:/p/b.pdf' }] as never });
    render(<SetsPanel />);
    fireEvent.click(screen.getByLabelText('Expand set'));
    expect(screen.getByTestId(`set-file-${createdIds()[0]}-1`).querySelector('span')).toHaveAttribute('title', 'Open');
    expect(screen.getByTestId(`set-file-${createdIds()[0]}-0`).querySelector('span')).toHaveAttribute('title', '');
    fireEvent.click(screen.getByTestId(`set-file-${createdIds()[0]}-0`).querySelectorAll('button')[0]);
    await waitFor(() => expect(opened).toEqual(['C:\\p\\a.pdf']));
  });

  it('abrir todo el conjunto abre cada archivo en orden y cuenta los que no se pudieron abrir', async () => {
    const id = usePdfSetsStore.getState().createSet('Obra', ['C:\\p\\a.pdf', 'C:\\p\\roto.pdf', 'C:\\p\\c.pdf'])!;
    failing.add('C:\\p\\roto.pdf');
    render(<SetsPanel />);
    fireEvent.click(screen.getByTestId(`set-open-all-${id}`));
    await waitFor(() => expect(toasts.at(-1)).toBe('2 opened. Could not open: roto.pdf.'));
    expect(opened).toEqual(['C:\\p\\a.pdf', 'C:\\p\\roto.pdf', 'C:\\p\\c.pdf']);
  });

  it('un conjunto vacío no se puede abrir; renombrar, mover, quitar archivos y borrar el conjunto funcionan', () => {
    const id = usePdfSetsStore.getState().createSet('Obra', ['C:\\p\\a.pdf', 'C:\\p\\b.pdf', 'C:\\p\\c.pdf'])!;
    const empty = usePdfSetsStore.getState().createSet('Vacío')!;
    render(<SetsPanel />);
    expect(screen.getByTestId(`set-open-all-${empty}`)).toBeDisabled();
    fireEvent.click(screen.getAllByLabelText('Expand set')[0]);
    fireEvent.click(screen.getByTestId(`set-file-down-${id}-0`));
    expect(usePdfSetsStore.getState().sets[0].files.map((f) => f.name)).toEqual(['b.pdf', 'a.pdf', 'c.pdf']);
    fireEvent.click(screen.getByTestId(`set-file-remove-${id}-2`));
    expect(usePdfSetsStore.getState().sets[0].files.map((f) => f.name)).toEqual(['b.pdf', 'a.pdf']);
    const name = screen.getByTestId(`set-name-${id}`);
    fireEvent.change(name, { target: { value: 'Planos de obra' } });
    fireEvent.blur(name);
    expect(usePdfSetsStore.getState().sets[0].name).toBe('Planos de obra');
    fireEvent.click(screen.getByTestId(`set-delete-${empty}`));
    expect(usePdfSetsStore.getState().sets.map((s) => s.id)).toEqual([id]);
  });

  it('los conjuntos se guardan y vuelven al recargar, y lo corrupto no rompe la aplicación', () => {
    usePdfSetsStore.getState().createSet('Obra', ['C:\\p\\a.pdf']);
    const stored = localStorage.getItem(SETS_STORAGE_KEY)!;
    usePdfSetsStore.setState({ sets: [] });
    usePdfSetsStore.getState().reload();
    expect(usePdfSetsStore.getState().sets[0]).toMatchObject({ name: 'Obra', files: [{ name: 'a.pdf' }] });
    localStorage.setItem(SETS_STORAGE_KEY, '{ roto');
    usePdfSetsStore.getState().reload();
    expect(usePdfSetsStore.getState().sets).toEqual([]);
    expect(stored).toContain('"v":1');
  });

  it('View ▸ Panels ▸ Sets Panel y la pestaña del riel abren el panel', () => {
    useUiStore.setState({ leftOpen: false, leftTab: 'pages' });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-ver'));
    fireEvent.mouseEnter(screen.getByTestId('menu-view-panels').parentElement!);
    fireEvent.click(screen.getByTestId('menu-panel-sets'));
    expect(useUiStore.getState()).toMatchObject({ leftTab: 'sets', leftOpen: true });
    render(<LeftDock />);
    expect(screen.getByTestId('left-tab-sets')).toBeInTheDocument();
  });
});
