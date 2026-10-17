import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CombinePdfsModal } from './CombinePdfsModal';
import { useUiStore } from '../../store/useUiStore';

describe('CombinePdfsModal (ADR-0084)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUiStore.setState({ combineModalOpen: false });
  });

  it('no renderiza nada cuando combineModalOpen es false', () => {
    render(<CombinePdfsModal />);
    expect(screen.queryByTestId('combine-pdfs-modal')).toBeNull();
  });

  it('renderiza la cabecera, lista vacía y botón Cancelar cuando combineModalOpen es true', () => {
    useUiStore.setState({ combineModalOpen: true });
    render(<CombinePdfsModal />);

    expect(screen.getByTestId('combine-pdfs-modal')).toBeDefined();
    expect(screen.getByText('Combine PDF Files')).toBeDefined();
    expect(screen.getByText('No PDF files added yet.')).toBeDefined();
    expect(screen.getByTestId('combine-submit-btn')).toBeDisabled();
  });

  it('cerrar mediante el botón X o Cancelar oculta el modal', () => {
    useUiStore.setState({ combineModalOpen: true });
    render(<CombinePdfsModal />);

    const cancelBtn = screen.getByTestId('combine-cancel-btn');
    fireEvent.click(cancelBtn);

    expect(useUiStore.getState().combineModalOpen).toBe(false);
  });

  it('permite cambiar el nombre del archivo de salida', () => {
    useUiStore.setState({ combineModalOpen: true });
    render(<CombinePdfsModal />);

    const nameInput = screen.getByTestId('combine-output-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Combined Document.pdf');

    fireEvent.change(nameInput, { target: { value: 'ProyectoFinal.pdf' } });
    expect(nameInput.value).toBe('ProyectoFinal.pdf');
  });

  it('permite agregar archivos vía input, reordenar con Move Up/Down y eliminar', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc1 = await PDFDocument.create();
    doc1.addPage([500, 500]);
    const bytes1 = await doc1.save();

    const doc2 = await PDFDocument.create();
    doc2.addPage([600, 600]);
    const bytes2 = await doc2.save();

    const fileA = new File([bytes1], 'PlanoA.pdf', { type: 'application/pdf' });
    (fileA as any).arrayBuffer = async () => bytes1.buffer.slice(bytes1.byteOffset, bytes1.byteOffset + bytes1.byteLength);
    const fileB = new File([bytes2], 'PlanoB.pdf', { type: 'application/pdf' });
    (fileB as any).arrayBuffer = async () => bytes2.buffer.slice(bytes2.byteOffset, bytes2.byteOffset + bytes2.byteLength);

    // Espiar document.createElement para simular la selección de archivos
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: any) => {
      const el = origCreate(tag, opts);
      if (tag === 'input') {
        Object.defineProperty(el, 'files', { value: [fileA, fileB] });
        let changeHandler: any = null;
        Object.defineProperty(el, 'onchange', {
          set: (fn) => { changeHandler = fn; },
          get: () => changeHandler,
        });
        Object.defineProperty(el, 'click', {
          value: () => { if (changeHandler) changeHandler(); },
        });
      }
      return el;
    });

    useUiStore.setState({ combineModalOpen: true });
    render(<CombinePdfsModal />);

    // Click en Add Files...
    const addBtn = screen.getByTestId('add-combine-files-btn');
    fireEvent.click(addBtn);

    // Esperar a que se rendericen las 2 filas
    const row0 = await screen.findByTestId('combine-file-row-0');
    expect(row0).toBeDefined();
    expect(screen.getByText('PlanoA.pdf')).toBeDefined();
    expect(screen.getByText('PlanoB.pdf')).toBeDefined();

    // El botón Combine ahora debe estar habilitado
    const submitBtn = screen.getByTestId('combine-submit-btn');
    expect(submitBtn).not.toBeDisabled();

    // Mover fila 1 hacia arriba
    const moveUpBtn1 = screen.getByTestId('combine-move-up-1');
    fireEvent.click(moveUpBtn1);

    // Tras mover arriba, PlanoB debe estar en la fila 0
    const updatedRow0 = screen.getByTestId('combine-file-row-0');
    expect(updatedRow0.textContent).toContain('PlanoB.pdf');

    // Eliminar fila 0 (PlanoB)
    const removeBtn0 = screen.getByTestId('combine-remove-0');
    fireEvent.click(removeBtn0);

    // Ahora solo debe quedar 1 archivo (PlanoA.pdf)
    expect(screen.queryByText('PlanoB.pdf')).toBeNull();
    expect(screen.getByText('PlanoA.pdf')).toBeDefined();
  });
});
