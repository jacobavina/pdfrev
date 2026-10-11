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
});
