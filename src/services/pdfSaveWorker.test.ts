import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { executeIncrementalSave } from './pdfSaveWorkerClient';
import { saveIncrementalMarkups } from '../core/pdf/incrementalWriter';
import { Markup } from '../types/markup';

describe('pdfSaveWorkerClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const dummyMarkups: Markup[] = [
    {
      id: 'worker-m1',
      type: 'rectangle',
      pageIndex: 0,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
      style: { strokeColor: '#ff0000', strokeWidth: 2, opacity: 1 },
      author: 'Tester',
      createdAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
      status: 'pending',
    },
  ];

  it('ejecuta directamente en hilo principal si markups < 250', async () => {
    const originalBytes = new Uint8Array(
      fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
    );

    const result = await executeIncrementalSave(originalBytes, dummyMarkups, {}, {});

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(originalBytes.length);
  });

  it('degrada con elegancia a hilo principal si Worker no está disponible en el entorno', async () => {
    const originalBytes = new Uint8Array(
      fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
    );

    // Simular un conjunto grande con 300 marcas
    const largeMarkups: Markup[] = Array.from({ length: 300 }, (_, i) => ({
      ...dummyMarkups[0],
      id: `m-large-${i}`,
      points: [{ x: 0.05 + (i % 10) * 0.08, y: 0.05 + Math.floor(i / 10) * 0.02 }],
    }));

    const result = await executeIncrementalSave(originalBytes, largeMarkups, {}, {});

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(originalBytes.length);
  });

  it('produce bytes idénticos a saveIncrementalMarkups en guardado directo', async () => {
    const originalBytes = new Uint8Array(
      fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
    );

    const [directBytes, clientBytes] = await Promise.all([
      saveIncrementalMarkups(originalBytes, dummyMarkups, {}, {}),
      executeIncrementalSave(originalBytes, dummyMarkups, {}, {}),
    ]);

    expect(clientBytes.length).toEqual(directBytes.length);
    expect(clientBytes).toEqual(directBytes);
  });
});
