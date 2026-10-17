import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThumbnailsSidebar } from './ThumbnailsSidebar';
import { useDocumentStore } from '../store/useDocumentStore';
import * as pageService from '../services/pageService';

// Mock de renderThumbnail
vi.mock('../services/pdfService', () => ({
  renderThumbnail: vi.fn().mockResolvedValue(undefined),
}));

// Mock de pageService
vi.mock('../services/pageService', () => ({
  executeRotatePage: vi.fn().mockResolvedValue(true),
  executeDeletePage: vi.fn().mockResolvedValue(true),
  executeInsertBlankPage: vi.fn().mockResolvedValue(true),
  executeExtractPage: vi.fn().mockResolvedValue(true),
  executeReorderPage: vi.fn().mockResolvedValue(true),
}));

describe('ThumbnailsSidebar - Operaciones de Página (Paquete 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      currentPageIndex: 0,
      numPages: 2,
      pdfDoc: {
        numPages: 2,
      } as any,
    });
  });

  it('renderiza botones de cabecera para añadir página y rotar página activa', async () => {
    render(<ThumbnailsSidebar />);

    expect(screen.getByTestId('add-blank-page-btn')).toBeInTheDocument();
    expect(screen.getByTestId('rotate-current-page-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('add-blank-page-btn'));
    await waitFor(() => {
      expect(pageService.executeInsertBlankPage).toHaveBeenCalledWith(2);
    });

    fireEvent.click(screen.getByTestId('rotate-current-page-btn'));
    await waitFor(() => {
      expect(pageService.executeRotatePage).toHaveBeenCalledWith(0, 90);
    });
  });

  it('renderiza botones contextuales en cada página (rotar, insertar, extraer, eliminar)', async () => {
    render(<ThumbnailsSidebar />);

    const rotateBtn0 = screen.getByTestId('page-rotate-btn-0');
    const insertBtn0 = screen.getByTestId('page-insert-btn-0');
    const extractBtn0 = screen.getByTestId('page-extract-btn-0');
    const deleteBtn0 = screen.getByTestId('page-delete-btn-0');

    expect(rotateBtn0).toBeInTheDocument();
    expect(insertBtn0).toBeInTheDocument();
    expect(extractBtn0).toBeInTheDocument();
    expect(deleteBtn0).toBeInTheDocument();

    fireEvent.click(rotateBtn0);
    await waitFor(() => {
      expect(pageService.executeRotatePage).toHaveBeenCalledWith(0, 90);
    });

    fireEvent.click(insertBtn0);
    await waitFor(() => {
      expect(pageService.executeInsertBlankPage).toHaveBeenCalledWith(1);
    });

    fireEvent.click(extractBtn0);
    await waitFor(() => {
      expect(pageService.executeExtractPage).toHaveBeenCalledWith(0);
    });

    fireEvent.click(deleteBtn0);
    await waitFor(() => {
      expect(pageService.executeDeletePage).toHaveBeenCalledWith(0);
    });
  });

  it('renderiza botones de mover página y ejecuta reordenación (ADR-0082)', async () => {
    render(<ThumbnailsSidebar />);

    // Página 0: solo puede bajar
    expect(screen.queryByTestId('page-move-up-btn-0')).not.toBeInTheDocument();
    const moveDown0 = screen.getByTestId('page-move-down-btn-0');
    expect(moveDown0).toBeInTheDocument();

    fireEvent.click(moveDown0);
    await waitFor(() => {
      expect(pageService.executeReorderPage).toHaveBeenCalledWith(0, 1);
    });

    // Página 1: solo puede subir
    expect(screen.queryByTestId('page-move-down-btn-1')).not.toBeInTheDocument();
    const moveUp1 = screen.getByTestId('page-move-up-btn-1');
    expect(moveUp1).toBeInTheDocument();

    fireEvent.click(moveUp1);
    await waitFor(() => {
      expect(pageService.executeReorderPage).toHaveBeenCalledWith(1, 0);
    });
  });

  it('soporta reordenación mediante drag and drop (ADR-0082)', async () => {
    render(<ThumbnailsSidebar />);

    const thumb0 = screen.getByTestId('thumbnail-0');
    const thumb1 = screen.getByTestId('thumbnail-1');

    expect(thumb0).toHaveAttribute('draggable', 'true');

    // Simular drag & drop de miniatura 0 a miniatura 1
    const dataTransfer = {
      data: {} as Record<string, string>,
      setData: vi.fn((k: string, v: string) => {
        dataTransfer.data[k] = v;
      }),
      getData: vi.fn((k: string) => dataTransfer.data[k] || ''),
      effectAllowed: 'none',
      dropEffect: 'none',
    };

    fireEvent.dragStart(thumb0, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '0');

    fireEvent.dragOver(thumb1, { dataTransfer });
    fireEvent.drop(thumb1, { dataTransfer });

    await waitFor(() => {
      expect(pageService.executeReorderPage).toHaveBeenCalledWith(0, 1);
    });
  });

  it('muestra etiquetas de página cuando están presentes en el store (ADR-0086)', async () => {
    useDocumentStore.setState({
      pageLabels: {
        0: 'A-101',
        1: 'A-102',
      },
    });

    render(<ThumbnailsSidebar />);

    const label0 = screen.getByTestId('page-label-0');
    const label1 = screen.getByTestId('page-label-1');

    expect(label0).toHaveTextContent('Page 1 (A-101)');
    expect(label1).toHaveTextContent('Page 2 (A-102)');
  });
});
