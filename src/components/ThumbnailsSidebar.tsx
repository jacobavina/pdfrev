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
      data-testid={`thumbnail-${pageIndex}`}
      onClick={onClick}
      className={`group cursor-pointer flex flex-col items-center p-2 rounded-lg transition-all ${
        isActive ? 'bg-cad-accent/10 ring-2 ring-cad-accent' : 'hover:bg-cad-hover ring-1 ring-transparent'
      }`}
    >
      <div className="bg-white rounded-md overflow-hidden sheet-shadow flex items-center justify-center min-h-[90px] w-full">
        <canvas ref={canvasRef} className="max-w-full h-auto block" />
      </div>
      <div className="flex items-center justify-between w-full mt-1.5 px-1">
        <span
          className={`text-xs font-medium ${
            isActive ? 'text-blue-400 font-bold' : 'text-gray-400 group-hover:text-gray-200'
          }`}
        >
          Page {pageIndex + 1}
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
            title="Rotate page 90°"
            className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle"
          >
            <RotateCw size={16} />
          </button>
          <button
            type="button"
            data-testid={`page-insert-btn-${pageIndex}`}
            onClick={async (e) => {
              e.stopPropagation();
              const { executeInsertBlankPage } = await import('../services/pageService');
              await executeInsertBlankPage(pageIndex + 1);
            }}
            title="Insert blank page after"
            className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle"
          >
            <PlusSquare size={16} />
          </button>
          <button
            type="button"
            data-testid={`page-extract-btn-${pageIndex}`}
            onClick={async (e) => {
              e.stopPropagation();
              const { executeExtractPage } = await import('../services/pageService');
              await executeExtractPage(pageIndex);
            }}
            title="Extract this page"
            className="p-0.5 rounded text-gray-400 hover:text-cad-strong hover:bg-cad-subtle"
          >
            <Download size={16} />
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
              title="Delete page"
              className="p-0.5 rounded text-gray-400 hover:text-red-400 hover:bg-cad-subtle"
            >
              <Trash2 size={16} />
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
      <div className="panel-header text-xs text-gray-300">
        {!isCollapsed && (
          <div className="flex items-center space-x-1.5">
            <Layers size={16} className="text-gray-400" />
            <span>Pages ({numPages})</span>
            <div className="flex items-center ml-2 space-x-1">
              <button
                type="button"
                data-testid="add-blank-page-btn"
                onClick={async () => {
                  const { executeInsertBlankPage } = await import('../services/pageService');
                  await executeInsertBlankPage(numPages);
                }}
                title="Add blank page at the end"
                className="p-1 hover:text-cad-strong rounded hover:bg-cad-subtle text-gray-400"
              >
                <PlusSquare size={16} />
              </button>
              <button
                type="button"
                data-testid="rotate-current-page-btn"
                onClick={async () => {
                  const { executeRotatePage } = await import('../services/pageService');
                  await executeRotatePage(currentPageIndex, 90);
                }}
                title="Rotate current page 90°"
                className="p-1 hover:text-cad-strong rounded hover:bg-cad-subtle text-gray-400"
              >
                <RotateCw size={16} />
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:text-cad-strong rounded hover:bg-cad-subtle ml-auto"
          title={isCollapsed ? 'Expand thumbnails panel' : 'Collapse panel'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Thumbnails List */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
