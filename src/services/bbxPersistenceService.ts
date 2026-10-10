import { BbxDocumentFile, Markup, migrateBbxDocument } from '../types/markup';

// Detectar si estamos en un entorno nativo de Tauri 2
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type BbxOperation = 'read' | 'write';
export type BbxErrorHandler = (errorMessage: string) => void;

let onBbxError: BbxErrorHandler | null = null;
let hasNotifiedReadError = false;
let hasNotifiedWriteError = false;

export function setBbxErrorHandler(handler: BbxErrorHandler | null) {
  onBbxError = handler;
  hasNotifiedReadError = false;
  hasNotifiedWriteError = false;
}

export function resetBbxErrorState(op?: BbxOperation) {
  if (!op || op === 'read') {
    hasNotifiedReadError = false;
  }
  if (!op || op === 'write') {
    hasNotifiedWriteError = false;
  }
}

export function notifyBbxError(message: string, op: BbxOperation = 'write') {
  console.error(`[BBX Error (${op})] ${message}`);
  const hasNotified = op === 'read' ? hasNotifiedReadError : hasNotifiedWriteError;
  if (!hasNotified) {
    if (op === 'read') {
      hasNotifiedReadError = true;
    } else {
      hasNotifiedWriteError = true;
    }
    if (onBbxError) {
      onBbxError(message);
    }
  }
}

/**
 * Comprueba si una ruta es absoluta (incluyendo letras de unidad Windows y rutas UNC \\servidor\ o //servidor/).
 * Coincide con std::path::Path::is_absolute() de Rust.
 */
export function isAbsolutePath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  const trimmed = p.trim();

  // 1. Prefijo de unidad Windows (ej. C:\ o C:/)
  if (/^[a-zA-Z]:[/\\]/.test(trimmed)) {
    return true;
  }

  // 2. Ruta UNC (ej. \\servidor\share o //servidor/share)
  if (/^(\\\\[^\\]+|\/\/[^/]+)/.test(trimmed)) {
    return true;
  }

  // 3. Ruta absoluta POSIX (cuando no se ejecuta en Windows nativo)
  if (typeof process !== 'undefined' && process.platform !== 'win32' && trimmed.startsWith('/')) {
    return true;
  }

  return false;
}

/**
 * Obtiene la ruta del archivo de marcas .bbx.json como hermana del PDF.
 */
export function getBbxPath(pdfPath: string): string {
  if (!pdfPath || typeof pdfPath !== 'string') {
    throw new Error('La ruta del archivo PDF no puede estar vacía');
  }
  const cleanPath = pdfPath.trim();
  if (cleanPath.toLowerCase().endsWith('.pdf')) {
    return cleanPath.replace(/\.pdf$/i, '.bbx.json');
  }
  return `${cleanPath}.bbx.json`;
}

/**
 * Valida que la ruta .bbx.json sea estrictamente la ruta hermana del PDF abierto.
 */
export function validateBbxPath(pdfPath: string, bbxPath: string): boolean {
  try {
    const expected = getBbxPath(pdfPath);
    return bbxPath === expected && bbxPath.endsWith('.bbx.json');
  } catch {
    return false;
  }
}

/**
 * Carga el archivo .bbx.json asociado al PDF si existe.
 * Distingue archivo inexistente (retorna null) de errores reales de E/S (notifica y lanza error).
 * En Tauri, si la ruta no es absoluta, no invoca IPC y retorna null sin lanzar.
 */
export async function loadBbxForPdf(pdfPath: string | null): Promise<BbxDocumentFile | null> {
  if (!pdfPath || typeof pdfPath !== 'string') {
    return null;
  }

  const bbxPath = getBbxPath(pdfPath);

  if (isTauriEnvironment()) {
    // Guarda defensiva: si la ruta no es absoluta, NO invocar IPC de Tauri y retornar null
    if (!isAbsolutePath(bbxPath)) {
      return null;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<string | null>('read_bbx', { filePath: bbxPath });
      if (content === null || content === undefined) {
        // Ok(None) -> archivo no existe todavía, comportamiento normal
        return null;
      }
      resetBbxErrorState('read');
      return migrateBbxDocument(JSON.parse(content));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Error de E/S leyendo anotaciones: ${msg}`, 'read');
      throw new Error(`Error al leer archivo BBX (${bbxPath}): ${msg}`);
    }
  } else {
    // Fallback para navegador web (localStorage)
    try {
      const saved = localStorage.getItem(`bbx_${bbxPath}`);
      if (saved) {
        resetBbxErrorState('read');
        return migrateBbxDocument(JSON.parse(saved));
      }
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Error leyendo de almacenamiento local: ${msg}`, 'read');
      return null;
    }
  }
}

/**
 * Guarda las marcas actuales en el archivo .bbx.json junto al PDF de manera atómica.
 * En Tauri, si la ruta no es absoluta, no invoca IPC y retorna false sin lanzar ni notificar.
 */
export async function saveBbxForPdf(
  pdfPath: string | null,
  markups: Markup[],
  author = 'Usuario'
): Promise<boolean> {
  if (!pdfPath || typeof pdfPath !== 'string') {
    return false;
  }

  const bbxPath = getBbxPath(pdfPath);

  const data: BbxDocumentFile = {
    version: '1.1.0',
    pdfFileName: pdfPath.split(/[/\\]/).pop() || 'document.pdf',
    lastSavedAt: new Date().toISOString(),
    author,
    markups,
  };

  const jsonContent = JSON.stringify(data, null, 2);

  if (isTauriEnvironment()) {
    // Guarda defensiva: si la ruta no es absoluta, NO invocar IPC y retornar false sin error
    if (!isAbsolutePath(bbxPath)) {
      return false;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_bbx', { filePath: bbxPath, jsonContent });
      console.log(`[BBX] Guardado atómico exitoso en ${bbxPath}`);
      resetBbxErrorState('write');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Fallo al guardar archivo .bbx.json: ${msg}`, 'write');
      return false;
    }
  } else {
    // Fallback para entorno web/dev
    try {
      localStorage.setItem(`bbx_${bbxPath}`, jsonContent);
      console.log(`[BBX] Guardado en localStorage: bbx_${bbxPath}`);
      resetBbxErrorState('write');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Error guardando en almacenamiento local: ${msg}`, 'write');
      return false;
    }
  }
}
