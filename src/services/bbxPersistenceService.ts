import { BbxDocumentFile, Markup, migrateBbxDocument } from '../types/markup';

// Detectar si estamos en un entorno nativo de Tauri 2
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export type BbxErrorHandler = (errorMessage: string) => void;
let onBbxError: BbxErrorHandler | null = null;

export function setBbxErrorHandler(handler: BbxErrorHandler | null) {
  onBbxError = handler;
}

export function notifyBbxError(message: string) {
  console.error(`[BBX Error] ${message}`);
  if (onBbxError) {
    onBbxError(message);
  } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`[Error de persistencia BBX] ${message}`);
  }
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
 */
export async function loadBbxForPdf(pdfPath: string): Promise<BbxDocumentFile | null> {
  const bbxPath = getBbxPath(pdfPath);

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke<string | null>('read_bbx', { filePath: bbxPath });
      if (content === null || content === undefined) {
        // Ok(None) -> archivo no existe todavía, comportamiento normal
        return null;
      }
      return migrateBbxDocument(JSON.parse(content));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Error de E/S leyendo anotaciones: ${msg}`);
      throw new Error(`Error al leer archivo BBX (${bbxPath}): ${msg}`);
    }
  } else {
    // Fallback para navegador web (localStorage)
    try {
      const saved = localStorage.getItem(`bbx_${bbxPath}`);
      if (saved) {
        return migrateBbxDocument(JSON.parse(saved));
      }
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Error leyendo de almacenamiento local: ${msg}`);
      return null;
    }
  }
}

/**
 * Guarda las marcas actuales en el archivo .bbx.json junto al PDF de manera atómica.
 */
export async function saveBbxForPdf(
  pdfPath: string,
  markups: Markup[],
  author = 'Usuario'
): Promise<boolean> {
  const bbxPath = getBbxPath(pdfPath);
  if (!validateBbxPath(pdfPath, bbxPath)) {
    notifyBbxError(`Ruta inválida: ${bbxPath} no es la ruta hermana válida de ${pdfPath}`);
    return false;
  }

  const data: BbxDocumentFile = {
    version: '1.1.0',
    pdfFileName: pdfPath.split(/[/\\]/).pop() || 'document.pdf',
    lastSavedAt: new Date().toISOString(),
    author,
    markups,
  };

  const jsonContent = JSON.stringify(data, null, 2);

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_bbx', { filePath: bbxPath, jsonContent });
      console.log(`[BBX] Guardado atómico exitoso en ${bbxPath}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Fallo al guardar archivo .bbx.json: ${msg}`);
      return false;
    }
  } else {
    // Fallback para entorno web/dev
    try {
      localStorage.setItem(`bbx_${bbxPath}`, jsonContent);
      console.log(`[BBX] Guardado en localStorage: bbx_${bbxPath}`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyBbxError(`Error guardando en almacenamiento local: ${msg}`);
      return false;
    }
  }
}
