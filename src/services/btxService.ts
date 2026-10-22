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

/** Importa un Tool Set de Revu como una paleta nueva. */
export async function importBtxFromPicker(): Promise<void> {
  try {
    const picked = await pickBtx();
    if (!picked) return;
    const file = await parseBtx(picked.text);
    const { tools, skipped } = await btxItemsToMarkups(file.items);
    if (tools.length === 0) {
      showToast(`No tools could be imported from "${file.title}".${skipped[0] ? ` ${skipped[0].reason}` : ''}`);
      return;
    }
    const store = useToolChestStore.getState();
    const base = file.title || picked.name.replace(/\.btx$/i, '');
    const palette = await store.createPalette(uniquePaletteName(base, store.palettes.map((p) => p.name)));
    for (const t of tools) await store.createToolFromMarkup(palette.id, t.markup, t.markup.subject || t.name, t.mode);
    store.setActivePalette(palette.id);
    showToast(
      `Imported ${tools.length} tool${tools.length === 1 ? '' : 's'} from "${file.title}".` +
        (skipped.length > 0 ? ` ${skipped.length} skipped: ${joinReasons(skipped)}` : '')
    );
  } catch (err) {
    showToast(`Could not import the tool set: ${err instanceof Error ? err.message : String(err)}`);
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
