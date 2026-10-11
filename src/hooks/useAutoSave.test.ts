import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';
import { loadPdfData } from '../services/fileDialogService';
import * as bbxPersistenceService from '../services/bbxPersistenceService';
import * as pdfService from '../services/pdfService';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { PDFDocumentProxy } from 'pdfjs-dist';

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
    await loadPdfData(filePath, 'proyecto.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));

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

  it('cambiar customColumns en useDocumentStore no altera isDirty de useMarkupStore', () => {
    expect(useMarkupStore.getState().isDirty).toBe(false);
    useDocumentStore.getState().setCustomColumns([
      { id: 'col-temp', nombre: 'Temporal', tipo: 'text' },
    ]);
    expect(useMarkupStore.getState().isDirty).toBe(false);
  });
});
