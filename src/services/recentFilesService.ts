/**
 * Servicio puro de gestión de documentos recientes (ADR-0087).
 * Mantiene un historial de hasta 10 documentos con deduplicación por ruta,
 * persistencia en localStorage con fallback tolerante en memoria y pub/sub para reactividad UI.
 */

export interface RecentFile {
  path: string;
  name: string;
  lastOpened: string;
  pageCount?: number;
}

const STORAGE_KEY = 'rea:recent-files';
const MAX_RECENT_FILES = 10;

type RecentListener = (recents: RecentFile[]) => void;
const listeners = new Set<RecentListener>();

let memoryFallback: RecentFile[] = [];
let storageFailing = false;

function notifyListeners(recents: RecentFile[]): void {
  for (const listener of listeners) {
    try {
      listener(recents);
    } catch (err) {
      console.error('[RecentFiles] Error in subscriber callback:', err);
    }
  }
}

/**
 * Lee la lista de archivos recientes de localStorage (o memoria si el almacenamiento falló).
 */
export function getRecentFiles(): RecentFile[] {
  if (storageFailing) {
    return [...memoryFallback];
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is RecentFile =>
              typeof item === 'object' &&
              item !== null &&
              typeof item.path === 'string' &&
              typeof item.name === 'string'
          );
        }
      }
    }
  } catch (err) {
    console.warn('[RecentFiles] No se pudieron leer los archivos recientes de localStorage:', err);
    return [];
  }

  return [...memoryFallback];
}

/**
 * Guarda la lista en memoria y localStorage.
 */
function persistRecentFiles(recents: RecentFile[]): void {
  memoryFallback = [...recents];

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
      storageFailing = false;
    }
  } catch (err) {
    storageFailing = true;
    console.warn(
      '[RecentFiles] No se pudo guardar en localStorage (cuota o navegación privada); usando memoria:',
      err
    );
  }

  notifyListeners([...recents]);
}

/**
 * Añade o actualiza un archivo en la lista de recientes.
 * Si ya existe, se desplaza a la primera posición y se actualiza lastOpened.
 * Mantiene un tope estricto de 10 elementos.
 */
export function addRecentFile(file: {
  path: string;
  name: string;
  pageCount?: number;
}): void {
  if (!file.path || !file.name) return;

  const current = getRecentFiles();
  const existing = current.find((r) => r.path === file.path);
  const filtered = current.filter((r) => r.path !== file.path);

  const updatedItem: RecentFile = {
    path: file.path,
    name: file.name,
    lastOpened: new Date().toISOString(),
    pageCount: file.pageCount ?? existing?.pageCount,
  };

  const nextList = [updatedItem, ...filtered].slice(0, MAX_RECENT_FILES);
  persistRecentFiles(nextList);
}

/**
 * Elimina un archivo específico del historial por su ruta.
 */
export function removeRecentFile(path: string): void {
  const current = getRecentFiles();
  const nextList = current.filter((r) => r.path !== path);
  persistRecentFiles(nextList);
}

/**
 * Limpia todo el historial de archivos recientes.
 */
export function clearRecentFiles(): void {
  storageFailing = false;
  persistRecentFiles([]);
}

/**
 * Suscribe un callback a cualquier mutación de la lista de archivos recientes.
 * Retorna función de desuscripción.
 */
export function subscribeRecentFiles(listener: RecentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
