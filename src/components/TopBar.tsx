import React from 'react';
import {
  FolderOpen,
  Save,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Undo2,
  Redo2,
  MousePointer,
  Hand,
  Square,
  Minus,
  Cloud,
  Type,
  FileCheck,
  Circle,
  Hexagon,
  Pencil,
} from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore, ToolType } from '../store/useToolStore';
import { openPdfDialog } from '../services/fileDialogService';
import { useAutoSave } from '../hooks/useAutoSave';

export const TopBar: React.FC = () => {
  const {
    fileName,
    numPages,
    currentPageIndex,
    setCurrentPage,
    scale,
    zoomIn,
    zoomOut,
    resetZoom,
    rotateClockwise,
  } = useDocumentStore();

  const { canUndo, canRedo, undo, redo, isDirty } = useMarkupStore();
  const { activeTool, setActiveTool, currentStyle, setCurrentStyle } = useToolStore();
  const { saveNow } = useAutoSave();

  const handlePrevPage = () => {
    if (currentPageIndex > 0) setCurrentPage(currentPageIndex - 1);
  };

  const handleNextPage = () => {
    if (currentPageIndex < numPages - 1) setCurrentPage(currentPageIndex + 1);
  };

  const toolButtons: { type: ToolType; label: string; icon: React.ReactNode }[] = [
    { type: 'select', label: 'Seleccionar (V)', icon: <MousePointer size={16} /> },
    { type: 'pan', label: 'Mover lienzo (H)', icon: <Hand size={16} /> },
    { type: 'rectangle', label: 'Rectángulo (R)', icon: <Square size={16} /> },
    { type: 'circle', label: 'Círculo / Elipse (O)', icon: <Circle size={16} /> },
    { type: 'line', label: 'Línea (L)', icon: <Minus size={16} /> },
    { type: 'polygon', label: 'Polígono (P)', icon: <Hexagon size={16} /> },
    { type: 'freehand', label: 'Mano alzada (F)', icon: <Pencil size={16} /> },
    { type: 'cloud', label: 'Nube de revisión (C)', icon: <Cloud size={16} /> },
    { type: 'text', label: 'Nota / Texto (T)', icon: <Type size={16} /> },
  ];

  const colors = ['#e02424', '#0284c7', '#16a34a', '#d97706', '#9333ea', '#111827'];

  return (
    <header className="h-12 bg-cad-panel border-b border-cad-border flex items-center justify-between px-3 text-sm text-gray-200 select-none z-20">
      {/* Sección Izquierda: Archivo y Guardado */}
      <div className="flex items-center space-x-2">
        <button
          onClick={openPdfDialog}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-cad-subtle hover:bg-cad-hover text-white rounded border border-cad-border text-xs font-medium transition-colors"
          title="Abrir archivo PDF desde el disco"
        >
          <FolderOpen size={15} className="text-blue-400" />
          <span>Abrir PDF</span>
        </button>

        <button
          onClick={() => saveNow()}
          disabled={!isDirty}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
            isDirty
              ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 animate-pulse'
              : 'bg-cad-subtle/50 text-gray-400 border-cad-border cursor-not-allowed'
          }`}
          title={isDirty ? 'Guardar cambios en .bbx.json (Autoguardado en 30s)' : 'Sin cambios pendientes'}
        >
          <Save size={15} />
          <span>Guardar</span>
          {isDirty && <span className="w-2 h-2 rounded-full bg-amber-300"></span>}
        </button>

        {fileName && (
          <div className="flex items-center space-x-1.5 ml-2 pl-3 border-l border-cad-border text-xs text-gray-300 max-w-xs truncate">
            <FileCheck size={14} className="text-emerald-400 shrink-0" />
            <span className="truncate font-mono" title={fileName}>
              {fileName}
            </span>
          </div>
        )}
      </div>

      {/* Sección Central: Herramientas de Marcado */}
      <div className="flex items-center space-x-1 bg-cad-dark p-1 rounded border border-cad-border">
        {toolButtons.map((btn) => {
          const isActive = activeTool === btn.type;
          return (
            <button
              key={btn.type}
              onClick={() => setActiveTool(btn.type)}
              title={btn.label}
              className={`p-1.5 rounded transition-all flex items-center justify-center ${
                isActive
                  ? 'bg-cad-accent text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-cad-subtle'
              }`}
            >
              {btn.icon}
            </button>
          );
        })}

        {/* Selector de color de trazo */}
        <div className="h-4 w-px bg-cad-border mx-1" />
        <div className="flex items-center space-x-1 px-1">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setCurrentStyle({ strokeColor: c })}
              style={{ backgroundColor: c }}
              className={`w-4 h-4 rounded-full border ${
                currentStyle.strokeColor === c ? 'ring-2 ring-white scale-110' : 'border-gray-600'
              }`}
              title={`Color: ${c}`}
            />
          ))}
        </div>
      </div>

      {/* Sección Derecha: Zoom, Rotación, Undo/Redo y Paginación */}
      <div className="flex items-center space-x-2">
        {/* Undo / Redo */}
        <div className="flex items-center space-x-0.5 border-r border-cad-border pr-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Deshacer (Ctrl+Z)"
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Rehacer (Ctrl+Y)"
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400"
          >
            <Redo2 size={16} />
          </button>
        </div>

        {/* Paginación */}
        {numPages > 0 && (
          <div className="flex items-center space-x-1 text-xs border-r border-cad-border pr-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPageIndex <= 0}
              className="p-1 text-gray-300 hover:text-white disabled:opacity-30"
              title="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-mono px-1">
              {currentPageIndex + 1} / {numPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPageIndex >= numPages - 1}
              className="p-1 text-gray-300 hover:text-white disabled:opacity-30"
              title="Página siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center space-x-1 text-xs">
          <button
            onClick={zoomOut}
            className="p-1 text-gray-400 hover:text-white"
            title="Alejar (-)"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={resetZoom}
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-cad-subtle hover:bg-cad-hover"
            title="Restablecer zoom a 100%"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={zoomIn}
            className="p-1 text-gray-400 hover:text-white"
            title="Acercar (+)"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={rotateClockwise}
            className="p-1 text-gray-400 hover:text-white ml-1"
            title="Rotar 90°"
          >
            <RotateCw size={15} />
          </button>
        </div>
      </div>
    </header>
  );
};
