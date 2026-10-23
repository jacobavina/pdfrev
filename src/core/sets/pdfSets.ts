/**
 * Conjuntos de documentos (Sets, ADR-0119): listas con nombre de archivos PDF que se abren juntos, por ejemplo todas las
 * hojas de un proyecto. Solo guardan rutas; los archivos no se copian. Puro.
 */

export interface SetFile {
  path: string;
  name: string;
}

export interface PdfSet {
  id: string;
  name: string;
  files: SetFile[];
  createdAt: string;
}

export const MAX_SETS = 50;
export const MAX_FILES_PER_SET = 500;
export const MAX_SET_NAME = 80;

/** Ruta con barras normales y en minúsculas, para comparar rutas de Windows sin distinguir mayúsculas. */
export const comparablePath = (p: string): string => p.replace(/\\/g, '/').toLowerCase();

export const fileNameOf = (p: string): string => p.replace(/\\/g, '/').split('/').pop() || p;

/** Nombre que no repite el de otro conjunto: "Obra", "Obra (2)"… */
export function uniqueSetName(base: string, sets: PdfSet[], exceptId?: string): string {
  const clean = base.trim().slice(0, MAX_SET_NAME) || 'New set';
  const used = new Set(sets.filter((s) => s.id !== exceptId).map((s) => s.name.toLowerCase()));
  if (!used.has(clean.toLowerCase())) return clean;
  for (let i = 2; ; i++) {
    const candidate = `${clean} (${i})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export interface AddResult {
  set: PdfSet;
  added: number;
  /** Rutas que ya estaban en el conjunto. */
  duplicates: number;
  /** Rutas que no cupieron por el máximo de archivos. */
  overflow: number;
}

/** Añade rutas al final del conjunto, sin repetir y sin pasar del máximo. Solo cuentan las rutas de PDF. */
export function addFilesToSet(set: PdfSet, paths: string[]): AddResult {
  const known = new Set(set.files.map((f) => comparablePath(f.path)));
  const files = [...set.files];
  let added = 0;
  let duplicates = 0;
  let overflow = 0;
  for (const path of paths) {
    if (!/\.pdf$/i.test(path)) continue;
    const key = comparablePath(path);
    if (known.has(key)) {
      duplicates++;
      continue;
    }
    if (files.length >= MAX_FILES_PER_SET) {
      overflow++;
      continue;
    }
    known.add(key);
    files.push({ path, name: fileNameOf(path) });
    added++;
  }
  return { set: { ...set, files }, added, duplicates, overflow };
}

export function removeFileFromSet(set: PdfSet, path: string): PdfSet {
  const key = comparablePath(path);
  return { ...set, files: set.files.filter((f) => comparablePath(f.path) !== key) };
}

/** Mueve un archivo de una posición a otra del conjunto. */
export function moveFileInSet(set: PdfSet, from: number, to: number): PdfSet {
  if (from === to || from < 0 || to < 0 || from >= set.files.length || to >= set.files.length) return set;
  const files = [...set.files];
  const [moved] = files.splice(from, 1);
  files.splice(to, 0, moved);
  return { ...set, files };
}

// ── Persistencia ────────────────────────────────────────────────────────────────────────────────────────────────

export const SETS_STORAGE_KEY = 'rea-sets';

/** Conjuntos guardados; lo que no tenga la forma esperada se descarta sin romper el resto. */
export function parseStoredSets(raw: string | null): PdfSet[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as { v?: number; sets?: unknown };
    if (!data || !Array.isArray(data.sets)) return [];
    const out: PdfSet[] = [];
    for (const s of data.sets.slice(0, MAX_SETS)) {
      const item = s as Partial<PdfSet> | null;
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.files)) continue;
      const files: SetFile[] = [];
      const seen = new Set<string>();
      for (const f of item.files.slice(0, MAX_FILES_PER_SET)) {
        const file = f as Partial<SetFile> | null;
        if (!file || typeof file.path !== 'string' || !file.path) continue;
        const key = comparablePath(file.path);
        if (seen.has(key)) continue;
        seen.add(key);
        files.push({ path: file.path, name: typeof file.name === 'string' && file.name ? file.name : fileNameOf(file.path) });
      }
      out.push({ id: item.id, name: item.name.slice(0, MAX_SET_NAME), files, createdAt: typeof item.createdAt === 'string' ? item.createdAt : '' });
    }
    return out;
  } catch {
    return [];
  }
}

export const serializeSets = (sets: PdfSet[]): string => JSON.stringify({ v: 1, sets });
