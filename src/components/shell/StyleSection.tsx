import React from 'react';
import { useToolStore } from '../../store/useToolStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { STROKE_COLORS } from './toolDefinitions';
import { dashArrayFor, lineStyleOfMarkup, LineStyleId } from '../../core/markup/lineStyles';
import { isPatternLineStyle } from '../../core/markup/linePatterns';
import { cloudParams, CLOUD_SIZE_FACTOR, DEFAULT_CLOUD_STEP } from '../../core/markup/revisionCloud';
import { CloudStylePicker } from './CloudStylePicker';
import { ColorPicker } from './ColorPicker';
import { HatchPreview, HATCH_OPTIONS, HatchOption } from './HatchPreview';
import { CountSymbolPreview, COUNT_SYMBOL_OPTIONS } from './CountPreview';
import { isAutosizeText } from '../../core/markup/autosizeText';
import { clampCountScale, countItems, countScaleOf, countSymbolOf, CountSymbolId } from '../../core/markup/countSymbols';
import { calloutBoxPaint } from '../../core/markup/calloutLayout';
import { formatSequence, SEQUENCE_FORMATS, SequenceFormat } from '../../core/markup/sequences';
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
import { CAPTION_FAMILIES, CAPTIONED_MEASURES, captionFontOf, markupFontOf, BOX_TEXT_COLOR } from '../../core/markup/measureCaption';
import type { MarkupStyle } from '../../types/markup';

const STROKE_WIDTHS = [0, 0.5, 1, 1.5, 2, 3, 5, 8];


const OPACITIES = [1, 0.75, 0.5, 0.25];

/** Icono de Autosize Text (ADR-0061): una A con flechas hacia las esquinas, como el botón de Revu. */
const AutosizeTextIcon: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden="true">
    <path d="M5.5 11.5 8 4.5l2.5 7M6.4 9.2h3.2" strokeLinejoin="round" />
    <path d="M1.5 4.5v-3h3M11.5 1.5h3v3M14.5 11.5v3h-3M4.5 14.5h-3v-3" />
  </svg>
);

/**
 * Estilo de las marcas (ADR-0064): línea, relleno, hatch, extremos, opacidad, texto, nube, Count y Autosize Text.
 * Antes era la franja de propiedades de la cinta (ADR-0040); ahora vive en el panel de Propiedades, la única fuente
 * de verdad visual del estilo, como el panel de Revu. Con marcas seleccionadas edita la selección; sin selección (o
 * con una herramienta de dibujo activa), el estilo de las marcas nuevas.
 */
