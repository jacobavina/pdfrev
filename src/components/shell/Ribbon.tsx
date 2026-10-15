import React from 'react';
import { Stamp as StampIcon, Link2, Paperclip } from 'lucide-react';
import { STAMPS, stampById } from '../../core/markup/stamps';
import { FIELD_TYPES, fieldTypeDef } from '../../core/markup/formFields';
import { fieldTypeIcon } from './fieldIcons';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useToolStore } from '../../store/useToolStore';
import { showToast } from '../../services/toastService';
import { TOOL_GROUPS, TEXT_LAYER_TOOLS, STROKE_COLORS, ToolDefinition } from './toolDefinitions';
import { dashArrayFor, lineStyleOfMarkup, LineStyleId } from '../../core/markup/lineStyles';
import { isPatternLineStyle } from '../../core/markup/linePatterns';
import { cloudParams, CLOUD_SIZE_FACTOR, DEFAULT_CLOUD_STEP } from '../../core/markup/revisionCloud';
import { CloudStylePicker } from './CloudStylePicker';
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
import { CAPTION_FAMILIES, markupFontOf, BOX_TEXT_COLOR } from '../../core/markup/measureCaption';
import { useMarkupStore } from '../../store/useMarkupStore';
import type { MarkupStyle } from '../../types/markup';

const STROKE_WIDTHS = [0.5, 1, 1.5, 2, 3, 5, 8];

/** Estilo de un botón de herramienta: activo con el acento en suave y un borde fino (ADR-0034). */
const TOOL_BUTTON = (active: boolean) =>
  active
    ? 'bg-cad-accent/15 text-cad-accent ring-1 ring-inset ring-cad-accent/50'
    : 'text-gray-300 hover:text-cad-strong hover:bg-cad-hover';
const OPACITIES = [1, 0.75, 0.5, 0.25];

/** Grupo de la cinta: contenido arriba y rótulo abajo, separado por una línea vertical. */
const RibbonGroup: React.FC<{ label: string; children: React.ReactNode; testId?: string }> = ({
  label,
  children,
  testId,
}) => (
  <div data-testid={testId} className="relative flex flex-col items-stretch px-3 shrink-0">
    <div className="flex-1 flex items-center">{children}</div>
    <div className="text-[9.5px] uppercase tracking-[0.08em] font-medium text-gray-500 text-center leading-none pb-1 pt-0.5 whitespace-nowrap">
      {label}
    </div>
    {/* Separador suave entre grupos */}
    <span className="absolute right-0 top-2 bottom-2 w-px bg-cad-border/70" aria-hidden="true" />
  </div>
);

/**
 * Cinta de herramientas (ADR-0017). Sustituye a la antigua barra plana de iconos: herramientas agrupadas por
 * tarea con rótulo, en dos filas compactas. Se desplaza horizontalmente por dentro si la ventana es estrecha,
 * sin ensanchar el diseño (ver test E2E de regresión de desborde).
 */
