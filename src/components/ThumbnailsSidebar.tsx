import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useDocumentStore } from '../store/useDocumentStore';
import { renderThumbnail } from '../services/pdfService';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';

interface ThumbnailItemProps {
  pageIndex: number;
  isActive: boolean;
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  onClick: () => void;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
  pageIndex,
  isActive,
  pdfDoc,
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
      } catch (err) {
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
      <span
        className={`mt-1.5 text-xs font-mono font-medium ${
          isActive ? 'text-blue-400 font-bold' : 'text-gray-400 group-hover:text-gray-200'
        }`}
      >
        Pág. {pageIndex + 1}
      </span>
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
              onClick={() => setCurrentPage(index)}
            />
          ))}
        </div>
      )}
    </aside>
  );
};
