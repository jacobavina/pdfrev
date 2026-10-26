import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { savePdfIncremental, validateSavedPdf } from './pdfPersistenceService';
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

  it('no bloquea el guardado si una marca en memoria no aparece en /Annots del PDF serializado', async () => {
    const originalBytes = new Uint8Array(
      fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Guardar primero m1 de forma normal
    const saveResult = await savePdfIncremental('C:/documentos/plano.pdf', originalBytes, dummyMarkups);
    expect(saveResult.success).toBe(true);

    // Validar pasando una marca extra inexistente en /Annots
    const phantomMarkup: Markup = {
      id: '00219271-1b29-4b85-9dcd-435b8850565d',
      type: 'text',
      pageIndex: 0,
      points: [{ x: 0.2, y: 0.2 }],
      style: { strokeColor: '#000000', strokeWidth: 1, opacity: 1 },
      author: 'Tester',
      createdAt: '2026-10-26T10:00:00Z',
      updatedAt: '2026-10-26T10:00:00Z',
      status: 'pending',
    };

    await expect(
      validateSavedPdf(originalBytes, saveResult.bytes!, [...dummyMarkups, phantomMarkup])
    ).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('00219271-1b29-4b85-9dcd-435b8850565d was not serialized to /Annots')
    );
  });
});
