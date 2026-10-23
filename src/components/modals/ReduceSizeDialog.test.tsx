import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ReduceSizeDialog } from './ReduceSizeDialog';
import { MenuBar } from '../shell/MenuBar';
import { useUiStore } from '../../store/useUiStore';
import { useDocumentStore } from '../../store/useDocumentStore';

const toasts: string[] = [];
const calls: string[] = [];
let outcome: 'ok' | 'same' = 'ok';
vi.mock('../../services/toastService', () => ({ showToast: (m: string) => toasts.push(m) }));
vi.mock('../../services/documentEditService', async () => {
  const real = await vi.importActual<typeof import('../../services/documentEditService')>('../../services/documentEditService');
  return {
    ...real,
    executeReduceSize: vi.fn().mockImplementation(async (quality: string, onProgress?: (d: number, t: number) => void) => {
      calls.push(quality);
      onProgress?.(1, 2);
      const skipped = [{ cause: 'Black and white scans and masks', count: 1 }];
      return outcome === 'ok'
        ? { ok: true, message: 'File size reduced. Save the document to keep it.', report: { before: 5 * 1048576, after: 1048576, imagesSeen: 3, imagesReduced: 2, skipped } }
        : { ok: false, message: 'The file could not be made smaller.', report: { before: 1048576, after: 1048576, imagesSeen: 1, imagesReduced: 0, skipped } };
    }),
  };
});

const openReduce = () => act(() => useUiStore.setState({ pageToolDialog: 'reduce' }));

describe('Diálogo Reduce File Size (ADR-0126)', () => {
  beforeEach(() => {
    toasts.length = 0;
    calls.length = 0;
    outcome = 'ok';
    useUiStore.setState({ pageToolDialog: null });
    useDocumentStore.setState({ pdfBytes: new Uint8Array(5 * 1048576), numPages: 1 });
  });

  it('Document ▸ Reduce File Size solo está disponible con un documento abierto', () => {
    useDocumentStore.setState({ pdfBytes: null, numPages: 0 });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-documento'));
    expect(screen.getByTestId('menu-reduce-size')).toBeDisabled();
  });

  it('muestra el tamaño actual y la calidad equilibrada por defecto', () => {
    openReduce();
    render(<ReduceSizeDialog />);
    expect(screen.getByTestId('reduce-current')).toHaveTextContent('5.0 MB');
    expect(screen.getByTestId('reduce-quality-medium')).toBeChecked();
  });

  it('reducir con la calidad elegida muestra cuánto se ahorró y qué imágenes se dejaron', async () => {
    openReduce();
    render(<ReduceSizeDialog />);
    fireEvent.click(screen.getByTestId('reduce-quality-low'));
    fireEvent.click(screen.getByTestId('reduce-apply'));
    await waitFor(() => expect(screen.getByTestId('reduce-report')).toBeInTheDocument());
    expect(calls).toEqual(['low']);
    expect(screen.getByTestId('reduce-report')).toHaveTextContent('Saved 4.0 MB: 5.0 MB → 1.0 MB.');
    expect(screen.getByTestId('reduce-report')).toHaveTextContent('2 of 3 images reduced.');
    expect(screen.getByTestId('reduce-report')).toHaveTextContent('1 left as is: black and white scans and masks.');
    expect(toasts.at(-1)).toMatch(/File size reduced/);
  });

  it('si el archivo no puede quedar más pequeño lo dice y no presenta ahorro', async () => {
    outcome = 'same';
    openReduce();
    render(<ReduceSizeDialog />);
    fireEvent.click(screen.getByTestId('reduce-apply'));
    await waitFor(() => expect(screen.getByTestId('reduce-report')).toHaveTextContent('The file could not be made smaller.'));
    expect(screen.getByTestId('reduce-report')).not.toHaveTextContent('Saved');
  });

  it('Escape cierra el diálogo', () => {
    openReduce();
    render(<ReduceSizeDialog />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pageToolDialog).toBeNull();
  });
});
