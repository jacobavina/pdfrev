import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MenuBar } from './shell/MenuBar';
import { WelcomeCanvas } from './viewer/WelcomeCanvas';
import { PdfViewer } from './PdfViewer';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolStore } from '../store/useToolStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useUiStore } from '../store/useUiStore';
import * as recentService from '../services/recentFilesService';
import * as fileDialogService from '../services/fileDialogService';

vi.mock('../services/pdfService', () => ({
  loadPdfDocument: vi.fn().mockResolvedValue({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getViewport: () => ({ width: 800, height: 600 }),
      render: () => ({ promise: Promise.resolve() }),
      getTextContent: () => Promise.resolve({ items: [] }),
    }),
  }),
  renderPageToCanvas: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    hasText: false,
    textItems: [],
  }),
}));

describe('RecentFilesFlow Integration (ADR-0087: Archivos Recientes y Pantalla Inicial)', () => {
  beforeEach(() => {
    localStorage.clear();
    recentService.clearRecentFiles();
    useToolStore.setState({ activeTool: 'select' });
    useMarkupStore.setState({ markups: [], selectedMarkupIds: [] });
    useUiStore.setState({ exportRequest: null, combineModalOpen: false });
    useDocumentStore.setState({
      pdfBytes: null,
      pdfDoc: null,
      fileName: null,
      filePath: null,
      isLoading: false,
      error: null,
    });
    vi.restoreAllMocks();
  });

  describe('MenuBar: File ▸ Open Recent', () => {
    it('muestra "No Recent Files" deshabilitado cuando no hay historial', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-archivo'));
      expect(screen.getByTestId('menu-popup-archivo')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('menu-open-recent'));
      const emptyItem = screen.getByTestId('menu-recent-empty');
      expect(emptyItem).toBeInTheDocument();
      expect(emptyItem.textContent).toContain('No Recent Files');
      expect(emptyItem).toBeDisabled();
    });

    it('lista los archivos recientes con nombre, páginas y tooltip de ruta completa', () => {
      recentService.addRecentFile({
        path: 'C:/projects/structural_a1.pdf',
        name: 'structural_a1.pdf',
        pageCount: 14,
      });

      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-archivo'));
      fireEvent.click(screen.getByTestId('menu-open-recent'));

      const recentItem = screen.getByTestId('menu-recent-item-0');
      expect(recentItem).toBeInTheDocument();
      expect(recentItem.textContent).toContain('structural_a1.pdf');
      expect(recentItem.textContent).toContain('14 pgs');
      expect(recentItem.getAttribute('title')).toBe('C:/projects/structural_a1.pdf');
    });

    it('al hacer clic en un archivo reciente invoca openPdfFromPath con la ruta correcta', async () => {
      const openSpy = vi.spyOn(fileDialogService, 'openPdfFromPath').mockResolvedValue(undefined as any);

      recentService.addRecentFile({
        path: 'C:/blueprints/hvac_level2.pdf',
        name: 'hvac_level2.pdf',
        pageCount: 6,
      });

      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-archivo'));
      fireEvent.click(screen.getByTestId('menu-open-recent'));

      const recentItem = screen.getByTestId('menu-recent-item-0');
      fireEvent.click(recentItem);

      expect(openSpy).toHaveBeenCalledWith('C:/blueprints/hvac_level2.pdf');
    });

    it('al hacer clic en "Clear Recent Files" vacía el historial y actualiza el menú', () => {
      recentService.addRecentFile({
        path: 'C:/blueprints/arch_ground.pdf',
        name: 'arch_ground.pdf',
        pageCount: 1,
      });

      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-archivo'));
      fireEvent.click(screen.getByTestId('menu-open-recent'));

      const clearBtn = screen.getByTestId('menu-clear-recent');
      expect(clearBtn).toBeInTheDocument();
      fireEvent.click(clearBtn);

      expect(recentService.getRecentFiles()).toHaveLength(0);
    });
  });

  describe('WelcomeCanvas: Pantalla Inicial y Quick Access', () => {
    it('renderiza la zona de bienvenida con dropzone y botón para abrir PDF', () => {
      const openDialogSpy = vi.spyOn(fileDialogService, 'openPdfDialog').mockResolvedValue(undefined as any);

      render(<WelcomeCanvas />);

      expect(screen.getByTestId('welcome-canvas')).toBeInTheDocument();
      expect(screen.getByTestId('welcome-dropzone')).toBeInTheDocument();

      const openBtn = screen.getByTestId('welcome-open-btn');
      expect(openBtn).toBeInTheDocument();
      fireEvent.click(openBtn);
      expect(openDialogSpy).toHaveBeenCalledTimes(1);
    });

    it('muestra la lista de documentos recientes y permite abrirlos con 1 clic', () => {
      const openPathSpy = vi.spyOn(fileDialogService, 'openPdfFromPath').mockResolvedValue(undefined as any);

      recentService.addRecentFile({
        path: 'D:/CAD/floor_plan_2026.pdf',
        name: 'floor_plan_2026.pdf',
        pageCount: 8,
      });

      render(<WelcomeCanvas />);

      const recentItem = screen.getByTestId('welcome-recent-item-0');
      expect(recentItem).toBeInTheDocument();
      expect(recentItem.textContent).toContain('floor_plan_2026.pdf');
      expect(recentItem.textContent).toContain('8 pgs');

      fireEvent.click(recentItem);
      expect(openPathSpy).toHaveBeenCalledWith('D:/CAD/floor_plan_2026.pdf');
    });

    it('el botón de vaciar en la pantalla de bienvenida limpia los recientes', () => {
      recentService.addRecentFile({
        path: 'D:/CAD/draft.pdf',
        name: 'draft.pdf',
      });

      render(<WelcomeCanvas />);
      expect(screen.getByTestId('welcome-recent-item-0')).toBeInTheDocument();

      const clearBtn = screen.getByTestId('welcome-clear-recents-btn');
      fireEvent.click(clearBtn);

      expect(screen.queryByTestId('welcome-recent-item-0')).toBeNull();
      expect(recentService.getRecentFiles()).toHaveLength(0);
    });

    it('soporta drag & drop de archivos PDF en la zona de drop', async () => {
      const loadPdfSpy = vi.spyOn(fileDialogService, 'loadPdfData').mockResolvedValue(undefined as any);

      render(<WelcomeCanvas />);
      const dropzone = screen.getByTestId('welcome-dropzone');

      // Drag over activa clase visual
      fireEvent.dragOver(dropzone, {
        dataTransfer: { files: [] },
      });

      // Crear archivo PDF simulado
      const dummyFile = new File(['%PDF-1.7 dummy content'], 'elevation_north.pdf', {
        type: 'application/pdf',
      });
      // Mock de arrayBuffer
      dummyFile.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(24));

      await act(async () => {
        fireEvent.drop(dropzone, {
          dataTransfer: {
            files: [dummyFile],
          },
        });
      });

      expect(loadPdfSpy).toHaveBeenCalledWith(
        null,
        'elevation_north.pdf',
        expect.any(Uint8Array)
      );
    });
  });

  describe('PdfViewer: Integración de WelcomeCanvas', () => {
    it('renderiza WelcomeCanvas cuando no hay documento abierto', async () => {
      useDocumentStore.setState({
        pdfBytes: null,
        isLoading: false,
        error: null,
      });

      render(<PdfViewer />);

      const welcome = await screen.findByTestId('welcome-canvas');
      expect(welcome).toBeInTheDocument();
      expect(screen.getByText('REA CAD Blueprint Viewer')).toBeInTheDocument();
    });
  });
});
