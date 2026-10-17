import React from 'react';
import { FileText, X, Plus } from 'lucide-react';
import { useDocumentTabsStore } from '../../store/useDocumentTabsStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { openPdfDialog } from '../../services/fileDialogService';

/**
 * Barra superior de pestañas multi-documento estilo Bluebeam Revu 21 (ADR-0083).
 * Muestra pestañas de documentos abiertos, conmutación instantánea, indicador de dirty y botón de cierre.
 */
export const DocumentBar: React.FC = () => {
  const { tabs, activeTabId, switchTab, closeTab } = useDocumentTabsStore();
  const { fileName, filePath } = useDocumentStore();
  const activeIsDirty = useMarkupStore((s) => s.isDirty);

  // Fallback si no hay pestañas registradas pero hay un documento abierto en useDocumentStore
  if (tabs.length === 0) {
    if (!fileName) return null;
    return (
      <div
        className="h-7 bg-cad-dark border-y border-cad-border flex items-end px-2 shrink-0 gap-1 overflow-x-auto select-none"
        data-testid="document-tabs"
      >
        <div
          data-testid="document-tab-single"
          className="relative flex items-center gap-1.5 h-7 px-2.5 text-xs text-cad-strong bg-cad-panel border-x border-cad-border max-w-[18rem]"
          title={filePath ?? fileName}
        >
          <FileText size={16} className="shrink-0 text-cad-accent" />
          <span className="truncate max-w-[12rem]">{fileName}</span>
          {activeIsDirty && filePath && <span className="text-amber-600 dark:text-amber-400 font-bold text-2xs leading-none shrink-0">●</span>}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cad-accent" />
        </div>
        <button
          type="button"
          data-testid="add-document-tab-btn"
          onClick={() => openPdfDialog()}
          title="Open PDF in new tab"
          className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle mb-0.5 ml-0.5 shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label="Open documents"
      className="h-7 bg-cad-dark border-y border-cad-border flex items-end px-2 shrink-0 gap-1 overflow-x-auto select-none"
      data-testid="document-tabs"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDirty = isActive ? activeIsDirty : tab.isDirty;
        const currentFileName = isActive ? (fileName ?? tab.fileName) : tab.fileName;
        const currentFilePath = isActive ? (filePath ?? tab.filePath) : tab.filePath;

        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            data-testid={`document-tab-${tab.id}`}
            onClick={() => switchTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchTab(tab.id);
              }
            }}
            title={currentFilePath ?? currentFileName}
            className={`group relative flex items-center gap-1.5 h-7 px-2.5 text-xs cursor-pointer transition-colors max-w-[18rem] ${
              isActive
                ? 'text-cad-strong bg-cad-panel border-x border-cad-border'
                : 'text-gray-400 hover:text-gray-200 hover:bg-cad-panel/40 border-x border-transparent'
            }`}
          >
            <FileText size={16} className={`shrink-0 ${isActive ? 'text-cad-accent' : 'text-gray-400'}`} />
            <span className="truncate max-w-[12rem]">{currentFileName}</span>
            {isDirty && <span className="text-amber-600 dark:text-amber-400 font-bold text-2xs leading-none shrink-0">●</span>}
            <button
              type="button"
              data-testid={`close-tab-btn-${tab.id}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              title={`Close ${currentFileName}`}
              aria-label={`Close ${currentFileName}`}
              className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle opacity-70 group-hover:opacity-100 transition-opacity ml-1 shrink-0"
            >
              <X size={16} />
            </button>
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cad-accent" />}
          </div>
        );
      })}

      <button
        type="button"
        data-testid="add-document-tab-btn"
        onClick={() => openPdfDialog()}
        title="Open PDF in new tab"
        aria-label="Open PDF in new tab"
        className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle mb-0.5 ml-0.5 shrink-0"
      >
        <Plus size={16} />
      </button>
    </div>
  );
};
