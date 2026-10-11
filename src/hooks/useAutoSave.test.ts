import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';
import { loadPdfData } from '../services/fileDialogService';
import * as bbxPersistenceService from '../services/bbxPersistenceService';
import * as pdfService from '../services/pdfService';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { PDFDocumentProxy } from 'pdfjs-dist';
import fs from 'fs';
import path from 'path';

// PDF real: Guardar escribe también el PDF y lo valida antes de escribir (auditoría 2026-10-11)
const fixturePdfBytes = new Uint8Array(
  fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
);

describe('useAutoSave - Ciclo Completo de customColumns (Z.2b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useMarkupStore.getState().setMarkups([]);
    useDocumentStore.getState().closeDocument();
  });

  it('sidecar con customColumns -> loadPdfData -> autoguardado (saveNow) -> el JSON ESCRITO sigue teniendo customColumns idénticas', async () => {
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);

    const testColumns = [
      { id: 'col-costo', nombre: 'Costo Unitario', tipo: 'number' as const },
      { id: 'col-zona', nombre: 'Zona de Obra', tipo: 'text' as const },
    ];

    // Mock de lectura del sidecar original con customColumns
    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue({
      document: {
        version: '1.1.0',
        pdfFileName: 'proyecto.pdf',
        lastSavedAt: '2026-10-10T12:00:00.000Z',
        author: 'Ingeniero',
        markups: [
          {
            id: 'm-1',
            type: 'rectangle',
            pageIndex: 0,
            points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
            style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
            author: 'Ingeniero',
            createdAt: '2026-10-10T12:00:00.000Z',
            updatedAt: '2026-10-10T12:00:00.000Z',
            status: 'pending',
          },
        ],
        customColumns: testColumns,
      },
      warnings: [],
    });

    const filePath = 'C:/proyectos/proyecto.pdf';

    // 1. Cargar PDF y su sidecar .bbx.json asociado
    await loadPdfData(filePath, 'proyecto.pdf', fixturePdfBytes);

    // 2. Inicializar el hook de autoguardado
    const { result } = renderHook(() => useAutoSave());

    // 3. Ejecutar autoguardado inmediato a través de saveNow
    let ok = false;
    await act(async () => {
      ok = await result.current.saveNow();
    });

    expect(ok).toBe(true);

    // 4. Verificar el JSON ESCRITO en almacenamiento (localStorage en entorno web/test)
    const storedJsonStr = localStorage.getItem(`bbx_${filePath.replace(/\.pdf$/i, '.bbx.json')}`);
    expect(storedJsonStr).not.toBeNull();

    const storedDoc = JSON.parse(storedJsonStr!);
    expect(storedDoc.customColumns).toBeDefined();
    expect(storedDoc.customColumns).toEqual(testColumns);
  });

  it('el autoguardado periódico solo escribe el sidecar: nunca toca el PDF ni marca el documento como guardado', async () => {
    vi.useFakeTimers();
    try {
      const fixtureMarkup = {
        id: 'm-auto',
        type: 'rectangle' as const,
        pageIndex: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
        style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
        author: 'Ingeniero',
        createdAt: '2026-10-11T12:00:00.000Z',
        updatedAt: '2026-10-11T12:00:00.000Z',
        status: 'pending' as const,
      };
      const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
      useDocumentStore
        .getState()
        .setDocument('C:/proyectos/auto.pdf', 'auto.pdf', fixturePdfBytes, 1, dummyPdfDoc);
      useMarkupStore.getState().addMarkup(fixtureMarkup);
      expect(useMarkupStore.getState().isDirty).toBe(true);

      const pdfModule = await import('../services/pdfPersistenceService');
      const pdfSpy = vi.spyOn(pdfModule, 'savePdfIncremental');
      const sidecarSpy = vi.spyOn(bbxPersistenceService, 'saveBbxForPdf');

      renderHook(() => useAutoSave(1000));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });

      expect(sidecarSpy).toHaveBeenCalled();
      expect(pdfSpy).not.toHaveBeenCalled();
      expect(useDocumentStore.getState().pdfBytes).toBe(fixturePdfBytes);
      expect(useMarkupStore.getState().isDirty).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cambiar customColumns en useDocumentStore no altera isDirty de useMarkupStore', () => {
    expect(useMarkupStore.getState().isDirty).toBe(false);
    useDocumentStore.getState().setCustomColumns([
      { id: 'col-temp', nombre: 'Temporal', tipo: 'text' },
    ]);
    expect(useMarkupStore.getState().isDirty).toBe(false);
  });
});
