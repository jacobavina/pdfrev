import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore } from '../store/useToolStore';
import { saveBbxForPdf } from './bbxPersistenceService';
import { showToast } from './toastService';

/**
 * Guardar y Guardar como (ADR-0028). El PDF se guarda con escritura incremental (las marcas como anotaciones
 * estándar, legibles en Revu y Acrobat) y, junto a él, la copia de recuperación .bbx.json.
 * - Guardar: escribe en el archivo abierto; si el documento no tiene archivo (demostración), hace Guardar como.
 * - Guardar como: pide la ruta (diálogo nativo) y el documento pasa a ser ese archivo; en el navegador, descarga.
 */

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
let saving = false;

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() || 'document.pdf';
}

/** Escribe el PDF y el sidecar en `path`; solo si ambos se escriben, el documento queda como guardado. */
async function writeTo(path: string): Promise<boolean> {
  const { pdfBytes, customColumns } = useDocumentStore.getState();
  const { markups } = useMarkupStore.getState();
  const { author } = useToolStore.getState();
  if (!pdfBytes || pdfBytes.length === 0) {
    showToast('There is no document to save.');
    return false;
  }
  const { savePdfIncremental } = await import('./pdfPersistenceService');
  const result = await savePdfIncremental(path, pdfBytes, markups);
  if (!result.success) return false;
  const sidecarOk = await saveBbxForPdf(path, markups, author, customColumns);
  if (sidecarOk) useMarkupStore.getState().markAsClean();
  return sidecarOk;
}

export async function saveDocument(): Promise<boolean> {
  const { filePath, pdfBytes } = useDocumentStore.getState();
  if (!pdfBytes) {
    showToast('There is no document to save.');
    return false;
  }
  if (!filePath) return saveDocumentAs();
  if (saving) return false;
  saving = true;
  try {
    const ok = await writeTo(filePath);
    if (ok) showToast(`Saved: ${baseName(filePath)}`);
    return ok;
  } finally {
    saving = false;
  }
}

export async function saveDocumentAs(): Promise<boolean> {
  const { pdfBytes, fileName } = useDocumentStore.getState();
  if (!pdfBytes) {
    showToast('There is no document to save.');
    return false;
  }
  if (saving) return false;
  saving = true;
  try {
    const suggested = `${(fileName ?? 'document').replace(/\.pdf$/i, '') || 'document'}.pdf`;
    if (isTauri()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      let target = await save({
        title: 'Save As',
        defaultPath: suggested,
        filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      });
      if (!target) return false;
      if (!/\.pdf$/i.test(target)) target = `${target}.pdf`;
      const ok = await writeTo(target);
      if (ok) {
        useDocumentStore.getState().setFileLocation(target, baseName(target));
        showToast(`Saved as ${baseName(target)}`);
      }
      return ok;
    }
    // Navegador: se genera el PDF con las marcas y se descarga
    const { markups } = useMarkupStore.getState();
    const { savePdfIncremental } = await import('./pdfPersistenceService');
    const result = await savePdfIncremental(suggested, pdfBytes, markups);
    if (!result.success || !result.bytes) return false;
    const blob = new Blob([result.bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggested;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    useMarkupStore.getState().markAsClean();
    showToast(`Saved as ${suggested} (downloaded)`);
    return true;
  } catch (err) {
    showToast(`Could not save the document: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    saving = false;
  }
}
