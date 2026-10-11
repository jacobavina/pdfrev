import { describe, it, expect, beforeEach, vi } from 'vitest';
import { savePdfIncremental } from './pdfPersistenceService';
import * as incrementalWriter from '../core/pdf/incrementalWriter';
import * as bbxPersistenceService from './bbxPersistenceService';
import { useDocumentStore } from '../store/useDocumentStore';
import { Markup } from '../types/markup';

describe('pdfPersistenceService (P3-B.3 y B.4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDocumentStore.getState().closeDocument();
  });

  const dummyMarkups: Markup[] = [
    {
      id: 'm1',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      author: 'Tester',
      createdAt: '2026-10-11T10:00:00Z',
      updatedAt: '2026-10-11T10:00:00Z',
      status: 'pending',
    },
  ];

  it('guarda incrementalmente y actualiza los bytes del documento en el store', async () => {
    const originalBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31]);
    const updatedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31, 0x99]);

    vi.spyOn(incrementalWriter, 'saveIncrementalMarkups').mockResolvedValue(updatedBytes);
    vi.spyOn(bbxPersistenceService, 'isTauriEnvironment').mockReturnValue(false);

    const result = await savePdfIncremental('C:/documentos/plano.pdf', originalBytes, dummyMarkups);

    expect(result.success).toBe(true);
    expect(result.bytes).toBe(updatedBytes);
    expect(useDocumentStore.getState().pdfBytes).toBe(updatedBytes);
  });

  it('maneja y reporta errores si el escritor incremental falla', async () => {
    const originalBytes = new Uint8Array([1, 2, 3]);
    vi.spyOn(incrementalWriter, 'saveIncrementalMarkups').mockRejectedValue(
      new Error('PDF corrupto o no válido')
    );

    const result = await savePdfIncremental('C:/documentos/plano.pdf', originalBytes, dummyMarkups);

    expect(result.success).toBe(false);
    expect(result.error).toContain('PDF corrupto o no válido');
  });
});
