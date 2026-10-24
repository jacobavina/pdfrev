import React, { useState, useEffect } from 'react';
import { FolderOpen, Clock, FileText, Trash2, UploadCloud } from 'lucide-react';
import { loadPdfData, openPdfDialog, openPdfFromPath } from '../../services/fileDialogService';
import { showToast } from '../../services/toastService';
import {
  getRecentFiles,
  clearRecentFiles,
  subscribeRecentFiles,
  RecentFile,
} from '../../services/recentFilesService';

export const WelcomeCanvas: React.FC = () => {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    return subscribeRecentFiles((files) => setRecentFiles(files));
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const buffer = await file.arrayBuffer();
          // En entornos de escritorio (Tauri/Chromium), File incluye la propiedad de ruta nativa
          const droppedPath = ('path' in file && typeof (file as { path?: unknown }).path === 'string')
            ? (file as { path: string }).path
            : null;
          await loadPdfData(
            droppedPath,
            file.name,
            new Uint8Array(buffer)
          );
        }
      }
    } catch (dropErr) {
      console.error('[WelcomeCanvas] Error loading dropped file:', dropErr);
      showToast(`Could not load dropped file: ${dropErr instanceof Error ? dropErr.message : String(dropErr)}`);
    }
  };

  return (
    <div
      data-testid="welcome-canvas"
      className="m-auto w-full max-w-lg select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="w-full bg-cad-panel border border-cad-border rounded-xl p-6 space-y-6">
        {/* Encabezado de Bienvenida */}
        <div className="flex items-center space-x-3 pb-4 border-b border-cad-border">
          <div className="w-10 h-10 rounded-lg bg-cad-accent/15 border border-cad-accent/30 flex items-center justify-center text-cad-accent">
            <FolderOpen size={20} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-cad-strong">pdfrev CAD Blueprint Viewer</h1>
            <p className="text-xs text-gray-400">Open a PDF blueprint or review takeoff documents</p>
          </div>
        </div>

        {/* Zona de Drop & Botón Primario */}
        <div
          data-testid="welcome-dropzone"
          onClick={() => void openPdfDialog()}
          className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-cad-accent bg-cad-accent/10'
              : 'border-cad-border hover:border-cad-accent/70 hover:bg-cad-hover'
          }`}
        >
          <UploadCloud size={20} className="text-cad-accent mb-2" />
          <p className="text-xs font-medium text-cad-strong mb-1">
            Drag and drop a PDF blueprint here
          </p>
          <p className="text-2xs text-gray-400 mb-4">
            Supports architectural, engineering and scanned plans
          </p>
          <button
            type="button"
            data-testid="welcome-open-btn"
            onClick={(e) => {
              e.stopPropagation();
              void openPdfDialog();
            }}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-cad-accent text-white hover:bg-cad-accent/90 transition-colors"
          >
            Open PDF…
          </button>
        </div>

        {/* Sección de Documentos Recientes */}
        {recentFiles.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-cad-border text-xs text-gray-400">
              <span className="flex items-center space-x-1.5 font-medium text-cad-strong">
                <Clock size={16} className="text-gray-400" />
                <span>Recent Documents</span>
              </span>
              <button
                type="button"
                data-testid="welcome-clear-recents-btn"
                onClick={() => clearRecentFiles()}
                className="flex items-center space-x-1 text-2xs text-gray-400 hover:text-red-400 transition-colors"
                title="Clear recent files"
              >
                <Trash2 size={16} />
                <span>Clear</span>
              </button>
            </div>

            <div className="space-y-1 max-h-56 overflow-y-auto">
              {recentFiles.map((rf, idx) => (
                <button
                  key={rf.path}
                  type="button"
                  data-testid={`welcome-recent-item-${idx}`}
                  title={rf.path}
                  onClick={() => void openPdfFromPath(rf.path)}
                  className="w-full flex items-center justify-between p-2 rounded-md hover:bg-cad-hover text-left text-xs transition-colors group"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <FileText size={16} className="text-cad-accent shrink-0" />
                    <span className="truncate text-gray-200 group-hover:text-cad-strong">
                      {rf.name}
                    </span>
                  </div>
                  {rf.pageCount && (
                    <span className="shrink-0 text-2xs px-1.5 py-0.5 rounded bg-cad-subtle border border-cad-border text-gray-400">
                      {rf.pageCount} pgs
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
