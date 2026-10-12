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
import { dashArrayFor, lineStyleOf } from '../../core/markup/lineStyles';
import {
  IconPicker,
  LineStylePreview,
  LineEndingPreview,
  StrokeWidthPreview,
  LINE_STYLE_OPTIONS,
  LINE_ENDING_OPTIONS,
} from './IconPicker';
import { translucentFill } from '../../core/markup/typeLabels';

const STROKE_WIDTHS = [0.5, 1, 1.5, 2, 3, 5, 8];
const OPACITIES = [1, 0.75, 0.5, 0.25];
const selectClass =
  'bg-cad-panel border border-cad-border rounded px-1 py-0 text-[11px] text-gray-200 focus:outline-none focus:border-cad-accent';

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

  const lineStyle = lineStyleOf(currentStyle.dashArray);
  const hasFill = Boolean(currentStyle.fillColor && currentStyle.fillColor !== 'transparent');
  // El patrón discontinuo es proporcional al grosor: se recalcula al cambiar de grosor
  const changeWidth = (w: number) =>
    setCurrentStyle({ strokeWidth: w, dashArray: dashArrayFor(lineStyle, w) });

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

      <RibbonGroup label="Estilo (marcas nuevas)" testId="ribbon-group-style">
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 items-center">
          {/* Fila 1: color de trazo y relleno */}
          <div className="flex items-center gap-1" title="Color de trazo">
            <span className="text-[10px] text-gray-500 w-9">Trazo</span>
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
          <div className="flex items-center gap-1" title="Relleno de las formas cerradas">
            <span className="text-[10px] text-gray-500 w-9">Relleno</span>
            <button
              type="button"
              data-testid="ribbon-fill-none"
              onClick={() => setCurrentStyle({ fillColor: 'transparent' })}
              title="Sin relleno"
              className={`w-4 h-4 rounded-full border border-gray-500 bg-cad-ribbon relative overflow-hidden ${
                !hasFill ? 'ring-2 ring-cad-accent ring-offset-1 ring-offset-cad-ribbon' : ''
              }`}
            >
              <span className="absolute inset-0 m-auto w-[140%] h-px bg-rose-500 rotate-45 -translate-x-[15%]" />
            </button>
            {STROKE_COLORS.map((c) => {
              const fill = translucentFill(c, 0.25);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrentStyle({ fillColor: fill })}
                  style={{ backgroundColor: fill, borderColor: c }}
                  className={`w-4 h-4 rounded-full border ${
                    currentStyle.fillColor === fill ? 'ring-2 ring-cad-accent ring-offset-1 ring-offset-cad-ribbon' : ''
                  }`}
                  title={`Relleno translúcido: ${c}`}
                />
              );
            })}
          </div>

          {/* Fila 2: grosor, tipo de línea, extremos y opacidad */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 col-span-2">
            <IconPicker
              compact
              testId="ribbon-stroke-width"
              title="Grosor de línea (pt)"
              value={currentStyle.strokeWidth ?? 2}
              options={STROKE_WIDTHS.map((w) => ({ value: w, label: `${w} pt` }))}
              renderIcon={(w) => <StrokeWidthPreview width={w} />}
              onChange={changeWidth}
            />
            <IconPicker
              compact
              testId="ribbon-line-style"
              title="Tipo de línea"
              value={lineStyle}
              options={LINE_STYLE_OPTIONS}
              renderIcon={(id) => <LineStylePreview id={id} />}
              onChange={(id) => setCurrentStyle({ dashArray: dashArrayFor(id, currentStyle.strokeWidth ?? 2) })}
            />
            <IconPicker
              compact
              testId="ribbon-line-start"
              title="Extremo inicial (líneas, flechas y polilíneas)"
              value={currentStyle.lineEndingStart ?? 'none'}
              options={LINE_ENDING_OPTIONS}
              renderIcon={(id) => <LineEndingPreview ending={id} side="start" />}
              onChange={(id) => setCurrentStyle({ lineEndingStart: id })}
            />
            <IconPicker
              compact
              testId="ribbon-line-end"
              title="Extremo final (la herramienta Flecha usa flecha cerrada si es Ninguno)"
              value={currentStyle.lineEndingEnd ?? 'none'}
              options={LINE_ENDING_OPTIONS}
              renderIcon={(id) => <LineEndingPreview ending={id} side="end" />}
              onChange={(id) => setCurrentStyle({ lineEndingEnd: id })}
            />
            <select
              data-testid="ribbon-opacity"
              value={currentStyle.opacity ?? 1}
              onChange={(e) => setCurrentStyle({ opacity: Number(e.target.value) })}
              className={selectClass}
              title="Opacidad"
            >
              {OPACITIES.map((o) => (
                <option key={o} value={o}>
                  {Math.round(o * 100)} %
                </option>
              ))}
            </select>
          </div>
        </div>
      </RibbonGroup>
    </div>
  );
};