export const Ribbon: React.FC = () => {
  const { pdfBytes, pageHasText, currentPageIndex } = useDocumentStore();
  const {
    activeTool,
    setActiveTool,
    currentStyle,
    setCurrentStyle,
    activeStampId,
    setActiveStampId,
    activeFieldType,
    setActiveFieldType,
    cloudSize,
    cloudInvert,
    setCloudOptions,
  } = useToolStore();

  // Barra de propiedades contextual (ADR-0040), como la de Revu: con marcas seleccionadas edita la selección; sin
  // selección, el estilo de las marcas nuevas
  const { markups, selectedMarkupIds, applyPropertiesToMarkups, applyLineStyle } = useMarkupStore();
  const selection = markups.filter((m) => selectedMarkupIds.includes(m.id) && !m.locked);
  // Con una herramienta de dibujo activa, la barra define el estilo de lo que se va a dibujar (como Revu)
  const editingSelection = selection.length > 0 && (activeTool === 'select' || activeTool === 'pan');
  const style: MarkupStyle = editingSelection ? selection[0].style : currentStyle;
  const applyStyle = (patch: Partial<MarkupStyle>) => {
    if (editingSelection) applyPropertiesToMarkups(selection.map((m) => m.id), { style: patch }, 'Edit properties');
    else setCurrentStyle(patch);
  };
  const font = markupFontOf(editingSelection ? selection[0] : { style: currentStyle }, 10, BOX_TEXT_COLOR);
  const toggleFormat = (key: 'bold' | 'italic') => {
    if (!editingSelection) return;
    const next = { bold: key === 'bold' ? !font.bold : font.bold, italic: key === 'italic' ? !font.italic : font.italic };
    applyPropertiesToMarkups(selection.map((m) => m.id), { textFormat: next }, key === 'bold' ? 'Bold' : 'Italic');
  };

  // Tipo de línea (ADR-0041): el de la marca seleccionada; sin selección, el de las marcas nuevas (Cloud con la
  // herramienta de nube)
  // El callout dibuja flecha abierta si no se eligió otra (ADR-0042): la barra lo muestra así
  const calloutContext = editingSelection ? selection[0].type === 'callout' : activeTool === 'callout';
  const lineStyle: LineStyleId = editingSelection
    ? lineStyleOfMarkup(selection[0])
    : activeTool === 'cloud' || activeTool === 'cloudPlus'
    ? 'cloud'
    : lineStyleOfMarkup({ type: 'line', style: currentStyle });
  const pickLineStyle = (id: LineStyleId) => {
    if (editingSelection) {
      applyLineStyle(selection.map((m) => m.id), id);
      return;
    }
    const pattern = isPatternLineStyle(id);
    setCurrentStyle({ lineStyle: pattern ? id : undefined, dashArray: pattern ? undefined : dashArrayFor(id, style.strokeWidth ?? 1) });
  };
  // Tamaño e inversión de la nube: de la selección o de las nubes nuevas
  const selCloud = editingSelection ? cloudParams(selection[0].customFields, DEFAULT_CLOUD_STEP) : null;
  const cloudOpts = selCloud ? { size: selCloud.step / CLOUD_SIZE_FACTOR, invert: selCloud.invert } : { size: cloudSize, invert: cloudInvert };
  const changeCloud = (opts: { size?: number; invert?: boolean }) => {
    if (!editingSelection) {
      setCloudOptions(opts);
      return;
    }
    const ids = selection.map((m) => m.id);
    if (opts.size !== undefined) {
      applyPropertiesToMarkups(ids, { customFields: { arcStep: Math.round(opts.size * CLOUD_SIZE_FACTOR * 100) / 100 } }, `Set cloud size to ${opts.size}`);
    }
    if (opts.invert !== undefined) {
      applyPropertiesToMarkups(ids, { customFields: { cloudInvert: opts.invert ? 1 : undefined } }, opts.invert ? 'Invert cloud' : 'Cloud not inverted');
    }
  };
  const hasFill = Boolean(style.fillColor && style.fillColor !== 'transparent');
  // El patrón discontinuo es proporcional al grosor: se recalcula al cambiar de grosor
  const changeWidth = (w: number) => applyStyle({ strokeWidth: w, dashArray: dashArrayFor(lineStyle, w) });

  const selectTool = (tool: ToolDefinition) => {
    if (TEXT_LAYER_TOOLS.includes(tool.type) && pageHasText[currentPageIndex] === false) {
      showToast('This page has no selectable text layer. You can draw the markup manually.');
    }
    setActiveTool(tool.type);
  };

  return (
    <div
      data-testid="ribbon"
      className="h-[70px] min-w-0 bg-cad-ribbon border-b border-cad-border flex items-stretch overflow-x-auto overflow-y-hidden thin-scroll select-none z-20 px-1 shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)]"
    >
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
                  className={`w-[30px] h-[26px] rounded-md flex items-center justify-center transition-colors shrink-0 ${TOOL_BUTTON(isActive)}`}
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
            className={`h-[26px] px-2 rounded-md flex items-center gap-1 transition-colors disabled:opacity-40 ${TOOL_BUTTON(activeTool === 'stamp')}`}
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

      <RibbonGroup label="Link & Form" testId="ribbon-group-insert">
        <div className="flex flex-col gap-1">
          <div className="flex gap-0.5">
            {(
              [
                ['link', 'Hyperlink: drag the link area, then choose a web address or page', <Link2 key="l" size={16} />],
                ['fileAttachment', 'File Attachment: click to attach a file', <Paperclip key="p" size={16} />],
              ] as const
            ).map(([tool, title, icon]) => (
              <button
                key={tool}
                type="button"
                data-testid={`tool-${tool}`}
                aria-pressed={activeTool === tool}
                disabled={!pdfBytes}
                onClick={() => setActiveTool(tool)}
                title={title}
                className={`w-[30px] h-[26px] rounded-md flex items-center justify-center transition-colors disabled:opacity-40 ${TOOL_BUTTON(activeTool === tool)}`}
              >
                {icon}
              </button>
            ))}
            <button
              type="button"
              data-testid="tool-formField"
              aria-pressed={activeTool === 'formField'}
              disabled={!pdfBytes}
              onClick={() => setActiveTool('formField')}
              title={`Form field: ${fieldTypeDef(activeFieldType).label}`}
              className={`w-[30px] h-[26px] rounded-md flex items-center justify-center transition-colors disabled:opacity-40 ${TOOL_BUTTON(activeTool === 'formField')}`}
            >
              {fieldTypeIcon(activeFieldType, 16)}
            </button>
          </div>
          <IconPicker
            compact
            testId="ribbon-field-type"
            title="Form field type"
            value={activeFieldType}
            options={FIELD_TYPES.map((f) => ({ value: f.id, label: f.label }))}
            renderIcon={(id) => (
              <span className="flex items-center gap-1 text-[10px]">
                {fieldTypeIcon(id, 13)}
                <span className="whitespace-nowrap">{fieldTypeDef(id).label}</span>
              </span>
            )}
            onChange={(id) => {
              setActiveFieldType(id);
              setActiveTool('formField');
            }}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup
        label={editingSelection ? `Properties · ${selection.length} selected` : 'Style (new markups)'}
        testId="ribbon-group-style"
      >
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 items-center">
          {/* Fila 1: color de trazo y relleno */}
          <div className="flex items-center gap-1" title="Line color">
            <span className="text-[10px] text-gray-500 w-9">Line</span>
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => applyStyle({ strokeColor: c })}
                style={{ backgroundColor: c }}
                className={`w-4 h-4 rounded-full border ${
                  style.strokeColor === c
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
              onClick={() => applyStyle({ fillColor: 'transparent' })}
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
                  onClick={() => applyStyle({ fillColor: fill })}
                  style={{ backgroundColor: fill, borderColor: c }}
                  className={`w-4 h-4 rounded-full border ${
                    style.fillColor === fill ? 'ring-2 ring-cad-accent ring-offset-1 ring-offset-cad-ribbon' : ''
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
              value={style.strokeWidth ?? 2}
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
              withLabels
              renderIcon={(id) => <LineStylePreview id={id} width={52} />}
              onChange={pickLineStyle}
            />
            <CloudStylePicker
              size={cloudOpts.size}
              invert={cloudOpts.invert}
              disabled={lineStyle !== 'cloud'}
              onChange={changeCloud}
            />
            <IconPicker
              compact
              testId="ribbon-line-start"
              withLabels
              title="Start (lines, arrows, polylines and callouts)"
              value={style.lineEndingStart ?? (calloutContext ? 'openArrow' : 'none')}
              options={LINE_ENDING_OPTIONS}
              renderIcon={(id) => <LineEndingPreview ending={id} side="start" />}
              onChange={(id) => applyStyle({ lineEndingStart: id })}
            />
            <IconPicker
              compact
              testId="ribbon-line-end"
              withLabels
              title="End (the Arrow tool uses a closed arrow when None)"
              value={style.lineEndingEnd ?? 'none'}
              options={LINE_ENDING_OPTIONS}
              renderIcon={(id) => <LineEndingPreview ending={id} side="end" />}
              onChange={(id) => applyStyle({ lineEndingEnd: id })}
            />
            <IconPicker
              compact
              testId="ribbon-opacity"
              title="Opacity"
              value={style.opacity ?? 1}
              options={OPACITIES.map((o) => ({ value: o, label: `${Math.round(o * 100)}%` }))}
              renderIcon={(o) => <OpacityPreview opacity={o} color={style.strokeColor} />}
              onChange={(o) => applyStyle({ opacity: o })}
            />
          </div>
        </div>
      </RibbonGroup>

      {/* Texto (ADR-0040): fuente, tamaño, negrita, cursiva y color, como en la barra de propiedades de Revu */}
      <RibbonGroup label="Text" testId="ribbon-group-font">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <select
              data-testid="ribbon-font-family"
              value={font.family}
              onChange={(e) => applyStyle({ fontFamily: e.target.value })}
              className="ui-input !h-6 w-[96px] !text-[11px]"
              title="Font"
            >
              {CAPTION_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input
              type="number"
              data-testid="ribbon-font-size"
              min={6}
              max={72}
              value={font.size}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 6 && v <= 72) applyStyle({ fontSize: v });
              }}
              className="ui-input !h-6 w-[46px] !px-1.5 !text-[11px]"
              title="Font size (pt)"
            />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                ['bold', 'B', 'Bold', 'font-bold'],
                ['italic', 'I', 'Italic', 'italic font-serif'],
              ] as const
            ).map(([key, glyph, title, cls]) => (
              <button
                key={key}
                type="button"
                data-testid={`ribbon-font-${key}`}
                aria-pressed={font[key]}
                disabled={!editingSelection}
                onClick={() => toggleFormat(key)}
                title={editingSelection ? title : `${title} (select a markup first)`}
                className={`w-6 h-6 rounded-md text-[12px] ${cls} disabled:opacity-35 ${
                  font[key] ? 'bg-cad-accent/15 text-cad-accent ring-1 ring-inset ring-cad-accent/50' : 'text-gray-300 hover:bg-cad-hover'
                }`}
              >
                {glyph}
              </button>
            ))}
            <label className="flex items-center gap-1 text-[10px] text-gray-500" title="Text color">
              <span>A</span>
              <input
                type="color"
                data-testid="ribbon-text-color"
                value={font.color}
                onChange={(e) => applyStyle({ textColor: e.target.value })}
                className="ui-swatch !w-5 !h-5"
              />
            </label>
          </div>
        </div>
      </RibbonGroup>
    </div>
  );
};
