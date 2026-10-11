import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useDocumentStore } from '../store/useDocumentStore';
import { renderThumbnail } from '../services/pdfService';
import { ChevronLeft, ChevronRight, Layers, RotateCw, Trash2, PlusSquare, Download } from 'lucide-react';

interface ThumbnailItemProps {
  pageIndex: number;
  isActive: boolean;
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  totalNumPages: number;
  onClick: () => void;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
  pageIndex,
  isActive,
  pdfDoc,
  totalNumPages,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function generateThumb() {
      if (!canvasRef.current || !pdfDoc) return;
      try {
        if (!isCancelled && canvasRef.current) {
          await renderThumbnail(pdfDoc, pageIndex, canvasRef.current, 130);
        }
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          (err as { name: string }).name === 'RenderingCancelledException'
        ) {
          return;
        }
        console.error(`Error renderizando thumbnail ${pageIndex}:`, err);
      }
    }

    generateThumb();

    return () => {
      isCancelled = true;
    };
  }, [pageIndex, pdfDoc]);

  return (
    <div
      onClick={onClick}
      className={`group cursor-pointer flex flex-col items-center p-2 rounded transition-all ${
        isActive
          ? 'bg-cad-accent/20 border-2 border-cad-accent shadow'
          : 'hover:bg-cad-hover border-2 border-transparent'
      }`}
    >
      <div className="bg-white rounded overflow-hidden shadow-sm flex items-center justify-center min-h-[90px] w-full">
        <canvas ref={canvasRef} className="max-w-full h-auto block" />
      </div>
      <div className="flex items-center justify-between w-full mt-1.5 px-1">
        <span
          className={`text-xs font-mono font-medium ${
            isActive ? 'text-blue-400 font-bold' : 'text-gray-400 group-hover:text-gray-200'
          }`}
        >
          Pág. {pageIndex + 1}
        </span>
        <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            data-testid={`page-rotate-btn-${pageIndex}`}
            onClick={async (e) => {
              e.stopPropagation();
              const { executeRotatePage } = await import('../services/pageService');
              await executeRotatePage(pageIndex, 90);
            }}
            title="Rotar página 90°"
            className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-cad-subtle"
          >
            <RotateCw size={12} />
          </button>
          <button
            type="button"
            data-testid={`page-insert-btn-${pageIndex}`}
            onClick={async (e) => {
              e.stopPropagation();
              const { executeInsertBlankPage } = await import('../services/pageService');
              await executeInsertBlankPage(pageIndex + 1);
            }}
            title="Insertar página en blanco después"
            className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-cad-subtle"
          >
            <PlusSquare size={12} />
          </button>
          <button
            type="button"
            data-testid={`page-extract-btn-${pageIndex}`}
            onClick={async (e) => {
              e.stopPropagation();
              const { executeExtractPage } = await import('../services/pageService');
              await executeExtractPage(pageIndex);
            }}
            title="Extraer esta página"
            className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-cad-subtle"
          >
            <Download size={12} />
          </button>
          {totalNumPages > 1 && (
            <button
              type="button"
              data-testid={`page-delete-btn-${pageIndex}`}
              onClick={async (e) => {
                e.stopPropagation();
                const { executeDeletePage } = await import('../services/pageService');
                await executeDeletePage(pageIndex);
              }}
              title="Eliminar página"
              className="p-0.5 rounded text-gray-400 hover:text-red-400 hover:bg-cad-subtle"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ThumbnailsSidebar: React.FC = () => {
  const { numPages, currentPageIndex, setCurrentPage, pdfDoc } = useDocumentStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!pdfDoc || numPages === 0) {
    return null;
  }

  return (
    <aside
      className={`bg-cad-panel border-r border-cad-border flex flex-col transition-all duration-200 relative select-none ${
        isCollapsed ? 'w-10' : 'w-48'
      }`}
    >
      {/* Sidebar Header */}
      <div className="h-9 px-3 border-b border-cad-border flex items-center justify-between text-xs text-gray-400 font-medium">
        {!isCollapsed && (
          <div className="flex items-center space-x-1.5">
            <Layers size={14} className="text-gray-400" />
            <span>Páginas ({numPages})</span>
            <div className="flex items-center ml-2 space-x-1">
              <button
                type="button"
                data-testid="add-blank-page-btn"
                onClick={async () => {
                  const { executeInsertBlankPage } = await import('../services/pageService');
                  await executeInsertBlankPage(numPages);
                }}
                title="Añadir página en blanco al final"
                className="p-1 hover:text-white rounded hover:bg-cad-subtle text-gray-400"
              >
                <PlusSquare size={13} />
              </button>
              <button
                type="button"
                data-testid="rotate-current-page-btn"
                onClick={async () => {
                  const { executeRotatePage } = await import('../services/pageService');
                  await executeRotatePage(currentPageIndex, 90);
                }}
                title="Rotar página activa 90°"
                className="p-1 hover:text-white rounded hover:bg-cad-subtle text-gray-400"
              >
                <RotateCw size={13} />
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:text-white rounded hover:bg-cad-subtle ml-auto"
          title={isCollapsed ? 'Expandir panel de páginas' : 'Colapsar panel'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Thumbnails List */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {Array.from({ length: numPages }).map((_, index) => (
            <ThumbnailItem
              key={index}
              pageIndex={index}
              isActive={currentPageIndex === index}
              pdfDoc={pdfDoc}
              totalNumPages={numPages}
              onClick={() => setCurrentPage(index)}
            />
          ))}
        </div>
      )}
    </aside>
  );
};
