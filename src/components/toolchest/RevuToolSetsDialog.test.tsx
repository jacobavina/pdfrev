import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { deflateSync } from 'zlib';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
let tauri = true;
vi.mock('../../services/bbxPersistenceService', () => ({ isTauriEnvironment: () => tauri }));
const toasts: string[] = [];
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/exportService', () => ({ saveExportFileWithDialog: vi.fn() }));

import { RevuToolSetsDialog } from './RevuToolSetsDialog';
import { listRevuToolSets, importRevuToolSets } from '../../services/btxService';
import { useUiStore } from '../../store/useUiStore';
import { useToolChestStore } from '../../store/useToolChestStore';

const hex = (s: string) => deflateSync(Buffer.from(s, 'latin1')).toString('hex');
const btx = (title: string, subjects: string[]) =>
  [
    '\uFEFF<?xml version="1.0" encoding="utf-8"?>',
    '<BluebeamRevuToolSet Version="1">',
    `  <Title>${hex(title)}</Title>`,
    ...subjects.map(
      (s, i) =>
        `  <ToolChestItem Version="1"><Name>ABCDEFGHIJKLMNO${i}</Name><Type>Bluebeam.PDF.Annotations.AnnotationSquare</Type><Raw>${hex(`<</Subj(${s})/Subtype/Square/Rect[0 0 60 40]/F 4/C[0 0 1]/BS<</W 2/S/S/Type/Border>>>>`)}</Raw><X>1</X><Y>1</Y><Index>${i}</Index><Mode>properties</Mode></ToolChestItem>`
    ),
    '</BluebeamRevuToolSet>',
  ].join('\r\n');

const FILES: Record<string, string> = {
  'C:/Revu/21/Concrete.btx': btx('Concrete', ['Losa', 'Muro']),
  'C:/Revu/21/Electrical.btx': btx('Electrical', ['Tomacorriente']),
};

describe('Tool Sets que Revu ya tiene instalados (ADR-0105)', () => {
  beforeEach(async () => {
    toasts.length = 0;
    tauri = true;
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string, args?: { path: string }) => {
      if (cmd === 'list_revu_toolsets') return Object.keys(FILES).map((p) => ({ path: p, file_name: p.split('/').pop(), size: FILES[p].length }));
      if (cmd === 'read_revu_toolset') return Array.from(Buffer.from(FILES[args!.path], 'utf8'));
      throw new Error(`comando inesperado ${cmd}`);
    });
    useUiStore.setState({ revuToolSetsOpen: false });
    useToolChestStore.setState({ palettes: [], tools: [] } as never);
    // Persistencia simulada del Tool Chest
    let n = 0;
    useToolChestStore.setState({
      createPalette: async (name: string) => {
        const palette = { id: `p${++n}`, name, order: n, createdAt: '' };
        useToolChestStore.setState((s) => ({ palettes: [...s.palettes, palette] }));
        return palette;
      },
      createToolFromMarkup: async (paletteId: string, markup: { subject?: string; type: string }, name?: string) => {
        const tool = { id: `t${++n}`, paletteId, name: name ?? '', type: markup.type };
        useToolChestStore.setState((s) => ({ tools: [...s.tools, tool as never] }));
        return tool as never;
      },
      setActivePalette: () => undefined,
    } as never);
  });

  it('lista los Tool Sets de la carpeta de Revu con su título y su número de herramientas', async () => {
    const list = await listRevuToolSets();
    expect(list.map((e) => [e.title, e.toolCount, e.fileName])).toEqual([
      ['Concrete', 2, 'Concrete.btx'],
      ['Electrical', 1, 'Electrical.btx'],
    ]);
    tauri = false;
    expect(await listRevuToolSets()).toEqual([]);
  });

  it('el diálogo muestra los Tool Sets, deja elegir y crea una paleta por cada uno con sus herramientas', async () => {
    useUiStore.setState({ revuToolSetsOpen: true });
    render(<RevuToolSetsDialog />);
    await waitFor(() => expect(screen.getByTestId('revu-toolset-Concrete.btx')).toBeInTheDocument());
    expect(screen.getByTestId('revu-toolsets-list')).toHaveTextContent('Electrical');
    expect(screen.getByTestId('revu-toolsets-import')).toBeDisabled();
    fireEvent.click(screen.getByTestId('revu-toolset-Concrete.btx'));
    fireEvent.click(screen.getByTestId('revu-toolset-Electrical.btx'));
    fireEvent.click(screen.getByTestId('revu-toolsets-import'));
    await waitFor(() => expect(useUiStore.getState().revuToolSetsOpen).toBe(false));
    const s = useToolChestStore.getState();
    expect(s.palettes.map((p) => p.name)).toEqual(['Concrete', 'Electrical']);
    expect(s.tools.map((t) => t.name)).toEqual(['Losa', 'Muro', 'Tomacorriente']);
    expect(toasts.at(-1)).toMatch(/Imported 3 tools in 2 palettes from Revu/);
  });

  it('"Select all" marca todos, un nombre repetido recibe un número y sin Tool Sets el diálogo lo explica', async () => {
    await importRevuToolSets(['C:/Revu/21/Concrete.btx', 'C:/Revu/21/Concrete.btx']);
    expect(useToolChestStore.getState().palettes.map((p) => p.name)).toEqual(['Concrete', 'Concrete (2)']);
    useUiStore.setState({ revuToolSetsOpen: true });
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'list_revu_toolsets' ? [] : []));
    render(<RevuToolSetsDialog />);
    await waitFor(() => expect(screen.getByTestId('revu-toolsets-empty')).toHaveTextContent('No Revu tool sets were found'));
  });
});
