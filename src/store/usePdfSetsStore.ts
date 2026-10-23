import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { SETS_STORAGE_KEY, MAX_SETS, addFilesToSet, moveFileInSet, parseStoredSets, removeFileFromSet, serializeSets, uniqueSetName, type AddResult, type PdfSet } from '../core/sets/pdfSets';

/**
 * Conjuntos de documentos (Sets, ADR-0119). Se guardan en el almacenamiento local de la aplicación: son listas de
 * rutas, no archivos.
 */

function readStored(): PdfSet[] {
  try {
    return parseStoredSets(localStorage.getItem(SETS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist(sets: PdfSet[]): void {
  try {
    localStorage.setItem(SETS_STORAGE_KEY, serializeSets(sets));
  } catch {
    // Sin almacenamiento los conjuntos duran lo que la sesión
  }
}

interface PdfSetsState {
  sets: PdfSet[];
  /** Crea un conjunto con esos archivos; devuelve su id o null si ya hay el máximo de conjuntos. */
  createSet: (name: string, paths?: string[]) => string | null;
  renameSet: (id: string, name: string) => void;
  deleteSet: (id: string) => void;
  addFiles: (id: string, paths: string[]) => AddResult | null;
  removeFile: (id: string, path: string) => void;
  moveFile: (id: string, from: number, to: number) => void;
  /** Vuelve a leer lo guardado (otra ventana pudo cambiarlo). */
  reload: () => void;
}

export const usePdfSetsStore = create<PdfSetsState>((set, get) => {
  const commit = (sets: PdfSet[]) => {
    persist(sets);
    set({ sets });
  };
  const update = (id: string, fn: (s: PdfSet) => PdfSet) => commit(get().sets.map((s) => (s.id === id ? fn(s) : s)));

  return {
    sets: readStored(),
    createSet: (name, paths = []) => {
      const { sets } = get();
      if (sets.length >= MAX_SETS) return null;
      const base: PdfSet = { id: uuidv4(), name: uniqueSetName(name, sets), files: [], createdAt: new Date().toISOString() };
      commit([...sets, addFilesToSet(base, paths).set]);
      return base.id;
    },
    renameSet: (id, name) => update(id, (s) => ({ ...s, name: uniqueSetName(name, get().sets, id) })),
    deleteSet: (id) => commit(get().sets.filter((s) => s.id !== id)),
    addFiles: (id, paths) => {
      const current = get().sets.find((s) => s.id === id);
      if (!current) return null;
      const result = addFilesToSet(current, paths);
      if (result.added > 0) update(id, () => result.set);
      return result;
    },
    removeFile: (id, path) => update(id, (s) => removeFileFromSet(s, path)),
    moveFile: (id, from, to) => update(id, (s) => moveFileInSet(s, from, to)),
    reload: () => set({ sets: readStored() }),
  };
});
