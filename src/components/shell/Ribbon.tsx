import React from 'react';
import { FolderOpen, Save, Download, Undo2, Redo2, Stamp as StampIcon } from 'lucide-react';
import { STAMPS, stampById } from '../../core/markup/stamps';
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
  OpacityPreview,
  StampPreview,
  LINE_STYLE_OPTIONS,
  LINE_ENDING_OPTIONS,
} from './IconPicker';
import { translucentFill } from '../../core/markup/typeLabels';

const STROKE_WIDTHS = [0.5, 1, 1.5, 2, 3, 5, 8];
const OPACITIES = [1, 0.75, 0.5, 0.25];

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
  const { activeTool, setActiveTool, currentStyle, setCurrentStyle, activeStampId, setActiveStampId } = useToolStore();
  const { saveNow } = useAutoSave(0);

  const lineStyle = lineStyleOf(currentStyle.dashArray);
  const hasFill = Boolean(currentStyle.fillColor && currentStyle.fillColor !== 'transparent');
  // El patrón discontinuo es proporcional al grosor: se recalcula al cambiar de grosor
  const changeWidth = (w: number) =>
    setCurrentStyle({ strokeWidth: w, dashArray: dashArrayFor(lineStyle, w) });

  const selectTool = (tool: ToolDefinition) => {
    if (TEXT_LAYER_TOOLS.includes(tool.type) && pageHasText[currentPageIndex] === false) {
      showToast('This page has no selectable text layer. You can draw the markup manually.');
    }
    setActiveTool(tool.type);
  };

  return (
    <div
      data-testid="ribbon"
      className="h-[66px] min-w-0 bg-cad-ribbon border-b border-cad-border flex items-stretch overflow-x-auto overflow-y-hidden select-none z-20"
    >
      <RibbonGroup label="File">
        <LargeButton
          icon={<FolderOpen size={20} className="text-cad-accent" />}
          label="Open"
          title="Open a PDF file from disk"
          onClick={openPdfDialog}
        />
        <LargeButton
          testId="save-button"
          icon={<Save size={20} />}
          label="Save"
          title={
            !filePath
              ? 'Demo mode (no autosave). Open a PDF to save.'
              : isDirty
              ? 'Save markups to the PDF (Ctrl+S). Autosave every 30 s only writes the .bbx.json recovery copy'
              : 'No pending changes'
          }
          onClick={() => saveNow()}
          disabled={!isDirty || !filePath}
          highlight={isDirty && Boolean(filePath)}
        />
        <LargeButton
          icon={<Download size={20} className="text-emerald-600 dark:text-emerald-400" />}
          label="Export"
          title="Export a vector PDF with flattened markups"
          onClick={exportFlattenedPdf}
          disabled={!pdfBytes}
        />
      </RibbonGroup>

      <RibbonGroup label="History">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-gray-200 hover:bg-cad-hover disabled:opacity-35"
          >
            <Undo2 size={15} /> Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-gray-200 hover:bg-cad-hover disabled:opacity-35"
          >
            <Redo2 size={15} /> Redo
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

      <RibbonGroup label="Stamp" testId="ribbon-group-stamp">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            data-testid="tool-stamp"
            aria-pressed={activeTool === 'stamp'}
            disabled={!pdfBytes}
            onClick={() => setActiveTool('stamp')}
            title={`Stamp: ${stampById(activeStampId).label} (click on the drawing to place it, drag to size it)`}
            className={`h-[24px] px-1.5 rounded flex items-center gap-1 transition-colors disabled:opacity-40 ${
              activeTool === 'stamp' ? 'bg-cad-accent text-white' : 'text-gray-300 hover:text-cad-strong hover:bg-cad-hover'
            }`}
          >
            <StampIcon size={16} />
          </button>
          <IconPicker
            compact
            testId="ribbon-stamp-picker"
            title="Stamp"
            value={activeStampId}
            options={STAMPS.map((st) => ({ value: st.id, label: st.label }))}
            renderIcon={(id) => <StampPreview id={id} />}
            onChange={(id) => {
              setActiveStampId(id);
              setActiveTool('stamp');
            }}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Style (new markups)" testId="ribbon-group-style">
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 items-center">
          {/* Fila 1: color de trazo y relleno */}
          <div className="flex items-center gap-1" title="Line color">
            <span className="text-[10px] text-gray-500 w-9">Line</span>
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
          <div className="flex items-center gap-1" title="Fill for closed shapes">
            <span className="text-[10px] text-gray-500 w-9">Fill</span>
            <button
              type="button"
              data-testid="ribbon-fill-none"
              onClick={() => setCurrentStyle({ fillColor: 'transparent' })}
              title="No fill"
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
                  title={`Translucent fill: ${c}`}
                />
              );
            })}
          </div>

          {/* Fila 2: grosor, tipo de línea, extremos y opacidad */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 col-span-2">
            <IconPicker
              compact
              testId="ribbon-stroke-width"
              title="Line width (pt)"
              value={currentStyle.strokeWidth ?? 2}
              options={STROKE_WIDTHS.map((w) => ({ value: w, label: `${w} pt` }))}
              renderIcon={(w) => <StrokeWidthPreview width={w} />}
              onChange={changeWidth}
            />
            <IconPicker
              compact
              testId="ribbon-line-style"
              title="Line style"
              value={lineStyle}
              options={LINE_STYLE_OPTIONS}
              renderIcon={(id) => <LineStylePreview id={id} />}
              onChange={(id) => setCurrentStyle({ dashArray: dashArrayFor(id, currentStyle.strokeWidth ?? 2) })}
            />
            <IconPicker
              compact
              testId="ribbon-line-start"
              title="Start (lines, arrows and polylines)"
              value={currentStyle.lineEndingStart ?? 'none'}
              options={LINE_ENDING_OPTIONS}
              renderIcon={(id) => <LineEndingPreview ending={id} side="start" />}
              onChange={(id) => setCurrentStyle({ lineEndingStart: id })}
            />
            <IconPicker
              compact
              testId="ribbon-line-end"
              title="End (the Arrow tool uses a closed arrow when None)"
              value={currentStyle.lineEndingEnd ?? 'none'}
              options={LINE_ENDING_OPTIONS}
              renderIcon={(id) => <LineEndingPreview ending={id} side="end" />}
              onChange={(id) => setCurrentStyle({ lineEndingEnd: id })}
            />
            <IconPicker
              compact
              testId="ribbon-opacity"
              title="Opacity"
              value={currentStyle.opacity ?? 1}
              options={OPACITIES.map((o) => ({ value: o, label: `${Math.round(o * 100)}%` }))}
              renderIcon={(o) => <OpacityPreview opacity={o} color={currentStyle.strokeColor} />}
              onChange={(o) => setCurrentStyle({ opacity: o })}
            />
          </div>
        </div>
      </RibbonGroup>
    </div>
  );
};
