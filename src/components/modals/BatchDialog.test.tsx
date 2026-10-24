import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { BatchDialog } from './BatchDialog';
import { MenuBar } from '../shell/MenuBar';
import { useUiStore } from '../../store/useUiStore';

const blueprint = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/test-blueprint.pdf')));
const toasts: string[] = [];
const saved: { name: string; size: number }[] = [];
const reports: unknown[] = [];
let picks: { name: string; bytes: Uint8Array }[] = [];
let sinkCancelled = false;
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/batchService', async () => {
  const real = await vi.importActual<typeof import('../../services/batchService')>('../../services/batchService');
  return {
    ...real,
    pickBatchFiles: vi.fn().mockImplementation(async () => picks),
    chooseBatchSink: vi.fn().mockImplementation(async () =>
      sinkCancelled ? null : { where: 'C:\\salida', save: async (name: string, bytes: Uint8Array) => void saved.push({ name, size: bytes.length }) }
    ),
    saveBatchReport: vi.fn().mockImplementation(async (r: unknown) => void reports.push(r)),
  };
});

const change = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const openBatch = () => act(() => useUiStore.setState({ pageToolDialog: 'batch' }));

describe('Diálogo Batch (ADR-0125)', () => {
  beforeEach(() => {
    toasts.length = 0;
    saved.length = 0;
    reports.length = 0;
    sinkCancelled = false;
    picks = [{ name: 'A-101.pdf', bytes: blueprint }, { name: 'A-102.pdf', bytes: new Uint8Array(blueprint) }];
    useUiStore.setState({ pageToolDialog: null });
  });

  it('File ▸ Batch abre el diálogo aunque no haya documento abierto', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-archivo'));
    expect(screen.getByTestId('menu-batch')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('menu-batch'));
    expect(useUiStore.getState().pageToolDialog).toBe('batch');
  });

  it('sin archivos lo pide y Run está desactivado; añadir archivos los lista con su tamaño y sin repetirlos', async () => {
    openBatch();
    render(<BatchDialog />);
    expect(screen.getByTestId('batch-problem')).toHaveTextContent('Add the PDF files');
    expect(screen.getByTestId('batch-run')).toBeDisabled();
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('2 files'));
    fireEvent.click(screen.getByTestId('batch-add'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('batch-count')).toHaveTextContent('2 files');
    expect(screen.getByTestId('batch-run')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('batch-file-0').querySelector('button')!);
    expect(screen.getByTestId('batch-count')).toHaveTextContent('1 file');
  });

  it('girar todas las páginas guarda cada archivo con su sufijo y resume lo hecho', async () => {
    openBatch();
    render(<BatchDialog />);
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('2 files'));
    fireEvent.click(screen.getByTestId('batch-kind-rotate'));
    change('batch-degrees', '180');
    fireEvent.click(screen.getByTestId('batch-run'));
    await waitFor(() => expect(screen.getByTestId('batch-summary')).toBeInTheDocument(), { timeout: 15000 });
    expect(saved.map((s) => s.name)).toEqual(['A-101_rotated180.pdf', 'A-102_rotated180.pdf']);
    expect(screen.getByTestId('batch-summary')).toHaveTextContent('2 of 2 processed and saved in C:\\salida.');
    expect(toasts.at(-1)).toBe('2 files processed.');
  });

  it('numerar pide el texto y lo estampa en todas las páginas', async () => {
    openBatch();
    render(<BatchDialog />);
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('2 files'));
    fireEvent.click(screen.getByTestId('batch-kind-number'));
    change('batch-format', '');
    expect(screen.getByTestId('batch-problem')).toHaveTextContent('Write the text to stamp');
    expect(screen.getByTestId('batch-run')).toBeDisabled();
    change('batch-format', 'Hoja {n} de {total}');
    change('batch-position', 'top-right');
    fireEvent.click(screen.getByTestId('batch-run'));
    await waitFor(() => expect(saved).toHaveLength(2), { timeout: 15000 });
    expect(saved[0].name).toBe('A-101_numbered.pdf');
    expect(saved[0].size).toBeGreaterThan(blueprint.length);
  });

  it('un archivo que falla se marca y el resto se procesa; el informe se puede guardar', async () => {
    picks = [{ name: 'bueno.pdf', bytes: blueprint }, { name: 'roto.pdf', bytes: new Uint8Array([1, 2, 3]) }];
    openBatch();
    render(<BatchDialog />);
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('2 files'));
    fireEvent.click(screen.getByTestId('batch-kind-rotate'));
    fireEvent.click(screen.getByTestId('batch-run'));
    await waitFor(() => expect(screen.getByTestId('batch-summary')).toHaveTextContent('1 of 2 processed'), { timeout: 15000 });
    expect(screen.getByTestId('batch-summary')).toHaveTextContent('1 failed');
    expect(saved.map((s) => s.name)).toEqual(['bueno_rotated90.pdf']);
    expect(toasts.at(-1)).toMatch(/1 processed, 1 failed/);
    fireEvent.click(screen.getByTestId('batch-report'));
    await waitFor(() => expect(reports).toHaveLength(1));
    expect((reports[0] as { input: string; ok: boolean }[]).map((r) => [r.input, r.ok])).toEqual([['bueno.pdf', true], ['roto.pdf', false]]);
  });

  it('aplanar un archivo sin marcas lo cuenta como fallido con el motivo', async () => {
    picks = [{ name: 'sin-marcas.pdf', bytes: blueprint }];
    openBatch();
    render(<BatchDialog />);
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('1 file'));
    fireEvent.click(screen.getByTestId('batch-run'));
    await waitFor(() => expect(screen.getByTestId('batch-summary')).toHaveTextContent('0 of 1 processed'), { timeout: 15000 });
    expect(screen.getByTestId('batch-file-0')).toHaveTextContent('no markups to flatten');
  });

  it('si se cancela la elección del destino no se procesa nada', async () => {
    sinkCancelled = true;
    openBatch();
    render(<BatchDialog />);
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('2 files'));
    fireEvent.click(screen.getByTestId('batch-run'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(saved).toEqual([]);
    expect(screen.queryByTestId('batch-summary')).toBeNull();
  });

  it('Escape cierra el diálogo', () => {
    openBatch();
    render(<BatchDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
  });
  it('cabeceras y pies: pide al menos un texto y guarda cada archivo con el sufijo _stamped (ADR-0130)', async () => {
    openBatch();
    render(<BatchDialog />);
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('2 files'));
    fireEvent.click(screen.getByTestId('batch-kind-headerfooter'));
    expect(screen.getByTestId('batch-slot-footerCenter')).toHaveValue('Page {n} of {total}');
    change('batch-slot-footerCenter', '');
    expect(screen.getByTestId('batch-problem')).toHaveTextContent('at least one header or footer');
    expect(screen.getByTestId('batch-run')).toBeDisabled();
    change('batch-slot-headerLeft', '{file}');
    fireEvent.click(screen.getByTestId('batch-run'));
    await waitFor(() => expect(saved).toHaveLength(2), { timeout: 15000 });
    expect(saved.map((x) => x.name)).toEqual(['A-101_stamped.pdf', 'A-102_stamped.pdf']);
    expect(saved[0].size).toBeGreaterThan(blueprint.length);
  });
  it('resumen: un archivo sin marcas se marca como fallido con el motivo (ADR-0132)', async () => {
    picks = [{ name: 'sin-marcas.pdf', bytes: blueprint }];
    openBatch();
    render(<BatchDialog />);
    fireEvent.click(screen.getByTestId('batch-add'));
    await waitFor(() => expect(screen.getByTestId('batch-count')).toHaveTextContent('1 file'));
    fireEvent.click(screen.getByTestId('batch-kind-summary'));
    fireEvent.click(screen.getByTestId('batch-run'));
    await waitFor(() => expect(screen.getByTestId('batch-summary')).toHaveTextContent('0 of 1 processed'), { timeout: 15000 });
    expect(screen.getByTestId('batch-file-0')).toHaveTextContent('no markups to summarise');
  });
  it('OCR solo se ofrece en la aplicación de escritorio: en el navegador la opción está desactivada (ADR-0133)', () => {
    openBatch();
    render(<BatchDialog />);
    expect(screen.getByTestId('batch-kind-ocr')).toBeDisabled();
  });
});
