import { create } from 'zustand';

/**
 * Archivos adjuntos del documento (ADR-0027). Los bytes no van en la marca (que se copia, se exporta a JSON y pasa
 * por el historial) sino aquí, por clave; la marca guarda `customFields.attachmentKey`. Al guardar se embeben en el
 * PDF (/FileAttachment con /EmbeddedFile) y al abrir se recuperan de él.
 */
export interface AttachmentEntry {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

interface AttachmentState {
  files: Record<string, AttachmentEntry>;
  putAttachment: (key: string, entry: AttachmentEntry) => void;
  getAttachment: (key: string | undefined) => AttachmentEntry | undefined;
  resetAttachments: (files?: Record<string, AttachmentEntry>) => void;
}

export const useAttachmentStore = create<AttachmentState>((set, get) => ({
  files: {},
  putAttachment: (key, entry) => set((s) => ({ files: { ...s.files, [key]: entry } })),
  getAttachment: (key) => (key ? get().files[key] : undefined),
  resetAttachments: (files = {}) => set({ files: { ...files } }),
}));

/** Tamaño legible (B, KB, MB). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
