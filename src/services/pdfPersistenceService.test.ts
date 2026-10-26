import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
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
    // PDF real: desde la auditoría 2026-10-11 el resultado se valida (abre, páginas, sin duplicados)
    // antes de escribirse, así que un PDF falso ya no basta.
    const originalBytes = new Uint8Array(
      fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
    );
    vi.spyOn(bbxPersistenceService, 'isTauriEnvironment').mockReturnValue(false);

    const result = await savePdfIncremental('C:/documentos/plano.pdf', originalBytes, dummyMarkups);

    expect(result.success).toBe(true);
    expect(result.bytes!.length).toBeGreaterThan(originalBytes.length);
    expect(useDocumentStore.getState().pdfBytes).toBe(result.bytes);
  });

  it('no escribe si la validación detecta un resultado inválido (bytes originales alterados)', async () => {
    const originalBytes = new Uint8Array(
      fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
    );
    const corrupted = new Uint8Array(originalBytes.length + 10);
    corrupted.set(originalBytes);
    corrupted[0] = 0x00; // rompe el prefijo original
    vi.spyOn(incrementalWriter, 'saveIncrementalMarkups').mockResolvedValue(corrupted);
    vi.spyOn(bbxPersistenceService, 'isTauriEnvironment').mockReturnValue(false);

    const result = await savePdfIncremental('C:/documentos/plano.pdf', originalBytes, dummyMarkups);

    expect(result.success).toBe(false);
    expect(result.error).toContain('original PDF bytes');
    expect(useDocumentStore.getState().pdfBytes).not.toBe(corrupted);
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

  it('guarda correctamente sin fallar por validación si una marca tiene pageIndex fuera de rango o indefinido', async () => {
    const originalBytes = new Uint8Array(
      fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
    );
    vi.spyOn(bbxPersistenceService, 'isTauriEnvironment').mockReturnValue(false);

    // Documento de 1 página con una marca con pageIndex: 99 (fuera de rango)
    const outOfBoundsMarkup: Markup = {
      id: 'm-out-of-bounds',
      type: 'rectangle',
      pageIndex: 99 as unknown as number,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      author: 'Jacob',
      createdAt: '2026-10-26T10:00:00Z',
      updatedAt: '2026-10-26T10:00:00Z',
      status: 'pending',
    };

    const result = await savePdfIncremental('C:/documentos/plano.pdf', originalBytes, [outOfBoundsMarkup]);

    expect(result.success).toBe(true);
    expect(result.bytes).toBeDefined();
    expect(result.error).toBeUndefined();
  });
});
