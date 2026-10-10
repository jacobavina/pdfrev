import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getBbxPath,
  validateBbxPath,
  saveBbxForPdf,
  loadBbxForPdf,
  setBbxErrorHandler,
  resetBbxErrorState,
  isAbsolutePath,
} from './bbxPersistenceService';
import { Markup } from '../types/markup';

describe('BBX Persistence Service (.bbx.json)', () => {
  beforeEach(() => {
    localStorage.clear();
    setBbxErrorHandler(null);
    resetBbxErrorState();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it('generates correct .bbx.json paths alongside the PDF', () => {
    expect(getBbxPath('C:/blueprints/planta_baja.pdf')).toBe('C:/blueprints/planta_baja.bbx.json');
    expect(getBbxPath('/docs/electrical-plan.PDF')).toBe('/docs/electrical-plan.bbx.json');
    expect(getBbxPath('archivo_sin_extension')).toBe('archivo_sin_extension.bbx.json');
  });

  it('validates that bbxPath is strictly the sibling of the opened PDF', () => {
    expect(validateBbxPath('C:/docs/plan.pdf', 'C:/docs/plan.bbx.json')).toBe(true);
    expect(validateBbxPath('C:/docs/plan.pdf', 'C:/other/plan.bbx.json')).toBe(false);
    expect(validateBbxPath('C:/docs/plan.pdf', 'C:/docs/plan.txt')).toBe(false);
  });

  it('saves and loads markups to and from .bbx.json format (LocalStorage fallback)', async () => {
    const pdfPath = '/proyectos/estructural.pdf';
    const mockMarkups: Markup[] = [
      {
        id: 'bbx-test-1',
        type: 'rectangle',
        pageIndex: 0,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.4 },
        ],
        style: {
          strokeColor: '#e02424',
          strokeWidth: 2,
          opacity: 1,
        },
        text: 'Viga reforzada requerida',
        author: 'Ing. Supervisor',
        createdAt: '2026-10-09T20:00:00.000Z',
        updatedAt: '2026-10-09T20:00:00.000Z',
        status: 'accepted',
      },
    ];

    const saved = await saveBbxForPdf(pdfPath, mockMarkups, 'Ing. Supervisor');
    expect(saved).toBe(true);

    const loaded = await loadBbxForPdf(pdfPath);
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe('1.1.0');
    expect(loaded?.pdfFileName).toBe('estructural.pdf');
    expect(loaded?.author).toBe('Ing. Supervisor');
    expect(loaded?.markups).toHaveLength(1);
    expect(loaded?.markups[0].id).toBe('bbx-test-1');
    expect(loaded?.markups[0].status).toBe('accepted');
  });

  it('returns null if .bbx.json does not exist in localStorage fallback', async () => {
    const loaded = await loadBbxForPdf('/inexistente/plano.pdf');
    expect(loaded).toBeNull();
  });

  // --------------------------------------------------------------------------------
  // Sub-entregable 0.4: Simulación de Tauri Invoke (write_bbx y read_bbx)
  // --------------------------------------------------------------------------------
  describe('Tauri 2 Native Commands Integration (write_bbx y read_bbx)', () => {
    it('llama a write_bbx con la ruta hermana exacta y JSON formateado', async () => {
      const invokeMock = vi.fn().mockResolvedValue(undefined);

      (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      const pdfPath = 'C:/proyectos/puente.pdf';
      const mockMarkups: Markup[] = [
        {
          id: 'm-1',
          type: 'line',
          pageIndex: 0,
          points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          style: { strokeColor: '#000', strokeWidth: 1, opacity: 1 },
          author: 'Auditor',
          createdAt: '',
          updatedAt: '',
          status: 'pending',
        },
      ];

      const success = await saveBbxForPdf(pdfPath, mockMarkups, 'Auditor');
      expect(success).toBe(true);
      expect(invokeMock.mock.calls[0][0]).toBe('write_bbx');
      expect(invokeMock.mock.calls[0][1]).toEqual({
        filePath: 'C:/proyectos/puente.bbx.json',
        jsonContent: expect.stringContaining('"version": "1.1.0"'),
      });
    });

    it('notifica error en UI cuando write_bbx es rechazado', async () => {
      const invokeMock = vi.fn().mockRejectedValue(new Error('Permiso denegado'));

      (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      const errorHandler = vi.fn();
      setBbxErrorHandler(errorHandler);

      const success = await saveBbxForPdf('C:/proyectos/puente.pdf', []);
      expect(success).toBe(false);
      expect(errorHandler).toHaveBeenCalledWith(expect.stringContaining('Permiso denegado'));
    });

    it('read_bbx retorna null cuando el archivo no existe (Ok(None) de Rust)', async () => {
      const invokeMock = vi.fn().mockResolvedValue(null);

      (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      const loaded = await loadBbxForPdf('C:/proyectos/nuevo.pdf');
      expect(loaded).toBeNull();
      expect(invokeMock.mock.calls[0][0]).toBe('read_bbx');
      expect(invokeMock.mock.calls[0][1]).toEqual({
        filePath: 'C:/proyectos/nuevo.bbx.json',
      });
    });

    it('read_bbx lanza excepción y notifica error ante fallo real de E/S de Rust', async () => {
      const invokeMock = vi.fn().mockRejectedValue(new Error('Fallo de lectura de disco (I/O error)'));

      (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      const errorHandler = vi.fn();
      setBbxErrorHandler(errorHandler);

      await expect(loadBbxForPdf('C:/proyectos/corrupto.pdf')).rejects.toThrow('Fallo de lectura de disco');
      expect(errorHandler).toHaveBeenCalledWith(expect.stringContaining('Fallo de lectura de disco'));
    });

    it('guarda defensiva: con Tauri y ruta no absoluta, saveBbxForPdf devuelve false y loadBbxForPdf devuelve null sin invocar ni notificar', async () => {
      const invokeMock = vi.fn().mockResolvedValue(undefined);

      (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      const errorHandler = vi.fn();
      setBbxErrorHandler(errorHandler);

      // 1. Ruta relativa tipo demo '/fixtures/test-blueprint.pdf'
      const saveResult = await saveBbxForPdf('/fixtures/test-blueprint.pdf', []);
      expect(saveResult).toBe(false);
      expect(invokeMock).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();

      // 2. Lectura con ruta relativa
      const loadResult = await loadBbxForPdf('/fixtures/test-blueprint.pdf');
      expect(loadResult).toBeNull();
      expect(invokeMock).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();

      // 3. Con filePath null
      expect(await saveBbxForPdf(null, [])).toBe(false);
      expect(await loadBbxForPdf(null)).toBeNull();
      expect(invokeMock).not.toHaveBeenCalled();
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('throttle de errores es por operacion: fallo en lectura no silencia fallo en escritura', async () => {
      const invokeMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('Error de lectura en disco'))
        .mockRejectedValueOnce(new Error('Error de escritura en disco'));

      (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      const errorHandler = vi.fn();
      setBbxErrorHandler(errorHandler);

      // 1. Falla la lectura
      await expect(loadBbxForPdf('C:/proyectos/doc.pdf')).rejects.toThrow('Error de lectura');
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenLastCalledWith(expect.stringContaining('Error de lectura'));

      // 2. Falla la escritura: NO debe quedar silenciada por el fallo de lectura previo
      const saveResult = await saveBbxForPdf('C:/proyectos/doc.pdf', []);
      expect(saveResult).toBe(false);
      expect(errorHandler).toHaveBeenCalledTimes(2);
      expect(errorHandler).toHaveBeenLastCalledWith(expect.stringContaining('Error de escritura'));
    });

    it('lectura correcta sin archivo (Ok(None)) resetea el throttle: nuevo error de lectura SI se notifica (C4)', async () => {
      const invokeMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('Primer error de lectura'))
        .mockResolvedValueOnce(null) // Ok(None): lectura exitosa sin archivo existente
        .mockRejectedValueOnce(new Error('Segundo error de lectura'));

      (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof invokeMock } }).__TAURI_INTERNALS__ = {
        invoke: invokeMock,
      };

      const errorHandler = vi.fn();
      setBbxErrorHandler(errorHandler);

      // 1. Primer error de lectura -> se notifica
      await expect(loadBbxForPdf('C:/proyectos/doc.pdf')).rejects.toThrow('Primer error de lectura');
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenLastCalledWith(expect.stringContaining('Primer error de lectura'));

      // 2. Lectura correcta sin archivo -> retorna null y resetea throttle
      const loadResult = await loadBbxForPdf('C:/proyectos/doc.pdf');
      expect(loadResult).toBeNull();
      // No debe disparar error
      expect(errorHandler).toHaveBeenCalledTimes(1);

      // 3. Nuevo error de lectura -> SÍ se notifica porque el throttle fue limpiado por la lectura previa
      await expect(loadBbxForPdf('C:/proyectos/doc.pdf')).rejects.toThrow('Segundo error de lectura');
      expect(errorHandler).toHaveBeenCalledTimes(2);
      expect(errorHandler).toHaveBeenLastCalledWith(expect.stringContaining('Segundo error de lectura'));
    });
  });

  describe('isAbsolutePath (semántica compatible con std::path::Path::is_absolute de Rust)', () => {
    it('reconoce letras de unidad Windows y rutas UNC como absolutas', () => {
      expect(isAbsolutePath('C:/proyectos/puente.bbx.json')).toBe(true);
      expect(isAbsolutePath('d:\\planos\\viga.bbx.json')).toBe(true);
      expect(isAbsolutePath('\\\\servidor\\share\\archivo.bbx.json')).toBe(true);
      expect(isAbsolutePath('//servidor/share/archivo.bbx.json')).toBe(true);
    });

    it('rechaza rutas relativas y rutas sin letra de unidad en Windows', () => {
      expect(isAbsolutePath('/fixtures/test-blueprint.pdf')).toBe(false);
      expect(isAbsolutePath('fixtures/test-blueprint.pdf')).toBe(false);
      expect(isAbsolutePath('test-blueprint.bbx.json')).toBe(false);
      expect(isAbsolutePath('')).toBe(false);
    });
  });
});
