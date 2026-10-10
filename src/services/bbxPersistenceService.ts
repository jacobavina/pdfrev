import { BbxDocumentFile, Markup } from '../types/markup';

// Detectar si estamos en un entorno nativo de Tauri 2
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Obtiene la ruta del archivo de marcas .bbx.json
 */
export function getBbxPath(pdfPath: string): string {
  if (pdfPath.toLowerCase().endsWith('.pdf')) {
    return pdfPath.replace(/\.pdf$/i, '.bbx.json');
  }
  return `${pdfPath}.bbx.json`;
}

/**
 * Carga el archivo .bbx.json asociado al PDF si existe.
 */
export async function loadBbxForPdf(pdfPath: string): Promise<BbxDocumentFile | null> {
  const bbxPath = getBbxPath(pdfPath);

  if (isTauriEnvironment()) {
    try {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const fileExists = await exists(bbxPath);
      if (!fileExists) {
        return null;
      }
      const content = await readTextFile(bbxPath);
      return JSON.parse(content) as BbxDocumentFile;
    } catch (err) {
      console.warn(`[BBX] No se pudo leer el archivo ${bbxPath}:`, err);
      return null;
    }
  } else {
    // Fallback para navegador web (localStorage)
    try {
      const saved = localStorage.getItem(`bbx_${bbxPath}`);
      if (saved) {
        return JSON.parse(saved) as BbxDocumentFile;
      }
    } catch (err) {
      console.warn('[BBX] Fallback localStorage error:', err);
    }
    return null;
  }
}

/**
 * Guarda las marcas actuales en el archivo .bbx.json junto al PDF.
 */
export async function saveBbxForPdf(
  pdfPath: string,
  markups: Markup[],
  author = 'Usuario'
): Promise<boolean> {
  const bbxPath = getBbxPath(pdfPath);
  const data: BbxDocumentFile = {
    version: '1.0.0',
    pdfFileName: pdfPath.split(/[/\\]/).pop() || 'document.pdf',
    lastSavedAt: new Date().toISOString(),
    author,
    markups,
  };

  const jsonContent = JSON.stringify(data, null, 2);

  if (isTauriEnvironment()) {
    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(bbxPath, jsonContent);
      console.log(`[BBX] Guardado exitoso en ${bbxPath}`);
      return true;
    } catch (err) {
      console.error(`[BBX] Error al guardar en ${bbxPath}:`, err);
      return false;
    }
  } else {
    // Fallback para entorno web/dev
    try {
      localStorage.setItem(`bbx_${bbxPath}`, jsonContent);
      console.log(`[BBX] Guardado en localStorage: bbx_${bbxPath}`);
      return true;
    } catch (err) {
      console.error('[BBX] Error guardando en localStorage:', err);
      return false;
    }
  }
}
