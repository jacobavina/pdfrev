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
  Download,
  AlertTriangle,
  X,
  MessageSquare,
  MessageSquareText,
  StickyNote,
  Highlighter,
  TextSelect,
  Ruler,
  Hash,
  Scale,
  Search,
} from 'lucide-react';
import { useDocumentStore } from '../store/useDocumentStore';
import { useMarkupStore } from '../store/useMarkupStore';
import { useToolStore, ToolType } from '../store/useToolStore';
import { useSearchStore } from '../store/useSearchStore';
import { openPdfDialog } from '../services/fileDialogService';
import { useAutoSave } from '../hooks/useAutoSave';
import { setBbxErrorHandler } from '../services/bbxPersistenceService';
import { registerToastListener, showToast } from '../services/toastService';

export const TopBar: React.FC = () => {
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsubToast = registerToastListener((msg) => {
      setToastMessage(msg);
    });
    setBbxErrorHandler((msg) => {
      setToastMessage(msg);
    });
    return () => {
      unsubToast();
      setBbxErrorHandler(null);
    };
  }, []);
  const {
    filePath,
    pdfBytes,
    fileName,
    numPages,
    currentPageIndex,
    setCurrentPage,
    scale,
    pageHasText,
    zoomIn,
    zoomOut,
    resetZoom,
    rotateClockwise,
  } = useDocumentStore();

  const { markups, canUndo, canRedo, undo, redo, isDirty } = useMarkupStore();
  const { activeTool, setActiveTool, currentStyle, setCurrentStyle } = useToolStore();
  const { saveNow } = useAutoSave();

  const handleExportPdf = async () => {
    if (!pdfBytes) {
      alert('No hay ningún documento PDF cargado para exportar.');
      return;
    }
    try {
      const { exportMarkupsToPdf } = await import('../services/pdfExportService');
      const result = await exportMarkupsToPdf(pdfBytes, markups);
      const blob = new Blob([result.pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'documento';
      a.download = `${baseName}_con_marcas.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (result.warnings.replacedCharactersCount > 0) {
        console.warn(
          `[Export PDF] ${result.warnings.replacedCharactersCount} caracteres no compatibles con WinAnsi fueron sustituidos por '?'`
        );
      }
    } catch (err) {
      console.error('Error al exportar PDF con marcas:', err);
      alert('Error al exportar PDF con marcas: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) setCurrentPage(currentPageIndex - 1);
  };

  const handleNextPage = () => {
    if (currentPageIndex < numPages - 1) setCurrentPage(currentPageIndex + 1);
  };

  const toolButtons: { type: ToolType; label: string; icon: React.ReactNode; testId?: string }[] = [
    { type: 'select', label: 'Seleccionar (V)', icon: <MousePointer size={16} /> },
    { type: 'pan', label: 'Mover lienzo (Espacio)', icon: <Hand size={16} /> },
    { type: 'rectangle', label: 'Rectángulo (R)', icon: <Square size={16} /> },
    { type: 'circle', label: 'Círculo / Elipse (O)', icon: <Circle size={16} /> },
    { type: 'line', label: 'Línea (L)', icon: <Minus size={16} /> },
    {
      type: 'polyLine',
      label: 'Polilínea abierta',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 18 10 7 15 14 20 6" />
        </svg>
      ),
    },
    { type: 'polygon', label: 'Polígono (P)', icon: <Hexagon size={16} /> },
    { type: 'freehand', label: 'Mano alzada (F)', icon: <Pencil size={16} /> },
    { type: 'highlightVector', label: 'Resaltador vectorial (H)', icon: <Highlighter size={16} /> },
    { type: 'highlightText', label: 'Resaltador de texto (Shift+H)', icon: <TextSelect size={16} /> },
    {
      type: 'underline',
      label: 'Subrayado de texto',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4v6a6 6 0 0 0 12 0V4" />
          <line x1="4" y1="20" x2="20" y2="20" />
        </svg>
      ),
    },
    {
      type: 'strikeOut',
      label: 'Tachado de texto',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 4H9a3 3 0 0 0-2.83 4" />
          <path d="M14 12a4 4 0 0 1 0 8H6" />
          <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      ),
    },
    { type: 'cloud', label: 'Nube de revisión (C)', icon: <Cloud size={16} /> },
    { type: 'cloudPlus', label: 'Cloud+ con leyenda (K)', icon: <MessageSquare size={16} /> },
    { type: 'callout', label: 'Nota técnica con directriz (Q)', icon: <MessageSquareText size={16} /> },
    { type: 'stickyNote', label: 'Nota adhesiva (N)', icon: <StickyNote size={16} /> },
    { type: 'text', label: 'Nota / Texto (T)', icon: <Type size={16} /> },
    {
      type: 'calibrate',
      label: 'Calibrar escala por página',
      icon: <Scale size={16} />,
      testId: 'tool-calibrate',
    },
    {
      type: 'length',
      label: 'Medición de longitud',
      icon: <Ruler size={16} />,
      testId: 'tool-measure-length',
    },
    {
      type: 'polylineMeasure',
      label: 'Medición de polilínea',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 17 9 11 13 15 21 7" />
          <path d="M18 7h3v3" />
        </svg>
      ),
      testId: 'tool-measure-polyline',
    },
    {
      type: 'area',
      label: 'Medición de área',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" strokeDasharray="2 2" />
          <path d="M9 3v18" strokeDasharray="2 2" />
        </svg>
      ),
      testId: 'tool-measure-area',
    },
    {
      type: 'count',
      label: 'Conteo de elementos',
      icon: <Hash size={16} />,
      testId: 'tool-measure-count',
    },
  ];

  const colors = ['#e02424', '#0284c7', '#16a34a', '#d97706', '#9333ea', '#111827'];

  return (
    <header className="h-12 min-w-0 gap-2 bg-cad-panel border-b border-cad-border flex items-center justify-between px-3 text-sm text-gray-200 select-none z-20">
      {/* Sección Izquierda: Archivo y Guardado */}
      <div className="flex items-center space-x-2 shrink-0">
        <button
          onClick={openPdfDialog}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-cad-subtle hover:bg-cad-hover text-white rounded border border-cad-border text-xs font-medium transition-colors"
          title="Abrir archivo PDF desde el disco"
        >
          <FolderOpen size={15} className="text-blue-400" />
          <span>Abrir PDF</span>
        </button>

        <button
          data-testid="save-button"
          onClick={() => saveNow()}
          disabled={!isDirty || !filePath}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
            isDirty && filePath
              ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500 animate-pulse'
              : 'bg-cad-subtle/50 text-gray-400 border-cad-border cursor-not-allowed'
          }`}
          title={
            !filePath
              ? 'Modo demostración (sin autoguardado). Abra un PDF para guardar.'
              : isDirty
              ? 'Guardar las marcas en el PDF (Ctrl+S). El autoguardado cada 30 s solo escribe la copia de recuperación .bbx.json'
              : 'Sin cambios pendientes'
          }
        >
          <Save size={15} />
          <span>Guardar</span>
          {isDirty && filePath && <span className="w-2 h-2 rounded-full bg-amber-300"></span>}
        </button>

        <button
          onClick={handleExportPdf}
          disabled={!pdfBytes}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
            pdfBytes
              ? 'bg-cad-subtle hover:bg-cad-hover text-white border-cad-border'
              : 'bg-cad-subtle/50 text-gray-500 border-cad-border cursor-not-allowed'
          }`}
          title="Exportar PDF vectorial con anotaciones incrustadas (H1)"
        >
          <Download size={15} className={pdfBytes ? 'text-emerald-400' : 'text-gray-500'} />
          <span>Exportar PDF</span>
        </button>

        {fileName && (
          <div className="flex items-center space-x-1.5 ml-2 pl-3 border-l border-cad-border text-xs text-gray-300 max-w-[14rem] truncate">
            <FileCheck size={14} className="text-emerald-400 shrink-0" />
            <span className="truncate font-mono" title={fileName}>
              {fileName}
            </span>
            {!filePath && (
              <span className="text-[11px] text-amber-400 font-sans shrink-0 ml-1">
                (Demostración - sin autoguardado)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sección Central: Herramientas de Marcado */}
      <div data-testid="toolbar-tools" className="flex items-center space-x-1 bg-cad-dark p-1 rounded border border-cad-border min-w-0 flex-1 overflow-x-auto">
        {toolButtons.map((btn) => {
          const isActive = activeTool === btn.type;
          return (
            <button
              key={btn.type}
              data-testid={btn.testId || `tool-${btn.type}`}
              onClick={() => {
                if (
                  (btn.type === 'highlightText' ||
                    btn.type === 'underline' ||
                    btn.type === 'strikeOut') &&
                  pageHasText[currentPageIndex] === false
                ) {
                  showToast(
                    'Esta página no contiene capa de texto seleccionable. Puede trazar la marca manualmente.'
                  );
                }
                setActiveTool(btn.type);
              }}
              title={btn.label}
              className={`p-1.5 rounded transition-all flex items-center justify-center shrink-0 ${
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
        <div className="flex items-center space-x-1 px-1 shrink-0">
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
      <div className="flex items-center space-x-2 shrink-0">
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
          <button
            type="button"
            data-testid="search-toggle-btn"
            onClick={() => useSearchStore.getState().setIsOpen(true)}
            className="p-1 text-gray-300 hover:text-white hover:bg-cad-subtle rounded transition-colors ml-1 border-l border-cad-border pl-2"
            title="Buscar texto en plano (Ctrl+F)"
          >
            <Search size={15} />
          </button>
        </div>
      </div>

      {toastMessage && (
        <div
          role="alert"
          className="fixed top-14 right-4 z-50 flex items-center space-x-2 bg-red-900/95 border border-red-500 text-red-100 px-3.5 py-2.5 rounded shadow-2xl text-xs backdrop-blur-sm"
        >
          <AlertTriangle size={15} className="text-red-400 shrink-0" />
          <span className="max-w-sm">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 hover:text-white text-red-300 rounded ml-2"
            title="Cerrar aviso"
            aria-label="Cerrar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
};
