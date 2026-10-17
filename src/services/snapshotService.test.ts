import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureCanvasSlice,
  writeImageToClipboard,
  createImageMarkup,
  executeSnapshot,
  pasteSnapshotImage,
  hasSnapshotInCache,
  getSnapshotCache,
  setSnapshotCache,
  clearSnapshotCache,
} from './snapshotService';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';

describe('snapshotService (ADR-0085: Herramienta Instantánea y Marcas de Imagen)', () => {
  beforeEach(() => {
    clearSnapshotCache();
    useMarkupStore.getState().setMarkups([]);
    useMarkupStore.getState().setSelectedMarkupIds([]);
    useMarkupStore.getState().setClipboardMarkups([]);
    useToolStore.getState().setActiveTool('select');
    vi.restoreAllMocks();
  });

  describe('createImageMarkup', () => {
    it('genera una marca de tipo "image" con 2 puntos canónicos y customFields con imageSrc', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const markup = createImageMarkup({
        dataUrl,
        pageIndex: 2,
        bounds: { x: 0.2, y: 0.3, width: 0.4, height: 0.3 },
        originalWidth: 400,
        originalHeight: 300,
      });

      expect(markup.id).toBeDefined();
      expect(markup.type).toBe('image');
      expect(markup.pageIndex).toBe(2);
      expect(markup.points).toEqual([
        { x: 0.2, y: 0.3 },
        { x: 0.6, y: 0.6 },
      ]);
      expect(markup.style.strokeColor).toBe('transparent');
      expect(markup.style.fillColor).toBe('transparent');
      expect(markup.style.strokeWidth).toBe(0);
      expect(markup.style.opacity).toBe(1);
      expect(markup.customFields?.imageSrc).toBe(dataUrl);
      expect(markup.customFields?.originalWidth).toBe(400);
      expect(markup.customFields?.originalHeight).toBe(300);
    });
  });

  describe('captureCanvasSlice', () => {
    it('corta la región especificada del canvas a resolución nativa', () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 1000;
      mockCanvas.height = 800;

      const normRect = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
      const slice = captureCanvasSlice(mockCanvas, normRect);

      expect(slice.width).toBe(500);
      expect(slice.height).toBe(320);
      expect(slice.dataUrl).toContain('data:image/png');
    });

    it('limita las coordenadas a los bordes del canvas sin desbordar', () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 500;
      mockCanvas.height = 400;

      const normRect = { x: 0.8, y: 0.8, width: 0.5, height: 0.5 };
      const slice = captureCanvasSlice(mockCanvas, normRect);

      expect(slice.width).toBe(100); // 500 - 400
      expect(slice.height).toBe(80); // 400 - 320
    });
  });

  describe('writeImageToClipboard', () => {
    it('escribe el blob al portapapeles con ClipboardItem cuando está disponible', async () => {
      class MockClipboardItem {
        constructor(public items: Record<string, Blob>) {}
      }
      // @ts-expect-error mock ClipboardItem in jsdom
      globalThis.ClipboardItem = MockClipboardItem;

      const writeMock = vi.fn().mockResolvedValue(undefined);
      const originalClipboard = navigator.clipboard;
      // @ts-expect-error mock clipboard
      navigator.clipboard = { write: writeMock };

      const blob = new Blob(['fake-png'], { type: 'image/png' });
      const success = await writeImageToClipboard(blob);

      expect(success).toBe(true);
      expect(writeMock).toHaveBeenCalled();

      // restore
      // @ts-expect-error restore clipboard
      navigator.clipboard = originalClipboard;
      // @ts-expect-error restore
      delete globalThis.ClipboardItem;
    });

    it('maneja errores de permisos o ausencia de clipboard sin lanzar excepción', async () => {
      const writeMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const originalClipboard = navigator.clipboard;
      // @ts-expect-error mock clipboard
      navigator.clipboard = { write: writeMock };

      const blob = new Blob(['fake-png'], { type: 'image/png' });
      const success = await writeImageToClipboard(blob);

      expect(success).toBe(false);

      // @ts-expect-error restore clipboard
      navigator.clipboard = originalClipboard;
    });
  });

  describe('executeSnapshot', () => {
    it('extrae el recorte del canvas, guarda en caché, limpia marcas copiadas y revierte a select', async () => {
      const canvas = document.createElement('canvas');
      canvas.id = 'pdf-render-canvas';
      canvas.width = 800;
      canvas.height = 600;
      document.body.appendChild(canvas);

      useToolStore.getState().setActiveTool('snapshot');
      useMarkupStore.getState().setClipboardMarkups([
        {
          id: 'prev-markup',
          type: 'rectangle',
          pageIndex: 0,
          points: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }],
          style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
          author: 'User',
          status: 'pending',
          createdAt: '',
          updatedAt: '',
        },
      ]);

      const success = await executeSnapshot({ x: 0.1, y: 0.1, width: 0.25, height: 0.2 }, 0, canvas);

      expect(success).toBe(true);
      expect(hasSnapshotInCache()).toBe(true);
      const cache = getSnapshotCache();
      expect(cache).not.toBeNull();
      expect(cache?.normWidth).toBe(0.25);
      expect(cache?.normHeight).toBe(0.2);
      expect(cache?.sourcePageIndex).toBe(0);

      // Limpia marcas de texto/rectángulos previas del portapapeles para que prime el snapshot
      expect(useMarkupStore.getState().clipboardMarkups).toHaveLength(0);

      // Revierte a la herramienta Select según el flujo de Revu
      expect(useToolStore.getState().activeTool).toBe('select');

      document.body.removeChild(canvas);
    });
  });

  describe('pasteSnapshotImage', () => {
    it('pega la imagen de snapshot como marca en la página de destino y la selecciona', () => {
      setSnapshotCache({
        dataUrl: 'data:image/png;base64,sample',
        width: 200,
        height: 150,
        normWidth: 0.25,
        normHeight: 0.2,
        sourcePageIndex: 0,
      });

      const pasted = pasteSnapshotImage(1, { x: 0.5, y: 0.5 });

      expect(pasted).not.toBeNull();
      expect(pasted?.type).toBe('image');
      expect(pasted?.pageIndex).toBe(1);
      expect(pasted?.customFields?.imageSrc).toBe('data:image/png;base64,sample');

      // Verifica que está en el store y seleccionada
      const markups = useMarkupStore.getState().markups;
      expect(markups).toHaveLength(1);
      expect(markups[0].id).toBe(pasted?.id);
      expect(useMarkupStore.getState().selectedMarkupIds).toEqual([pasted?.id]);
    });

    it('devuelve null si no hay snapshot en caché', () => {
      const pasted = pasteSnapshotImage(0);
      expect(pasted).toBeNull();
      expect(useMarkupStore.getState().markups).toHaveLength(0);
    });
  });
});
