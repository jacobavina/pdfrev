import { isTauriEnvironment } from './bbxPersistenceService';
import { showToast } from './toastService';
import { MAX_BATCH_FILES, batchReportRows, type BatchInput, type BatchResult } from './batchOps';

/**
 * Entrada y salida de los procesos por lotes (ADR-0125): elegir los PDF y dónde se guardan los resultados. En la
 * aplicación de escritorio los resultados van a una carpeta; en el navegador se descargan uno a uno.
 */

/** Pide varios PDF y los lee. Los que no se puedan leer se saltan con un aviso. */
export async function pickBatchFiles(): Promise<BatchInput[]> {
  if (isTauriEnvironment()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ multiple: true, directory: false, title: 'Choose the PDF files', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!picked) return [];
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const out: BatchInput[] = [];
    for (const path of Array.isArray(picked) ? picked : [picked]) {
      try {
        out.push({ name: path.split(/[/\\]/).pop() || 'document.pdf', bytes: await readFile(path) });
      } catch (err) {
        showToast(`Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return out.slice(0, MAX_BATCH_FILES);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,application/pdf';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('cancel', () => {
      input.remove();
      resolve([]);
    });
    input.onchange = async () => {
      const files = [...(input.files ?? [])].slice(0, MAX_BATCH_FILES);
      input.remove();
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.click();
  });
}

export interface BatchSink {
  /** Dónde irán los resultados, para decírselo al usuario. */
  where: string;
  save: (name: string, bytes: Uint8Array) => Promise<void>;
}

/** Elige el destino de los resultados: la carpeta (escritorio) o las descargas (navegador). null si se cancela. */
export async function chooseBatchSink(): Promise<BatchSink | null> {
  if (isTauriEnvironment()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false, title: 'Choose the folder for the results' });
    if (!picked || Array.isArray(picked)) return null;
    const { invoke } = await import('@tauri-apps/api/core');
    const sep = picked.includes('\\') ? '\\' : '/';
    const folder = picked.replace(/[\\/]+$/, '');
    return {
      where: picked,
      save: async (name, bytes) => {
        await invoke('save_export_file', { filePath: `${folder}${sep}${name}`, bytes: Array.from(bytes) });
      },
    };
  }
  return {
    where: 'your downloads',
    save: async (name, bytes) => {
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

/** Guarda el informe del lote como CSV. */
export async function saveBatchReport(results: BatchResult[]): Promise<void> {
  const { escapeCsvField, saveExportFileWithDialog } = await import('./exportService');
  const text = batchReportRows(results).map((r) => r.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
  await saveExportFileWithDialog('batch_report.csv', 'csv', bytes);
}
