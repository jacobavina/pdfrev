import { usePdfSetsStore } from '../store/usePdfSetsStore';
import { useDocumentTabsStore } from '../store/useDocumentTabsStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { isTauriEnvironment } from './bbxPersistenceService';
import { showToast } from './toastService';

/**
 * Sets (ADR-0119): elegir archivos, abrir un conjunto y reunir los documentos abiertos. Las rutas solo existen en la
 * aplicación de escritorio: en el navegador el panel lo explica y no ofrece nada de esto.
 */

/** Los documentos abiertos que tienen ruta en disco (la pestaña activa incluida). */
export function openDocumentPaths(): string[] {
  const active = useDocumentStore.getState().filePath;
  const paths = useDocumentTabsStore.getState().tabs.map((t) => t.filePath);
  return [...new Set([...paths, active].filter((p): p is string => !!p))];
}

/** Pide varios PDF y los añade al conjunto. */
export async function addFilesWithDialog(setId: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ multiple: true, directory: false, title: 'Add PDF files to the set', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    reportAdd(usePdfSetsStore.getState().addFiles(setId, paths));
  } catch (err) {
    showToast(`Could not choose the files: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Añade al conjunto los documentos que están abiertos. */
export function addOpenDocuments(setId: string): void {
  const paths = openDocumentPaths();
  if (paths.length === 0) {
    showToast('There are no saved documents open to add.');
    return;
  }
  reportAdd(usePdfSetsStore.getState().addFiles(setId, paths));
}

/** Crea un conjunto con los documentos abiertos. */
export function createSetFromOpenDocuments(name: string): string | null {
  const paths = openDocumentPaths();
  const id = usePdfSetsStore.getState().createSet(name, paths);
  if (!id) showToast('The maximum number of sets has been reached. Delete one first.');
  else if (paths.length === 0) showToast('Set created. Add files with Add files…');
  return id;
}

function reportAdd(r: ReturnType<ReturnType<typeof usePdfSetsStore.getState>['addFiles']>): void {
  if (!r) return;
  const parts = [`${r.added} file${r.added === 1 ? '' : 's'} added`];
  if (r.duplicates > 0) parts.push(`${r.duplicates} already in the set`);
  if (r.overflow > 0) parts.push(`${r.overflow} left out: a set holds at most 500 files`);
  showToast(`${parts.join(', ')}.`);
}

/** Abre un archivo del conjunto (si ya está abierto, va a su pestaña). */
export async function openSetFile(path: string): Promise<void> {
  const { openPdfFromPath } = await import('./fileDialogService');
  await openPdfFromPath(path);
}

/** Abre todos los archivos del conjunto, uno tras otro; los que fallen se cuentan al final. */
export async function openWholeSet(setId: string, onProgress?: (done: number, total: number) => void): Promise<{ opened: number; failed: string[] }> {
  const set = usePdfSetsStore.getState().sets.find((s) => s.id === setId);
  if (!set) return { opened: 0, failed: [] };
  const { openPdfFromPath } = await import('./fileDialogService');
  const failed: string[] = [];
  for (let i = 0; i < set.files.length; i++) {
    onProgress?.(i, set.files.length);
    // Un error nuevo en el estado del documento es que ese archivo no se pudo abrir
    useDocumentStore.getState().setError(null);
    await openPdfFromPath(set.files[i].path);
    if (useDocumentStore.getState().error) failed.push(set.files[i].name);
  }
  onProgress?.(set.files.length, set.files.length);
  const opened = set.files.length - failed.length;
  showToast(failed.length === 0 ? `${opened} file${opened === 1 ? '' : 's'} opened.` : `${opened} opened. Could not open: ${failed.join(', ')}.`);
  return { opened, failed };
}
