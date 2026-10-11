import React from 'react';
import { FolderOpen, Save, Download, Undo2, Redo2 } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useToolStore } from '../../store/useToolStore';
import { openPdfDialog } from '../../services/fileDialogService';
import { showToast } from '../../services/toastService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { TOOL_GROUPS, TEXT_LAYER_TOOLS, STROKE_COLORS, ToolDefinition } from './toolDefinitions';
import { exportFlattenedPdf } from './appActions';

const STROKE_WIDTHS = [1, 2, 3, 5, 8];

/** Grupo de la cinta: contenido arriba y rótulo abajo, separado por una línea vertical. */
const RibbonGroup: React.FC<{ label: string; children: React.ReactNode; testId?: string }> = ({
  label,
  children,
  testId,
}) => (
  <div data-testid={testId} className="flex flex-col items-stretch px-2 border-r border-cad-border shrink-0">
    <div className="flex-1 flex items-center">{children}</div>
    <div className="text-[10px] text-gray-500 text-center leading-none pb-1 pt-0.5 whitespace-nowrap">{label}</div>
  </div>
);

/** Botón grande con icono y texto (acciones de archivo). */
const LargeButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  highlight?: boolean;
}> = ({ icon, label, title, onClick, disabled, testId, highlight }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex flex-col items-center justify-center w-[58px] h-[46px] rounded gap-0.5 text-[11px] transition-colors disabled:opacity-40 ${
      highlight ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/50' : 'text-gray-200 hover:bg-cad-hover'
    }`}
  >
    {icon}
    <span className="leading-none">{label}</span>
  </button>
);

/**
 * Cinta de herramientas (ADR-0017). Sustituye a la antigua barra plana de iconos: herramientas agrupadas por
 * tarea con rótulo, en dos filas compactas. Se desplaza horizontalmente por dentro si la ventana es estrecha,
 * sin ensanchar el diseño (ver test E2E de regresión de desborde).
 */
export const Ribbon: React.FC = () => {
  const { filePath, pdfBytes, pageHasText, currentPageIndex } = useDocumentStore();
  const { canUndo, canRedo, undo, redo, isDirty } = useMarkupStore();
  const { activeTool, setActiveTool, currentStyle, setCurrentStyle } = useToolStore();
  const { saveNow } = useAutoSave(0);

  const selectTool = (tool: ToolDefinition) => {
    if (TEXT_LAYER_TOOLS.includes(tool.type) && pageHasText[currentPageIndex] === false) {
      showToast('Esta página no contiene capa de texto seleccionable. Puede trazar la marca manualmente.');
    }
    setActiveTool(tool.type);
  };

  return (
    <div
      data-testid="ribbon"
      className="h-[66px] min-w-0 bg-cad-ribbon border-b border-cad-border flex items-stretch overflow-x-auto overflow-y-hidden select-none z-20"
    >
      <RibbonGroup label="Archivo">
        <LargeButton
          icon={<FolderOpen size={20} className="text-cad-accent" />}
          label="Abrir"
          title="Abrir archivo PDF desde el disco"
          onClick={openPdfDialog}
        />
        <LargeButton
          testId="save-button"
          icon={<Save size={20} />}
          label="Guardar"
          title={
            !filePath
              ? 'Modo demostración (sin autoguardado). Abra un PDF para guardar.'
              : isDirty
              ? 'Guardar las marcas en el PDF (Ctrl+S). El autoguardado cada 30 s solo escribe la copia de recuperación .bbx.json'
              : 'Sin cambios pendientes'
          }
          onClick={() => saveNow()}
          disabled={!isDirty || !filePath}
          highlight={isDirty && Boolean(filePath)}
        />
        <LargeButton
          icon={<Download size={20} className="text-emerald-600 dark:text-emerald-400" />}
          label="Exportar"
          title="Exportar PDF vectorial con anotaciones incrustadas (H1)"
          onClick={exportFlattenedPdf}
          disabled={!pdfBytes}
        />
      </RibbonGroup>

      <RibbonGroup label="Historial">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Deshacer (Ctrl+Z)"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-gray-200 hover:bg-cad-hover disabled:opacity-35"
          >
            <Undo2 size={15} /> Deshacer
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Rehacer (Ctrl+Y)"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-gray-200 hover:bg-cad-hover disabled:opacity-35"
          >
            <Redo2 size={15} /> Rehacer
          </button>
        </div>
      </RibbonGroup>

      {TOOL_GROUPS.map((group) => (
        <RibbonGroup key={group.id} label={group.label} testId={`ribbon-group-${group.id}`}>
          <div className="grid grid-rows-2 grid-flow-col gap-0.5">
            {group.tools.map((tool) => {
              const isActive = activeTool === tool.type;
              return (
                <button
                  key={tool.type}
                  type="button"
                  data-testid={tool.testId || `tool-${tool.type}`}
                  onClick={() => selectTool(tool)}
                  title={tool.label}
                  aria-pressed={isActive}
                  className={`w-[26px] h-[24px] rounded flex items-center justify-center transition-colors shrink-0 ${
                    isActive
                      ? 'bg-cad-accent text-white shadow-sm'
                      : 'text-gray-300 hover:text-cad-strong hover:bg-cad-hover'
                  }`}
                >
                  {tool.icon}
                </button>
              );
            })}
          </div>
        </RibbonGroup>
      ))}

      <RibbonGroup label="Estilo" testId="ribbon-group-style">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrentStyle({ strokeColor: c })}
                style={{ backgroundColor: c }}
                className={`w-4 h-4 rounded-full border ${
                  currentStyle.strokeColor === c
                    ? 'ring-2 ring-cad-accent ring-offset-1 ring-offset-cad-ribbon'
                    : 'border-gray-600'
                }`}
                title={`Color: ${c}`}
              />
            ))}
          </div>
          <label className="flex items-center gap-1 text-[11px] text-gray-400">
            Grosor
            <select
              data-testid="ribbon-stroke-width"
              value={currentStyle.strokeWidth ?? 2}
              onChange={(e) => setCurrentStyle({ strokeWidth: Number(e.target.value) })}
              className="bg-cad-panel border border-cad-border rounded px-1 py-0 text-[11px] text-gray-200"
            >
              {STROKE_WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w} pt
                </option>
              ))}
            </select>
          </label>
        </div>
      </RibbonGroup>
    </div>
  );
};
