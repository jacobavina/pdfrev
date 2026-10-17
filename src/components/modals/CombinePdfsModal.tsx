import React, { useState, useEffect } from 'react';
import { X, Plus, ChevronUp, ChevronDown, Trash2, FileText, Layers } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { isTauriEnvironment } from '../../services/bbxPersistenceService';
import { executeCombineDocuments } from '../../services/pageService';
import { showToast } from '../../services/toastService';

export interface CombineFileItem {
  id: string;
  name: string;
  path?: string;
  bytes: Uint8Array;
  pageCount: number;
}

/**
 * Diálogo para combinar múltiples documentos PDF en uno solo (ADR-0084).
 * Estilo Bluebeam Revu 21: lista de archivos con reordenación, conteo de páginas y apertura en nueva pestaña.
 */
export const CombinePdfsModal: React.FC = () => {
  const { combineModalOpen, setCombineModalOpen } = useUiStore();
  const [files, setFiles] = useState<CombineFileItem[]>([]);
  const [outputName, setOutputName] = useState<string>('Combined Document.pdf');
  const [isCombining, setIsCombining] = useState<boolean>(false);

  useEffect(() => {
    if (!combineModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isCombining) {
        setCombineModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combineModalOpen, isCombining, setCombineModalOpen]);

  if (!combineModalOpen) return null;

  const handleAddFiles = async () => {
    try {
      const { PDFDocument } = await import('pdf-lib');

      if (isTauriEnvironment()) {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readFile } = await import('@tauri-apps/plugin-fs');

        const selected = await open({
          multiple: true,
          directory: false,
          filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }],
        });

        if (!selected) return;
        const paths = Array.isArray(selected) ? selected : [selected];

        const newItems: CombineFileItem[] = [];
        for (const filePath of paths) {
          const fileName = filePath.split(/[/\\]/).pop() || 'document.pdf';
          const bytes = await readFile(filePath);
          try {
            const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            newItems.push({
              id: `f-${Math.random().toString(36).slice(2, 9)}`,
              name: fileName,
              path: filePath,
              bytes,
              pageCount: doc.getPageCount(),
            });
          } catch (e) {
            console.warn(`[Combine] Archivo no válido ${fileName}:`, e);
            showToast(`Could not read ${fileName}: invalid or encrypted PDF.`);
          }
        }
        setFiles((prev) => [...prev, ...newItems]);
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.multiple = true;
        input.onchange = async () => {
          if (!input.files || input.files.length === 0) return;
          const newItems: CombineFileItem[] = [];
          for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            try {
              const buffer = await file.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
              newItems.push({
                id: `f-${Math.random().toString(36).slice(2, 9)}`,
                name: file.name,
                bytes,
                pageCount: doc.getPageCount(),
              });
            } catch (e) {
              console.warn(`[Combine] Archivo no válido o no legible ${file.name}:`, e);
              showToast(`Could not read ${file.name}: invalid, unreadable, or encrypted PDF.`);
            }
          }
          setFiles((prev) => [...prev, ...newItems]);
        };
        input.click();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Error adding files: ${msg}`);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setFiles((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= files.length - 1) return;
    setFiles((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleCombine = async () => {
    if (files.length === 0) return;
    setIsCombining(true);
    try {
      const sources = files.map((f) => ({
        name: f.name,
        bytes: f.bytes,
      }));
      const cleanName = outputName.trim() || 'Combined Document.pdf';
      const finalName = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;

      const result = await executeCombineDocuments(sources, finalName);
      if (result) {
        setCombineModalOpen(false);
        setFiles([]);
      }
    } finally {
      setIsCombining(false);
    }
  };

  const totalPages = files.reduce((acc, f) => acc + f.pageCount, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isCombining) {
          setCombineModalOpen(false);
        }
      }}
      data-testid="combine-pdfs-modal"
    >
      <div className="bg-cad-panel border border-cad-border rounded w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden text-cad-strong">
        {/* Cabecera estilo Revu 21 */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-cad-dark border-b border-cad-border shrink-0">
          <div className="flex items-center gap-2 font-medium text-sm">
            <Layers size={16} className="text-cad-accent" />
            <span>Combine PDF Files</span>
          </div>
          <button
            type="button"
            data-testid="close-combine-modal-btn"
            onClick={() => !isCombining && setCombineModalOpen(false)}
            title="Close"
            aria-label="Close"
            className="p-1 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenido / Lista de archivos */}
        <div className="p-4 flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Arrange files in the desired order for the combined document:
            </span>
            <button
              type="button"
              data-testid="add-combine-files-btn"
              onClick={handleAddFiles}
              disabled={isCombining}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-cad-subtle border border-cad-border hover:bg-cad-border text-cad-strong transition-colors"
            >
              <Plus size={16} className="text-cad-accent" />
              <span>Add Files…</span>
            </button>
          </div>

          {/* Tabla / Lista de Archivos */}
          <div className="border border-cad-border rounded bg-cad-dark/50 flex-1 min-h-[160px] max-h-[300px] overflow-y-auto">
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-gray-400 p-6 text-center">
                <FileText size={16} className="mb-2 text-gray-500" />
                <span>No PDF files added yet.</span>
                <span className="text-2xs text-gray-500 mt-1">
                  Click "Add Files…" to select PDFs to merge.
                </span>
              </div>
            ) : (
              <div className="divide-y divide-cad-border/60">
                {files.map((file, idx) => (
                  <div
                    key={file.id}
                    data-testid={`combine-file-row-${idx}`}
                    className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-cad-subtle/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <span className="text-2xs font-mono text-gray-500 w-4 text-right shrink-0">
                        {idx + 1}
                      </span>
                      <FileText size={16} className="text-cad-accent shrink-0" />
                      <span className="truncate font-medium" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-2xs text-gray-400 shrink-0 ml-1">
                        ({file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'})
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        data-testid={`combine-move-up-${idx}`}
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0 || isCombining}
                        title="Move Up"
                        aria-label="Move Up"
                        className="p-1 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        data-testid={`combine-move-down-${idx}`}
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === files.length - 1 || isCombining}
                        title="Move Down"
                        aria-label="Move Down"
                        className="p-1 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        type="button"
                        data-testid={`combine-remove-${idx}`}
                        onClick={() => handleRemove(file.id)}
                        disabled={isCombining}
                        title="Remove file"
                        aria-label="Remove file"
                        className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-cad-subtle disabled:opacity-30 ml-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Opciones de salida */}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-gray-400">
              Total: {files.length} {files.length === 1 ? 'file' : 'files'} · {totalPages} {totalPages === 1 ? 'page' : 'pages'}
            </span>
          </div>

          <div className="flex flex-col gap-1 pt-1">
            <label htmlFor="output-filename" className="text-xs text-gray-400">
              Output Document Name:
            </label>
            <input
              id="output-filename"
              data-testid="combine-output-name-input"
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              disabled={isCombining}
              className="px-2.5 py-1 text-xs rounded bg-cad-dark border border-cad-border text-cad-strong focus:outline-none focus:border-cad-accent"
              placeholder="Combined Document.pdf"
            />
          </div>
        </div>

        {/* Botones inferiores */}
        <div className="px-4 py-2.5 bg-cad-dark border-t border-cad-border flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            data-testid="combine-cancel-btn"
            onClick={() => setCombineModalOpen(false)}
            disabled={isCombining}
            className="px-3 py-1 text-xs rounded border border-cad-border hover:bg-cad-subtle text-cad-strong transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="combine-submit-btn"
            onClick={handleCombine}
            disabled={files.length === 0 || isCombining}
            className="px-4 py-1 text-xs rounded bg-cad-accent hover:opacity-90 text-white font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isCombining ? (
              <span>Combining…</span>
            ) : (
              <>
                <Layers size={16} />
                <span>Combine</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
