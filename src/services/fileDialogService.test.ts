import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPdfData, summarizeMigrationWarnings } from './fileDialogService';
import * as bbxPersistenceService from './bbxPersistenceService';
import * as pdfService from './pdfService';
import { registerToastListener } from './toastService';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { PDFDocumentProxy } from 'pdfjs-dist';

describe('summarizeMigrationWarnings (Z.2b)', () => {
  it('retorna cadena vacía para 0 avisos', () => {
    expect(summarizeMigrationWarnings([])).toBe('');
  });

  it('retorna el texto tal cual para 1 aviso', () => {
    const singleWarning = 'Tipo de marca desconocido "rayoLaser" degradado a "rectangle" en marca "m-1"';
    expect(summarizeMigrationWarnings([singleWarning])).toBe(singleWarning);
  });

  it('formatea correctamente 3 avisos sin coletilla de restantes', () => {
    const warnings = ['Aviso 1', 'Aviso 2', 'Aviso 3'];
    expect(summarizeMigrationWarnings(warnings)).toBe(
      '3 avisos al abrir el documento: Aviso 1; Aviso 2; Aviso 3'
    );
  });

  it('formatea correctamente 10 avisos mostrando los 3 primeros y la coletilla con los 7 restantes', () => {
    const warnings = Array.from({ length: 10 }, (_, i) => `Problema ${i + 1}`);
    expect(summarizeMigrationWarnings(warnings)).toBe(
      '10 avisos al abrir el documento: Problema 1; Problema 2; Problema 3 (y 7 más, ver consola)'
    );
  });

  it('acota avisos individuales excesivamente largos para no desbordar el toast', () => {
    const longWarning = 'X'.repeat(120);
    const summary = summarizeMigrationWarnings(['Aviso corto', longWarning]);
    expect(summary).toContain('2 avisos al abrir el documento: Aviso corto; ');
    expect(summary).toContain('...');
    expect(summary).not.toContain('X'.repeat(120));
  });
});

describe('fileDialogService - Carga de Documentos y Avisos BBX (Z.2 / Z.2b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useMarkupStore.getState().setMarkups([]);
    useDocumentStore.getState().closeDocument();
  });

  it('dispara notificaciones toast cuando el migrador de BBX reporta warnings (tipo desconocido, etc.)', async () => {
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);

    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue({
      document: {
        version: '1.1.0',
        pdfFileName: 'planta.pdf',
        lastSavedAt: '2026-10-10T20:00:00.000Z',
        author: 'Revisor',
        markups: [
          {
            id: 'm-cancelled-1',
            type: 'rectangle',
            pageIndex: 0,
            points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
            style: { strokeColor: '#e02424', strokeWidth: 2, opacity: 1 },
            author: 'Revisor',
            createdAt: '2026-10-10T20:00:00.000Z',
            updatedAt: '2026-10-10T20:00:00.000Z',
            status: 'cancelled',
          },
        ],
      },
      warnings: [
        'Tipo de marca desconocido "laserBeam3D" degradado a "rectangle" en marca "m-alien"',
      ],
    });

    const toastListener = vi.fn();
    const unsubscribe = registerToastListener(toastListener);

    try {
      await loadPdfData('C:/proyectos/planta.pdf', 'planta.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));

      expect(toastListener).toHaveBeenCalledTimes(1);
      expect(toastListener).toHaveBeenCalledWith(
        expect.stringContaining('laserBeam3D')
      );

      const markupsInStore = useMarkupStore.getState().markups;
      expect(markupsInStore).toHaveLength(1);
      expect(markupsInStore[0].status).toBe('cancelled');
    } finally {
      unsubscribe();
    }
  });

  it('no dispara toast cuando el archivo BBX no contiene warnings', async () => {
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);

    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue({
      document: {
        version: '1.1.0',
        pdfFileName: 'limpio.pdf',
        lastSavedAt: '2026-10-10T20:00:00.000Z',
        author: 'Revisor',
        markups: [],
      },
      warnings: [],
    });

    const toastListener = vi.fn();
    const unsubscribe = registerToastListener(toastListener);

    try {
      await loadPdfData('C:/proyectos/limpio.pdf', 'limpio.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
      expect(toastListener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it('con >=5 problemas llama al listener UNA sola vez con mensaje agrupado y vuelca todo a console.warn con [BBX] (Defecto 1)', async () => {
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fiveWarnings = [
      'Tipo de marca desconocido "laser1" en "m-1"',
      'Tipo de marca desconocido "laser2" en "m-2"',
      'Tipo de marca desconocido "laser3" en "m-3"',
      'Clave prohibida "__proto__" descartada en "m-4"',
      'Valor no finito NaN descartado en "m-5"',
    ];

    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue({
      document: {
        version: '1.1.0',
        pdfFileName: 'cinco_errores.pdf',
        lastSavedAt: '2026-10-10T20:00:00.000Z',
        author: 'Auditor',
        markups: [],
      },
      warnings: fiveWarnings,
    });

    const toastListener = vi.fn();
    const unsubscribe = registerToastListener(toastListener);

    try {
      await loadPdfData('C:/proyectos/cinco_errores.pdf', 'cinco_errores.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));

      // Debe llamarse UNA sola vez (no cinco veces como en el bucle original)
      expect(toastListener).toHaveBeenCalledTimes(1);

      const mensajeToast = toastListener.mock.calls[0][0];
      // Menciona el total
      expect(mensajeToast).toContain('5 avisos al abrir el documento');
      // Menciona los primeros avisos
      expect(mensajeToast).toContain('laser1');
      expect(mensajeToast).toContain('laser2');
      expect(mensajeToast).toContain('laser3');
      // Menciona el resto
      expect(mensajeToast).toContain('(y 2 más, ver consola)');

      // Debe haber volcado todos a console.warn con prefijo [BBX]
      expect(warnSpy).toHaveBeenCalledTimes(5);
      for (const w of fiveWarnings) {
        expect(warnSpy).toHaveBeenCalledWith(`[BBX] ${w}`);
      }
    } finally {
      unsubscribe();
    }
  });

  it('abrir documento B tras A no arrastra customColumns de A (Defecto 2)', async () => {
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);

    // 1. Abrir Documento A con customColumns
    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValueOnce({
      document: {
        version: '1.1.0',
        pdfFileName: 'documentoA.pdf',
        lastSavedAt: '2026-10-10T20:00:00.000Z',
        author: 'Revisor A',
        markups: [],
        customColumns: [{ id: 'col-a', nombre: 'Columna Proyecto A', tipo: 'text' }],
      },
      warnings: [],
    });

    await loadPdfData('C:/proyectos/documentoA.pdf', 'documentoA.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(useDocumentStore.getState().customColumns).toEqual([
      { id: 'col-a', nombre: 'Columna Proyecto A', tipo: 'text' },
    ]);

    // 2. Abrir Documento B sin customColumns
    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValueOnce({
      document: {
        version: '1.1.0',
        pdfFileName: 'documentoB.pdf',
        lastSavedAt: '2026-10-10T20:05:00.000Z',
        author: 'Revisor B',
        markups: [],
        customColumns: undefined,
      },
      warnings: [],
    });

    await loadPdfData('C:/proyectos/documentoB.pdf', 'documentoB.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    // El documento B no debe arrastrar las columnas de A
    expect(useDocumentStore.getState().customColumns).toBeUndefined();
  });
});
