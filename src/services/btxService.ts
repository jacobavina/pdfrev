import { buildBtx, parseBtx } from '../core/toolchest/btx';
import { btxItemsToMarkups } from '../core/toolchest/btxConvert';
import { toolsToBtxItems } from '../core/toolchest/btxExport';
import { useToolChestStore } from '../store/useToolChestStore';
import { isTauriEnvironment } from './bbxPersistenceService';
import { saveExportFileWithDialog } from './exportService';
import { showToast } from './toastService';

/**
 * Importar y exportar Tool Sets de Revu (.btx) desde el Tool Chest (ADR-0101).
 */

/** Pide un archivo .btx y devuelve su texto, o null si se cancela. */
async function pickBtx(): Promise<{ name: string; text: string } | null> {
  if (isTauriEnvironment()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      title: 'Import a Revu tool set',
      filters: [{ name: 'Revu Tool Set', extensions: ['btx'] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    return { name: selected.split(/[/\\]/).pop() || 'toolset.btx', text: new TextDecoder().decode(await readFile(selected)) };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.btx';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      resolve(file ? { name: file.name, text: await file.text() } : null);
    };
    input.click();
  });
}

/** Nombre de paleta que no repite uno existente: "Concrete", "Concrete (2)"… */
export function uniquePaletteName(base: string, existing: string[]): string {
  const names = new Set(existing.map((n) => n.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

const joinReasons = (items: { reason: string }[]) => [...new Set(items.map((s) => s.reason))].join(' ');

export interface BtxImportSummary {
  title: string;
  imported: number;
  skipped: number;
  reasons: string;
}

/** Importa el texto de un .btx como una paleta nueva. Devuelve lo que se importó o null si no había nada importable. */
export async function importBtxText(text: string, fallbackName: string): Promise<BtxImportSummary | null> {
  const file = await parseBtx(text);
  const { tools, skipped } = await btxItemsToMarkups(file.items);
  if (tools.length === 0) {
    showToast(`No tools could be imported from "${file.title}".${skipped[0] ? ` ${skipped[0].reason}` : ''}`);
    return null;
  }
  const store = useToolChestStore.getState();
  const base = file.title || fallbackName.replace(/\.btx$/i, '');
  const palette = await store.createPalette(uniquePaletteName(base, useToolChestStore.getState().palettes.map((p) => p.name)));
  for (const t of tools) await store.createToolFromMarkup(palette.id, t.markup, t.markup.subject || t.name, t.mode);
  store.setActivePalette(palette.id);
  return { title: file.title, imported: tools.length, skipped: skipped.length, reasons: joinReasons(skipped) };
}

const describeImport = (s: BtxImportSummary) =>
  `Imported ${s.imported} tool${s.imported === 1 ? '' : 's'} from "${s.title}".` + (s.skipped > 0 ? ` ${s.skipped} skipped: ${s.reasons}` : '');

/** Importa un Tool Set de Revu elegido con el selector de archivos. */
export async function importBtxFromPicker(): Promise<void> {
  try {
    const picked = await pickBtx();
    if (!picked) return;
    const summary = await importBtxText(picked.text, picked.name);
    if (summary) showToast(describeImport(summary));
  } catch (err) {
    showToast(`Could not import the tool set: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Tool Sets que Revu ya tiene instalados (ADR-0105) ────────────────────────────────────────────────────────────

export interface RevuToolSetEntry {
  path: string;
  fileName: string;
  size: number;
  /** Nombre y número de herramientas del Tool Set, leídos del archivo. */
  title: string;
  toolCount: number;
}

interface RevuFileReply {
  path: string;
  file_name: string;
  size: number;
}

async function readRevuToolSet(path: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = await invoke<number[]>('read_revu_toolset', { path });
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Tool Sets de la carpeta de datos de Revu del usuario (solo en la aplicación de escritorio). */
export async function listRevuToolSets(): Promise<RevuToolSetEntry[]> {
  if (!isTauriEnvironment()) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  const files = await invoke<RevuFileReply[]>('list_revu_toolsets');
  const out: RevuToolSetEntry[] = [];
  for (const f of files) {
    try {
      const parsed = await parseBtx(await readRevuToolSet(f.path));
      out.push({ path: f.path, fileName: f.file_name, size: f.size, title: parsed.title || f.file_name.replace(/\.btx$/i, ''), toolCount: parsed.items.length });
    } catch {
      // Un archivo que no se puede leer no aparece en la lista
    }
  }
  return out;
}

/** Importa como paletas los Tool Sets elegidos de la carpeta de Revu. */
export async function importRevuToolSets(paths: string[]): Promise<void> {
  let tools = 0;
  let sets = 0;
  let skipped = 0;
  for (const path of paths) {
    try {
      const summary = await importBtxText(await readRevuToolSet(path), path.split(/[/\\]/).pop() || 'toolset.btx');
      if (summary) {
        sets++;
        tools += summary.imported;
        skipped += summary.skipped;
      }
    } catch (err) {
      showToast(`Could not import ${path.split(/[/\\]/).pop()}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (sets > 0) {
    showToast(`Imported ${tools} tool${tools === 1 ? '' : 's'} in ${sets} palette${sets === 1 ? '' : 's'} from Revu.${skipped > 0 ? ` ${skipped} could not be imported (stamps with their own artwork and similar).` : ''}`);
  }
}

/** Exporta las herramientas de una paleta como un Tool Set de Revu. */
export async function exportPaletteToBtx(paletteId: string): Promise<void> {
  try {
    const { palettes, tools } = useToolChestStore.getState();
    const palette = palettes.find((p) => p.id === paletteId);
    if (!palette) return;
    const { items, skipped } = await toolsToBtxItems(tools.filter((t) => t.paletteId === paletteId));
    if (items.length === 0) {
      showToast(`"${palette.name}" has no tools that Revu can read.`);
      return;
    }
    const xml = await buildBtx({ title: palette.name, items });
    const safeName = palette.name.replace(/[\\/:*?"<>|]+/g, '_');
    const saved = await saveExportFileWithDialog(`${safeName}.btx`, 'btx', new TextEncoder().encode(xml));
    if (saved && skipped.length > 0) {
      showToast(`${skipped.length} tool${skipped.length === 1 ? '' : 's'} not exported: ${joinReasons(skipped)}`);
    }
  } catch (err) {
    showToast(`Could not export the tool set: ${err instanceof Error ? err.message : String(err)}`);
  }
}