export const StyleSection: React.FC = () => {
  const {
    activeTool,
    currentStyle,
    setCurrentStyle,
    cloudSize,
    cloudInvert,
    setCloudOptions,
    calloutBorder,
    setCalloutBorder,
    countSymbol,
    countScale,
    activeCountId,
    autoSizeText,
    sequence,
    setSequence,
    dynamicFillGap,
    setDynamicFillGap,
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
  // El valor de las mediciones se escribe con su propia tipografía por defecto (8 pt, ADR-0034/0035)
  const font =
    editingSelection && CAPTIONED_MEASURES.has(selection[0].type)
      ? captionFontOf(selection[0])
      : markupFontOf(editingSelection ? selection[0] : { style: currentStyle }, 10, BOX_TEXT_COLOR);
  // Grosor mezclado en una selección múltiple: el selector lo muestra como "— mixed —"
  const mixedWidth =
    editingSelection && selection.some((m) => (m.style.strokeWidth ?? 1) !== (selection[0].style.strokeWidth ?? 1));
  const toggleFormat = (key: 'bold' | 'italic') => {
    if (!editingSelection) return;
    const next = { ...selection[0].textFormat, bold: key === 'bold' ? !font.bold : font.bold, italic: key === 'italic' ? !font.italic : font.italic };
    applyPropertiesToMarkups(selection.map((m) => m.id), { textFormat: next }, key === 'bold' ? 'Bold' : 'Italic');
  };
  const currentAlign = editingSelection ? (selection[0].textFormat?.align ?? 'left') : 'left';
  const setAlign = (align: 'left' | 'center' | 'right') => {
    if (!editingSelection) return;
    const next = { ...selection[0].textFormat, align };
    applyPropertiesToMarkups(selection.map((m) => m.id), { textFormat: next }, `Align text ${align}`);
  };

  // Tipo de línea (ADR-0041): el de la marca seleccionada; sin selección, el de las marcas nuevas (Cloud con la
  // herramienta de nube)
  // El callout dibuja flecha abierta si no se eligió otra (ADR-0042): la barra lo muestra así
  const calloutContext = editingSelection ? selection[0].type === 'callout' : activeTool === 'callout';
  const isBoxed = (type: string) => type === 'callout' || type === 'text';
  const boxBorderContext = editingSelection ? isBoxed(selection[0].type) : (activeTool === 'callout' || activeTool === 'text');
  // Una distancia sin extremos guardados se dibuja con flechas cerradas (Acrobat, ADR-0033)
  const lengthContext = editingSelection ? selection[0].type === 'length' : activeTool === 'length';
  // Borde de la caja del callout o de texto (ADR-0042, ADR-0138), aparte del relleno
  const boxBorder = editingSelection
    ? selection[0].type === 'callout'
      ? calloutBoxPaint(selection[0]).border
      : (selection[0].customFields?.boxBorder !== undefined
          ? (selection[0].customFields.boxBorder === 1 || selection[0].customFields.boxBorder === '1')
          : Boolean(style.strokeWidth && style.strokeWidth > 0 && style.strokeColor !== 'transparent' && style.strokeColor !== 'none'))
    : activeTool === 'callout'
    ? (calloutBorder ?? Boolean(style.fillColor && style.fillColor !== 'transparent'))
    : Boolean(style.strokeWidth && style.strokeWidth > 0 && style.strokeColor !== 'transparent' && style.strokeColor !== 'none');
  const toggleBoxBorder = () => {
    const next = !boxBorder;
    if (!editingSelection) {
      if (activeTool === 'callout') {
        setCalloutBorder(next);
      } else {
        if (next) {
          applyStyle({
            strokeWidth: style.strokeWidth && style.strokeWidth > 0 ? style.strokeWidth : 1,
            strokeColor: style.strokeColor && style.strokeColor !== 'transparent' && style.strokeColor !== 'none' ? style.strokeColor : STROKE_COLORS[0],
          });
        } else {
          applyStyle({ strokeWidth: 0, strokeColor: 'transparent' });
        }
      }
      return;
    }
    const calloutIds = selection.filter((m) => m.type === 'callout').map((m) => m.id);
    if (calloutIds.length > 0) {
      applyPropertiesToMarkups(calloutIds, { customFields: { calloutBorder: next ? 1 : 0 } }, next ? 'Add text box border' : 'Remove text box border');
    }
    const textIds = selection.filter((m) => m.type === 'text').map((m) => m.id);
    if (textIds.length > 0) {
      applyPropertiesToMarkups(
        textIds,
        {
          customFields: { boxBorder: next ? 1 : 0 },
          style: {
            strokeWidth: next ? (style.strokeWidth && style.strokeWidth > 0 ? style.strokeWidth : 1) : 0,
            strokeColor: next ? (style.strokeColor && style.strokeColor !== 'transparent' && style.strokeColor !== 'none' ? style.strokeColor : STROKE_COLORS[0]) : 'transparent',
          },
        },
        next ? 'Add text box border' : 'Remove text box border'
      );
    }
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

  return (
    <div data-testid="properties-style" data-target={editingSelection ? 'selection' : 'new'} className="style-stack">
        <div data-testid="ribbon-group-style" className="flex flex-col">
          <div className="prop-section" title="Line color">
            <span className="prop-label">Line</span>
            <ColorPicker
              testId="ribbon-stroke-color"
              title="Line color"
              value={style.strokeColor === 'transparent' || style.strokeColor === 'none' ? undefined : style.strokeColor}
              options={STROKE_COLORS.map((c) => ({ value: c, label: c }))}
              allowNone
              customTestId="prop-stroke-color"
              onChange={(c) => {
                if (!c || c === 'transparent' || c === 'none') {
                  if (editingSelection) {
                    const tIds = selection.filter((m) => m.type === 'text').map((m) => m.id);
                    const otherIds = selection.filter((m) => m.type !== 'text').map((m) => m.id);
                    if (tIds.length > 0) {
                      applyPropertiesToMarkups(tIds, { style: { strokeColor: 'transparent', strokeWidth: 0 }, customFields: { boxBorder: 0 } }, 'Remove text box border');
                    }
                    if (otherIds.length > 0) {
                      applyPropertiesToMarkups(otherIds, { style: { strokeColor: 'transparent', strokeWidth: 0 } }, 'Edit properties');
                    }
                  } else {
                    applyStyle({ strokeColor: 'transparent', strokeWidth: 0 });
                  }
                } else {
                  const newW = style.strokeWidth === 0 ? 1 : (style.strokeWidth ?? 1);
                  if (editingSelection) {
                    const tIds = selection.filter((m) => m.type === 'text').map((m) => m.id);
                    const otherIds = selection.filter((m) => m.type !== 'text').map((m) => m.id);
                    if (tIds.length > 0) {
                      applyPropertiesToMarkups(tIds, { style: { strokeColor: c, strokeWidth: newW }, customFields: { boxBorder: 1 } }, 'Add text box border');
                    }
                    if (otherIds.length > 0) {
                      applyPropertiesToMarkups(otherIds, { style: { strokeColor: c, strokeWidth: newW } }, 'Edit properties');
                    }
                  } else {
                    applyStyle({ strokeColor: c, strokeWidth: newW });
                  }
                }
              }}
            />
            <IconPicker
              compact
              testId="ribbon-stroke-width"
              title="Line width (pt)"
              value={mixedWidth ? null : style.strokeWidth ?? 2}
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
              disabled={lineStyle !== 'cloud' && !(editingSelection && (selection[0].type === 'cloud' || selection[0].type === 'cloudPlus'))}
              onChange={changeCloud}
            />
          </div>

          {activeTool === 'sequence' && !editingSelection && (
            <div className="prop-section" data-testid="ribbon-sequence-group" title="Numbered sequence">
              <span className="prop-label">Sequence</span>
              <select
                data-testid="ribbon-sequence-format"
                aria-label="Sequence format"
                value={sequence.format}
                onChange={(e) => setSequence({ format: e.target.value as SequenceFormat })}
                className="h-6 rounded-md border border-cad-border bg-cad-field px-1 text-xs text-gray-200"
              >
                {SEQUENCE_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                data-testid="ribbon-sequence-prefix"
                aria-label="Sequence prefix"
                placeholder="Prefix"
                value={sequence.prefix}
                onChange={(e) => setSequence({ prefix: e.target.value })}
                className="h-6 w-14 rounded-md border border-cad-border bg-cad-field px-1 text-xs text-gray-200"
              />
              <input
                data-testid="ribbon-sequence-suffix"
                aria-label="Sequence suffix"
                placeholder="Suffix"
                value={sequence.suffix}
                onChange={(e) => setSequence({ suffix: e.target.value })}
                className="h-6 w-14 rounded-md border border-cad-border bg-cad-field px-1 text-xs text-gray-200"
              />
              <label className="flex items-center gap-1 text-xs text-gray-400">
                Next
                <input
                  data-testid="ribbon-sequence-next"
                  type="number"
                  min={1}
                  value={sequence.next}
                  onChange={(e) => setSequence({ next: Number(e.target.value) })}
                  className="ui-data h-6 w-14 rounded-md border border-cad-border bg-cad-field px-1 text-xs text-gray-200"
                />
              </label>
              <span data-testid="ribbon-sequence-preview" className="ui-data text-xs text-gray-300">
                {formatSequence(sequence.next, sequence)}
              </span>
            </div>
          )}

          {activeTool === 'dynamicFill' && !editingSelection && (
            <div className="prop-section" data-testid="ribbon-dynamic-fill-group" title="Dynamic Fill">
              <span className="prop-label">Dynamic Fill</span>
              <label className="flex items-center gap-1 text-xs text-gray-400" title="Pixels of gap between lines that are closed when detecting the area">
                Gap
                <input
                  data-testid="ribbon-dynamic-fill-gap"
                  type="number"
                  min={0}
                  max={20}
                  value={dynamicFillGap}
                  onChange={(e) => setDynamicFillGap(Number(e.target.value))}
                  className="ui-data h-6 w-14 rounded-md border border-cad-border bg-cad-field px-1 text-xs text-gray-200"
                />
              </label>
            </div>
          )}

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
                  className="ui-input !h-6 !w-14 !px-1 ui-data"
                />
                %
              </label>
              <span data-testid="ribbon-count-total" className="ui-pill whitespace-nowrap ui-data" title="Totals">
                Totals: Count = {countTotal}
              </span>
            </div>
          )}

          <div className="prop-section" title="Fill for closed shapes">
            <span className="prop-label">Fill</span>
            <ColorPicker
              testId="ribbon-fill-color"
              title="Fill color"
              value={hasFill && style.fillColor !== 'transparent' && style.fillColor !== 'none' ? style.fillColor : undefined}
              options={STROKE_COLORS.map((c) => ({ value: translucentFill(c, 0.25), label: `Translucent ${c}`, border: c }))}
              allowNone
              customTestId="prop-fill-color"
              onChange={(c) => applyStyle({ fillColor: c || 'transparent' })}
            />
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
            {boxBorderContext && (
              <button
                type="button"
                data-testid="ribbon-callout-border"
                aria-pressed={boxBorder}
                onClick={toggleBoxBorder}
                title={boxBorder ? 'Text box border: on' : 'Text box border: off'}
                className={`ml-1 h-6 px-1.5 rounded-md flex items-center gap-1 text-2xs ${
                  boxBorder ? 'bg-cad-hover text-cad-strong' : 'text-gray-400 hover:bg-cad-hover'
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
              value={style.lineEndingStart ?? (calloutContext ? 'openArrow' : lengthContext ? 'closedArrow' : 'none')}
              options={LINE_ENDING_OPTIONS}
              renderIcon={(id) => <LineEndingPreview ending={id} side="start" />}
              onChange={(id) => applyStyle({ lineEndingStart: id })}
            />
            <IconPicker
              compact
              testId="ribbon-line-end"
              withLabels
              title="End (the Arrow tool uses a closed arrow when None)"
              value={style.lineEndingEnd ?? (lengthContext ? 'closedArrow' : 'none')}
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
        <div data-testid="ribbon-group-font" className="prop-section">
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
              autosizeOn ? 'bg-cad-hover text-cad-strong' : 'text-gray-300 hover:bg-cad-hover'
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
                font[key] ? 'bg-cad-hover text-cad-strong' : 'text-gray-300 hover:bg-cad-hover'
              }`}
            >
              {glyph}
            </button>
          ))}
          {(
            [
              ['left', 'Align Left', [2, 5, 2]],
              ['center', 'Align Center', [2, 3.5, 2]],
              ['right', 'Align Right', [2, 5, 2]],
            ] as const
          ).map(([alignKey, title]) => (
            <button
              key={alignKey}
              type="button"
              data-testid={`ribbon-text-align-${alignKey}`}
              aria-pressed={currentAlign === alignKey}
              disabled={!editingSelection}
              onClick={() => setAlign(alignKey)}
              title={editingSelection ? title : `${title} (select a markup first)`}
              className={`w-6 h-6 rounded-md grid place-items-center disabled:opacity-35 ${
                currentAlign === alignKey ? 'bg-cad-hover text-cad-strong' : 'text-gray-300 hover:bg-cad-hover'
              }`}
            >
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
                <line x1={2} y1={4} x2={14} y2={4} />
                <line
                  x1={alignKey === 'right' ? 6 : alignKey === 'center' ? 4 : 2}
                  y1={8}
                  x2={alignKey === 'left' ? 10 : alignKey === 'center' ? 12 : 14}
                  y2={8}
                />
                <line
                  x1={alignKey === 'right' ? 4 : alignKey === 'center' ? 3 : 2}
                  y1={12}
                  x2={alignKey === 'left' ? 12 : alignKey === 'center' ? 13 : 14}
                  y2={12}
                />
              </svg>
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
  );
};
