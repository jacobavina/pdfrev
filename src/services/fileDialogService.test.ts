import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPdfData, summarizeMigrationWarnings, openPdfFromPath } from './fileDialogService';
import * as bbxPersistenceService from './bbxPersistenceService';
import * as pdfService from './pdfService';
import { registerToastListener } from './toastService';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useDocumentTabsStore } from '../store/useDocumentTabsStore';
import { PDFDocumentProxy } from 'pdfjs-dist';
import fs from 'fs';
import path from 'path';

// PDF real sin anotaciones: desde la auditoría 2026-10-11 loadPdfData importa las anotaciones del PDF
// (fuente de verdad, D-1) y avisa si no puede leerlas; unos bytes falsos dispararían ese aviso.
const fixturePdfBytes = new Uint8Array(
  fs.readFileSync(path.resolve(__dirname, '../../fixtures/test-blueprint.pdf'))
);

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
      '3 warnings while opening the document: Aviso 1; Aviso 2; Aviso 3'
    );
  });

  it('formatea correctamente 10 avisos mostrando los 3 primeros y la coletilla con los 7 restantes', () => {
    const warnings = Array.from({ length: 10 }, (_, i) => `Problema ${i + 1}`);
    expect(summarizeMigrationWarnings(warnings)).toBe(
      '10 warnings while opening the document: Problema 1; Problema 2; Problema 3 (and 7 more, see console)'
    );
  });

  it('acota avisos individuales excesivamente largos para no desbordar el toast', () => {
    const longWarning = 'X'.repeat(120);
    const summary = summarizeMigrationWarnings(['Aviso corto', longWarning]);
    expect(summary).toContain('2 warnings while opening the document: Aviso corto; ');
    expect(summary).toContain('...');
    expect(summary).not.toContain('X'.repeat(120));
  });
});

describe('fileDialogService - Carga de Documentos y Avisos BBX (Z.2 / Z.2b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDocumentTabsStore.getState().closeAllTabs();
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
      await loadPdfData('C:/proyectos/planta.pdf', 'planta.pdf', fixturePdfBytes);

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
      await loadPdfData('C:/proyectos/limpio.pdf', 'limpio.pdf', fixturePdfBytes);
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
      await loadPdfData('C:/proyectos/cinco_errores.pdf', 'cinco_errores.pdf', fixturePdfBytes);

      // Debe llamarse UNA sola vez (no cinco veces como en el bucle original)
      expect(toastListener).toHaveBeenCalledTimes(1);

      const mensajeToast = toastListener.mock.calls[0][0];
      // Menciona el total
      expect(mensajeToast).toContain('5 warnings while opening the document');
      // Menciona los primeros avisos
      expect(mensajeToast).toContain('laser1');
      expect(mensajeToast).toContain('laser2');
      expect(mensajeToast).toContain('laser3');
      // Menciona el resto
      expect(mensajeToast).toContain('(and 2 more, see console)');

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

    await loadPdfData('C:/proyectos/documentoA.pdf', 'documentoA.pdf', fixturePdfBytes);
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

    await loadPdfData('C:/proyectos/documentoB.pdf', 'documentoB.pdf', fixturePdfBytes);
    // El documento B no debe arrastrar las columnas de A
    expect(useDocumentStore.getState().customColumns).toBeUndefined();
  });

  it('al abrir un segundo documento registra pestañas independientes y preserva las marcas del primero (ADR-0083)', async () => {
    const dummyPdfDoc1 = { numPages: 1 } as unknown as PDFDocumentProxy;
    const dummyPdfDoc2 = { numPages: 2 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument')
      .mockResolvedValueOnce(dummyPdfDoc1)
      .mockResolvedValueOnce(dummyPdfDoc2);

    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue(null);

    // 1. Abrir Doc 1
    await loadPdfData('C:/planos/plano1.pdf', 'plano1.pdf', fixturePdfBytes);
    useMarkupStore.getState().addMarkup({ id: 'm-doc1', type: 'rectangle', pageIndex: 0 } as any);

    // 2. Abrir Doc 2
    await loadPdfData('C:/planos/plano2.pdf', 'plano2.pdf', fixturePdfBytes);
    expect(useDocumentTabsStore.getState().tabs).toHaveLength(2);

    // Pestaña activa es Doc 2
    expect(useDocumentStore.getState().fileName).toBe('plano2.pdf');
    expect(useMarkupStore.getState().markups).toHaveLength(0);

    // Conmutar a Doc 1
    const tab1 = useDocumentTabsStore.getState().tabs[0];
    useDocumentTabsStore.getState().switchTab(tab1.id);

    expect(useDocumentStore.getState().fileName).toBe('plano1.pdf');
    expect(useMarkupStore.getState().markups.map((m) => m.id)).toContain('m-doc1');
  });
  it('openPdfFromPath abre un archivo PDF desde ruta conocida y lo añade a recientes', async () => {
    const dummyPdfDoc = { numPages: 1 } as unknown as PDFDocumentProxy;
    vi.spyOn(pdfService, 'loadPdfDocument').mockResolvedValue(dummyPdfDoc);
    vi.spyOn(bbxPersistenceService, 'loadBbxForPdf').mockResolvedValue(null);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fixturePdfBytes.buffer,
    } as any);

    await openPdfFromPath('C:/proyectos/reciente.pdf');

    expect(useDocumentStore.getState().fileName).toBe('reciente.pdf');
    expect(useDocumentStore.getState().filePath).toBe('C:/proyectos/reciente.pdf');
  });
});
