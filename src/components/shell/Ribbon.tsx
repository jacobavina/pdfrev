import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Stamp as StampIcon, Link2, Paperclip } from 'lucide-react';
import { stampById } from '../../core/markup/stamps';
import { FIELD_TYPES, fieldTypeDef } from '../../core/markup/formFields';
import { fieldTypeIcon } from './fieldIcons';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useToolStore, ToolType } from '../../store/useToolStore';
import { showToast } from '../../services/toastService';
import { TOOL_GROUPS, TEXT_LAYER_TOOLS, STROKE_COLORS, ToolDefinition } from './toolDefinitions';
import { dashArrayFor, lineStyleOfMarkup, LineStyleId } from '../../core/markup/lineStyles';
import { isPatternLineStyle } from '../../core/markup/linePatterns';
import { cloudParams, CLOUD_SIZE_FACTOR, DEFAULT_CLOUD_STEP } from '../../core/markup/revisionCloud';
import { CloudStylePicker } from './CloudStylePicker';
import { HatchPreview, HATCH_OPTIONS, HatchOption } from './HatchPreview';
import { CountSymbolPreview, COUNT_SYMBOL_OPTIONS } from './CountPreview';
import { isAutosizeText } from '../../core/markup/autosizeText';
import { clampCountScale, countItems, countScaleOf, countSymbolOf, CountSymbolId } from '../../core/markup/countSymbols';
import { calloutBoxPaint } from '../../core/markup/calloutLayout';
import {
  IconPicker,
  LineStylePreview,
  LineEndingPreview,
  StrokeWidthPreview,
  OpacityPreview,
  LINE_STYLE_OPTIONS,
  LINE_ENDING_OPTIONS,
} from './IconPicker';
import { translucentFill } from '../../core/markup/typeLabels';
import { CAPTION_FAMILIES, markupFontOf, BOX_TEXT_COLOR } from '../../core/markup/measureCaption';
import { useMarkupStore } from '../../store/useMarkupStore';
import type { MarkupStyle } from '../../types/markup';

const STROKE_WIDTHS = [0.5, 1, 1.5, 2, 3, 5, 8];

const OPACITIES = [1, 0.75, 0.5, 0.25];

// Selector de sellos con sus miniaturas: solo se carga al abrir la pestaña Insert (presupuesto del bundle, ADR-0045)
const StampPicker = lazy(() => import('./StampPicker').then((m) => ({ default: m.StampPicker })));

/** Pestañas de la cinta (ADR-0044), como las de Revu: cada una agrupa las herramientas de una tarea. */
type RibbonTabId = 'markup' | 'measure' | 'insert';
const RIBBON_TABS: { id: RibbonTabId; label: string }[] = [
  { id: 'markup', label: 'Markup' },
  { id: 'measure', label: 'Measure' },
  { id: 'insert', label: 'Insert' },
];
const INSERT_TOOLS: ToolType[] = ['stamp', 'link', 'fileAttachment', 'formField'];

/** Pestaña en la que está una herramienta (Select y Pan están siempre a la vista). */
function tabOfTool(tool: ToolType): RibbonTabId | null {
  if (INSERT_TOOLS.includes(tool)) return 'insert';
  const group = TOOL_GROUPS.find((g) => g.tools.some((t) => t.type === tool));
  if (!group || group.id === 'select') return null;
  return group.id === 'measure' ? 'measure' : 'markup';
}

/** Grupo de la cinta: herramientas arriba y rótulo abajo (ADR-0044). */
const RibbonGroup: React.FC<{ label: string; children: React.ReactNode; testId?: string }> = ({
  label,
  children,
  testId,
}) => (
  <section data-testid={testId} className="ribbon-group">
    <div className="flex-1 flex items-center gap-0.5">{children}</div>
    <div className="ribbon-group-label">{label}</div>
  </section>
);

/** Herramienta: icono sobre su nombre, como en Revu (ADR-0044). */
const ToolButton: React.FC<{
  testId: string;
  title: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ testId, title, label, icon, active, disabled, onClick }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    title={title}
    aria-pressed={active}
    disabled={disabled}
    className="ribbon-tool"
  >
    {icon}
    <span className="ribbon-tool-label">{label}</span>
  </button>
);

/**
 * Cinta de herramientas (ADR-0017). Sustituye a la antigua barra plana de iconos: herramientas agrupadas por
 * tarea con rótulo, en dos filas compactas. Se desplaza horizontalmente por dentro si la ventana es estrecha,
 * sin ensanchar el diseño (ver test E2E de regresión de desborde).
 */
