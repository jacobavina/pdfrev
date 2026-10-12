import { showToast } from './toastService';
import { useDocumentStore } from '../store/useDocumentStore';
import { AttachmentEntry } from '../store/useAttachmentStore';

/**
 * Enlaces y adjuntos (ADR-0027): abrir URLs en el navegador del sistema, ir a páginas, elegir y guardar archivos.
 * Ningún fallo es silencioso: todo error llega al usuario como aviso.
 */

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Solo http, https y mailto (la misma regla que valida el comando nativo). */
export function isAllowedLinkUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)[^\s"'`<>|^\\]+$/i.test(url.trim()) && url.length <= 2048;
}

/** Normaliza lo que escribe el usuario: "example.com" → "https://example.com". */
export function normalizeLinkUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  if (/^(https?:\/\/|mailto:)/i.test(t)) return t;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(t)) return `mailto:${t}`;
  return `https://${t}`;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isAllowedLinkUrl(url)) {
    showToast(`This link cannot be opened (only http, https or mailto): ${url}`);
    return;
  }
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_url', { url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (err) {
    showToast(`Could not open the link: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Ir a una página (1..N) del documento abierto. */
export function goToPageNumber(pageNumber: number): void {
  const { numPages, setCurrentPage } = useDocumentStore.getState();
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > numPages) {
    showToast(`Page ${pageNumber} does not exist in this document (1–${numPages}).`);
    return;
  }
  setCurrentPage(pageNumber - 1);
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Elige un archivo para adjuntar (diálogo nativo en Tauri; selector del navegador en la web). */
export async function pickAttachmentFile(): Promise<AttachmentEntry | null> {
  try {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false, directory: false, title: 'Attach file' });
      if (!selected || Array.isArray(selected)) return null;
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(selected);
      if (bytes.length > MAX_ATTACHMENT_BYTES) {
        showToast('The file is larger than 25 MB and cannot be attached.');
        return null;
      }
      const name = selected.split(/[/\\]/).pop() || 'attachment';
      return { name, mime: guessMime(name), bytes };
    }
    return await new Promise<AttachmentEntry | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      // En el documento mientras se usa: algunos navegadores no notifican 'change' a un input suelto
      document.body.appendChild(input);
      const done = () => input.remove();
      input.addEventListener('cancel', () => {
        done();
        resolve(null);
      });
      input.onchange = async () => {
        const file = input.files?.[0];
        done();
        if (!file) return resolve(null);
        if (file.size > MAX_ATTACHMENT_BYTES) {
          showToast('The file is larger than 25 MB and cannot be attached.');
          return resolve(null);
        }
        resolve({ name: file.name, mime: file.type || guessMime(file.name), bytes: new Uint8Array(await file.arrayBuffer()) });
      };
      input.click();
    });
  } catch (err) {
    showToast(`Could not read the file to attach: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Guarda un adjunto en disco (diálogo nativo en Tauri; descarga en la web). */
export async function saveAttachment(entry: AttachmentEntry): Promise<void> {
  try {
    if (isTauri()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const target = await save({ defaultPath: entry.name, title: 'Save attachment' });
      if (!target) return;
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(target, entry.bytes);
      showToast(`Attachment saved: ${target}`);
      return;
    }
    const blob = new Blob([entry.bytes.slice().buffer as ArrayBuffer], { type: entry.mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast(`Could not save the attachment: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    txt: 'text/plain',
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dwg: 'application/acad',
  };
  return map[ext] ?? 'application/octet-stream';
}