/** Icono de Autosize Text (ADR-0061): una A con flechas hacia las esquinas, como el botón de Revu. */
const AutosizeTextIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden="true">
    <path d="M5.5 11.5 8 4.5l2.5 7M6.4 9.2h3.2" strokeLinejoin="round" />
    <path d="M1.5 4.5v-3h3M11.5 1.5h3v3M14.5 11.5v3h-3M4.5 14.5h-3v-3" />
  </svg>
);

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
    calloutBorder,
    setCalloutBorder,
    countSymbol,
    countScale,
    activeCountId,
    autoSizeText,
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
  // Borde de la caja del callout, aparte del relleno (ADR-0042)
  const boxBorder = editingSelection
    ? calloutBoxPaint(selection[0]).border
    : calloutBorder ?? Boolean(style.fillColor && style.fillColor !== 'transparent');
  const toggleBoxBorder = () => {
    if (!editingSelection) {
      setCalloutBorder(!boxBorder);
      return;
    }
    const ids = selection.filter((m) => m.type === 'callout').map((m) => m.id);
    applyPropertiesToMarkups(ids, { customFields: { calloutBorder: boxBorder ? 0 : 1 } }, boxBorder ? 'Remove text box border' : 'Add text box border');
  };
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
  // Autosize Text de Revu (ADR-0061): callouts (también la nota de Cloud+) y cuadros de texto
  const textBoxes = editingSelection ? selection.filter((m) => m.type === 'callout' || m.type === 'text') : [];
  const autosizeContext = editingSelection ? textBoxes.length > 0 : ['callout', 'text', 'cloudPlus'].includes(activeTool);
  const autosizeOn = editingSelection ? textBoxes.length > 0 && textBoxes.every(isAutosizeText) : autoSizeText;
  const toggleAutosize = () => {
    if (!editingSelection) {
      useToolStore.setState({ autoSizeText: !autoSizeText });
      return;
    }
    applyPropertiesToMarkups(
      textBoxes.map((m) => m.id),
      { customFields: { autoSizeText: autosizeOn ? undefined : 1 } },
      autosizeOn ? 'Autosize Text off' : 'Autosize Text'
    );
  };
  // Count de Revu (ADR-0059): símbolo, escala y total del conteo seleccionado o del que se está haciendo
  const selCounts = editingSelection ? selection.filter((m) => m.type === 'count') : [];
  const countContext = editingSelection ? selCounts.length > 0 && selCounts.length === selection.length : activeTool === 'count';
  const activeCount = markups.find((m) => m.id === activeCountId);
  // Lo que edita la barra: los conteos seleccionados o, con la herramienta Count, el conteo en curso
  const countTargets = editingSelection ? selCounts : activeTool === 'count' && activeCount ? [activeCount] : [];
  const countSymbolValue: CountSymbolId = countTargets[0] ? countSymbolOf(countTargets[0]) ?? 'circle' : countSymbol;
  const countScaleValue = countTargets[0] ? countScaleOf(countTargets[0]) : countScale;
  const countTotal = countTargets.reduce((t, m) => t + countItems(m), 0);
  const changeCount = (patch: { countSymbol?: CountSymbolId; countScale?: number }) => {
    if (!editingSelection) useToolStore.setState(patch);
    if (countTargets.length === 0) return;
    // Un conteo numerado anterior pasa a ser de Revu con el símbolo elegido
    const fields = { countSymbol: patch.countSymbol ?? countSymbolValue, countScale: patch.countScale ?? countScaleValue };
    applyPropertiesToMarkups(countTargets.map((m) => m.id), { customFields: fields }, patch.countSymbol ? 'Count symbol' : 'Count scale');
  };
  // El patrón discontinuo es proporcional al grosor: se recalcula al cambiar de grosor
  const changeWidth = (w: number) => applyStyle({ strokeWidth: w, dashArray: dashArrayFor(lineStyle, w) });

  // Pestaña visible: la de la herramienta activa (un atajo de teclado cambia de pestaña, como en Revu)
  const [tab, setTab] = useState<RibbonTabId>(() => tabOfTool(activeTool) ?? 'markup');
  useEffect(() => {
    const t = tabOfTool(activeTool);
    if (t) setTab(t);
  }, [activeTool]);
  const activeDef = TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.type === activeTool);

  const selectTool = (tool: ToolDefinition) => {
    if (TEXT_LAYER_TOOLS.includes(tool.type) && pageHasText[currentPageIndex] === false) {
      showToast('This page has no selectable text layer. You can draw the markup manually.');
    }
    setActiveTool(tool.type);
  };

  const toolsOf = (groupId: string) => TOOL_GROUPS.find((g) => g.id === groupId)!;
  const renderGroup = (groupId: string) => {
    const group = toolsOf(groupId);
    return (
      <RibbonGroup key={group.id} label={group.label} testId={`ribbon-group-${group.id}`}>
        {group.tools.map((tool) => (
          <ToolButton
            key={tool.type}
            testId={tool.testId || `tool-${tool.type}`}
            title={tool.label}
            label={tool.short}
            icon={tool.icon}
            active={activeTool === tool.type}
            onClick={() => selectTool(tool)}
          />
        ))}
      </RibbonGroup>
    );
  };

  return (
    <div data-testid="ribbon" className="shrink-0 min-w-0 bg-cad-ribbon border-b border-cad-border select-none z-20">
      {/* Pestañas y herramienta activa */}
      <div className="h-[28px] flex items-stretch px-2 border-b border-cad-border">
        <div role="tablist" aria-label="Ribbon" className="flex items-stretch">
          {RIBBON_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-testid={`ribbon-tab-${t.id}`}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="ribbon-tab"
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {activeDef && activeDef.type !== 'select' && (
          <div className="flex items-center gap-1.5 text-2xs text-gray-400 pr-1" data-testid="ribbon-active-tool">
            <span className="w-1.5 h-1.5 rounded-full bg-cad-accent" aria-hidden="true" />
            <span className="text-gray-300">{activeDef.short}</span>
            {activeDef.shortcut && (
              <kbd className="px-1 rounded border border-cad-border text-2xs font-sans text-gray-400">{activeDef.shortcut}</kbd>
            )}
          </div>
        )}
      </div>

      {/* Herramientas: Select y Pan siempre a la vista; el resto según la pestaña */}
      <div className="h-[58px] flex items-stretch overflow-x-auto overflow-y-hidden thin-scroll px-1">
        {renderGroup('select')}
        {tab === 'markup' && (
          <>
            {renderGroup('text')}
            {renderGroup('draw')}
          </>
        )}
        {tab === 'measure' && renderGroup('measure')}
        {tab === 'insert' && (
          <>
            <RibbonGroup label="Stamp" testId="ribbon-group-stamp">
              <ToolButton
                testId="tool-stamp"
                title={`Stamp: ${stampById(activeStampId).label} (click on the drawing to place it, drag to size it)`}
                label="Stamp"
                icon={<StampIcon />}
                active={activeTool === 'stamp'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('stamp')}
              />
              <div className="pl-1">
                <Suspense fallback={<span className="block w-[88px] h-[30px] rounded-md border border-cad-border" />}>
                  <StampPicker
                    testId="ribbon-stamp-picker"
                    value={activeStampId}
                    onChange={(id) => {
                      setActiveStampId(id);
                      setActiveTool('stamp');
                    }}
                  />
                </Suspense>
              </div>
            </RibbonGroup>
            <RibbonGroup label="Link & Form" testId="ribbon-group-insert">
              <ToolButton
                testId="tool-link"
                title="Hyperlink: drag the link area, then choose a web address or page"
                label="Link"
                icon={<Link2 />}
                active={activeTool === 'link'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('link')}
              />
              <ToolButton
                testId="tool-fileAttachment"
                title="File Attachment: click to attach a file"
                label="Attach"
                icon={<Paperclip />}
                active={activeTool === 'fileAttachment'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('fileAttachment')}
              />
              <ToolButton
                testId="tool-formField"
                title={`Form field: ${fieldTypeDef(activeFieldType).label}`}
                label="Field"
                icon={fieldTypeIcon(activeFieldType, 20)}
                active={activeTool === 'formField'}
                disabled={!pdfBytes}
                onClick={() => setActiveTool('formField')}
              />
              <div className="pl-1">
                <IconPicker
                  compact
                  testId="ribbon-field-type"
                  title="Form field type"
                  value={activeFieldType}
                  options={FIELD_TYPES.map((f) => ({ value: f.id, label: f.label }))}
                  renderIcon={(id) => (
                    <span className="flex items-center gap-1 text-2xs">
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
          </>
        )}
      </div>

      {/* Barra de propiedades (ADR-0040/0044): con selección edita la marca; sin ella, el estilo de lo nuevo */}
      <div
        data-testid="properties-bar"
        className="h-[34px] flex items-stretch border-t border-cad-border bg-cad-subtle overflow-x-auto overflow-y-hidden thin-scroll"
      >
        <div data-testid="ribbon-group-style" className="flex items-stretch">
          <div className="prop-section">
            <span
              className={`ui-pill whitespace-nowrap ${editingSelection ? '!bg-cad-accent/15 !text-cad-accent' : ''}`}
              title={editingSelection ? 'Changes apply to the selected markups' : 'Changes apply to the next markups you draw'}
            >
              {editingSelection ? `Properties · ${selection.length} selected` : 'Style (new markups)'}
            </span>
          </div>

          <div className="prop-section" title="Line color">
            <span className="prop-label">Line</span>
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => applyStyle({ strokeColor: c })}
                style={{ backgroundColor: c }}
                aria-pressed={style.strokeColor === c}
                className="prop-swatch"
                title={`Color: ${c}`}
              />
            ))}
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
          </div>

          {countContext && (
            <div className="prop-section" data-testid="ribbon-count-group" title="Count">
              <span className="prop-label">Count</span>
              <IconPicker
                compact
                testId="ribbon-count-symbol"
                title="Count symbol"
                value={countSymbolValue}
                options={COUNT_SYMBOL_OPTIONS}
                renderIcon={(id) => <CountSymbolPreview id={id} />}
                onChange={(id) => changeCount({ countSymbol: id })}
              />
              <label className="flex items-center gap-1 text-2xs text-gray-400" title="Symbol scale (%)">
                Scale
                <input
                  type="number"
                  data-testid="ribbon-count-scale"
                  min={10}
                  max={1000}
                  step={10}
                  value={countScaleValue}
                  onChange={(e) => changeCount({ countScale: clampCountScale(Number(e.target.value)) })}
                  className="ui-input !h-6 !w-14 !px-1 tabular-nums"
                />
                %
              </label>
              <span data-testid="ribbon-count-total" className="ui-pill whitespace-nowrap tabular-nums" title="Totals">
                Totals: Count = {countTotal}
              </span>
            </div>
          )}

          <div className="prop-section" title="Fill for closed shapes">
            <span className="prop-label">Fill</span>
            <button
              type="button"
              data-testid="ribbon-fill-none"
              onClick={() => applyStyle({ fillColor: 'transparent' })}
              title="No fill"
              aria-pressed={!hasFill}
              className="prop-swatch bg-cad-panel relative overflow-hidden"
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
                  aria-pressed={style.fillColor === fill}
                  className="prop-swatch"
                  title={`Translucent fill: ${c}`}
                />
              );
            })}
            <IconPicker
              compact
              testId="ribbon-hatch"
              withLabels
              title="Hatch (closed shapes)"
              value={(style.hatch ?? 'none') as HatchOption}
              options={HATCH_OPTIONS}
              renderIcon={(id) => <HatchPreview id={id} />}
              onChange={(id) => applyStyle({ hatch: id === 'none' ? undefined : id })}
            />
            {calloutContext && (
              <button
                type="button"
                data-testid="ribbon-callout-border"
                aria-pressed={boxBorder}
                onClick={toggleBoxBorder}
                title={boxBorder ? 'Text box border: on' : 'Text box border: off'}
                className={`ml-1 h-6 px-1.5 rounded-md flex items-center gap-1 text-2xs ${
                  boxBorder ? 'bg-cad-accent/15 text-cad-accent' : 'text-gray-400 hover:bg-cad-hover'
                }`}
              >
                <span
                  className="block w-3 h-2.5 rounded-[1px]"
                  style={{ border: `1.5px ${boxBorder ? 'solid' : 'dashed'} currentColor` }}
                />
                Border
              </button>
            )}
          </div>

          <div className="prop-section">
            <span className="prop-label">Ends</span>
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
          </div>

          <div className="prop-section">
            <span className="prop-label">Opacity</span>
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

        {/* Texto (ADR-0040): fuente, tamaño, negrita, cursiva y color */}
        <div data-testid="ribbon-group-font" className="prop-section border-l border-cad-border">
          <span className="prop-label">Text</span>
          <select
            data-testid="ribbon-font-family"
            value={font.family}
            onChange={(e) => applyStyle({ fontFamily: e.target.value })}
            className="ui-input !h-6 w-[92px] !text-xs"
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
            className="ui-input !h-6 w-[46px] !px-1.5 !text-xs"
            title="Font size (pt)"
          />
          <button
            type="button"
            data-testid="ribbon-autosize-text"
            aria-pressed={autosizeOn}
            disabled={!autosizeContext}
            onClick={toggleAutosize}
            title={
              autosizeContext
                ? 'Autosize Text: the text grows or shrinks to fill its box'
                : 'Autosize Text (callouts and text boxes)'
            }
            className={`w-6 h-6 rounded-md grid place-items-center disabled:opacity-35 ${
              autosizeOn ? 'bg-cad-accent/15 text-cad-accent' : 'text-gray-300 hover:bg-cad-hover'
            }`}
          >
            <AutosizeTextIcon />
          </button>
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
              className={`w-6 h-6 rounded-md text-sm ${cls} disabled:opacity-35 ${
                font[key] ? 'bg-cad-accent/15 text-cad-accent' : 'text-gray-300 hover:bg-cad-hover'
              }`}
            >
              {glyph}
            </button>
          ))}
          <label className="flex items-center gap-1 text-2xs text-gray-400" title="Text color">
            <span className="font-semibold">A</span>
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
    </div>
  );
};
