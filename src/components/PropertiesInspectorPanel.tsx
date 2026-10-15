import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CAPTIONED_MEASURES, CAPTION_FAMILIES, captionCssFamily, captionFontOf } from '../core/markup/measureCaption';
import { SlidersHorizontal, ChevronRight, Lock, LockOpen } from 'lucide-react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useUiStore } from '../store/useUiStore';
import { dashArrayFor, lineStyleOf, lineStyleOfMarkup, LineStyleId } from '../core/markup/lineStyles';
import {
  IconPicker,
  LineStylePreview,
  LineEndingPreview,
  LINE_STYLE_OPTIONS,
  LINE_ENDING_OPTIONS,
} from './shell/IconPicker';
import { CLOUD_SIZE_FACTOR, DEFAULT_CLOUD_STEP } from '../core/markup/revisionCloud';
import { calloutBoxPaint } from '../core/markup/calloutLayout';
import { InteractiveProperties } from './markup/InteractiveProperties';
import { Markup, MarkupStatus, VALID_MARKUP_STATUSES, LineEndingStyle } from '../types/markup';

const STATUS_LABELS: Record<MarkupStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const MIXED_VALUE = '—';

export interface PropertiesInspectorPanelProps {
  defaultCollapsed?: boolean;
}

/** Color CSS como hex en mayúsculas; rgba() pasa a hex con su opacidad en % (lectura de diseñador). */
function colorHex(c: string): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (!m) return c;
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}
function colorLabel(c: string): string {
  const a = /^rgba\([^)]*,\s*([\d.]+)\s*\)$/i.exec(c);
  const hex = colorHex(c).replace('#', '').toUpperCase();
  return a ? `${hex} · ${Math.round(Number(a[1]) * 100)}%` : hex;
}

export const PropertiesInspectorPanel: React.FC<PropertiesInspectorPanelProps> = ({
  defaultCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const { markups, selectedMarkupIds, applyPropertiesToMarkups, toggleLockSelectedMarkups, applyLineStyle } =
    useMarkupStore();

  // Menú contextual del plano o menú Ver → Panel de propiedades: abrir el panel (ADR-0017)
  const propertiesOpenRequest = useUiStore((s) => s.propertiesOpenRequest);
  const initialRequest = useRef(propertiesOpenRequest);
  useEffect(() => {
    if (propertiesOpenRequest !== initialRequest.current) setIsCollapsed(false);
  }, [propertiesOpenRequest]);

  const selectedMarkups = useMemo(() => {
    return markups.filter((m) => selectedMarkupIds.includes(m.id));
  }, [markups, selectedMarkupIds]);

  if (isCollapsed) {
    return (
      <aside
        data-testid="properties-inspector-panel"
        data-collapsed="true"
        className="w-10 bg-cad-panel border-l border-cad-border flex flex-col items-center py-3 select-none z-10 transition-all duration-200"
      >
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 text-gray-400 hover:text-cad-strong hover:bg-cad-hover rounded mb-3 transition-colors"
          title="Expand properties"
          data-testid="expand-properties-btn"
        >
          <SlidersHorizontal size={16} />
        </button>
        <span className="text-[11px] text-gray-400 font-medium rotate-90 whitespace-nowrap tracking-wide mt-4">
          Properties
        </span>
      </aside>
    );
  }

  if (selectedMarkups.length === 0) {
    return (
      <aside
        data-testid="properties-inspector-panel"
        data-collapsed="false"
        className="w-[268px] bg-cad-panel border-l border-cad-border flex flex-col text-[12px] select-none"
      >
        <div className="h-10 px-3 flex items-center justify-between border-b border-cad-border shrink-0">
          <span className="ui-panel-title">Properties</span>
          <button
            onClick={() => setIsCollapsed(true)}
            className="ui-btn !h-7 !w-7 !p-0"
            title="Collapse properties"
            data-testid="collapse-properties-btn"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div
          data-testid="properties-empty-message"
          className="text-gray-500 mt-10 px-6 text-center leading-relaxed"
        >
          Select one or more markups to view and edit their properties.
        </div>
      </aside>
    );
  }

  // Cálculo de valores unificados o mixtos (—)
  const getUnifiedValue = <T,>(extractor: (m: Markup) => T): T | typeof MIXED_VALUE => {
    if (selectedMarkups.length === 0) return MIXED_VALUE;
    const firstVal = extractor(selectedMarkups[0]);
    const allSame = selectedMarkups.every((m) => extractor(m) === firstVal);
    return allSame ? firstVal : MIXED_VALUE;
  };

  const strokeColor = getUnifiedValue((m) => m.style.strokeColor || '#000000');
  const fillColor = getUnifiedValue((m) => m.style.fillColor || '');
  const strokeWidth = getUnifiedValue((m) => m.style.strokeWidth ?? 1);
  const opacity = getUnifiedValue((m) => m.style.opacity ?? 1);
  const strokeDash = getUnifiedValue((m) => lineStyleOf(m.style.dashArray));
  const textContent = getUnifiedValue((m) => m.text || '');
  // Las mediciones escriben su valor a 8 pt por defecto (ADR-0034/0035)
  const fontSize = getUnifiedValue((m) => m.style.fontSize ?? (CAPTIONED_MEASURES.has(m.type) ? 8 : 12));
  // Texto del valor de las mediciones (ADR-0035): fuente, color, negrita y cursiva
  const allMeasures = selectedMarkups.length > 0 && selectedMarkups.every((m) => CAPTIONED_MEASURES.has(m.type));
  const textFamily = getUnifiedValue((m) => captionFontOf(m).family);
  const textColor = getUnifiedValue((m) => captionFontOf(m).color);
  const textBold = selectedMarkups.length > 0 && selectedMarkups.every((m) => Boolean(m.textFormat?.bold));
  const textItalic = selectedMarkups.length > 0 && selectedMarkups.every((m) => Boolean(m.textFormat?.italic));
  const status = getUnifiedValue((m) => m.status || 'pending');
  const author = getUnifiedValue((m) => m.author || '');

  const isAllLocked =
    selectedMarkups.length > 0 && selectedMarkups.every((m) => Boolean(m.locked));
  // Nube (ADR-0021): "Nube" como tipo de línea para rectángulos y polígonos, tamaño de arco e invertir
  const allCallouts = selectedMarkups.length > 0 && selectedMarkups.every((m) => m.type === 'callout');
  const calloutBorder = allCallouts && selectedMarkups.every((m) => calloutBoxPaint(m).border);
  const allCloud = selectedMarkups.length > 0 && selectedMarkups.every((m) => lineStyleOfMarkup(m) === 'cloud');
  // Tipo de línea de cada marca (ADR-0041): nube, patrón o discontinuo
  const markupLineStyle = getUnifiedValue((m) => lineStyleOfMarkup(m));
  const cloudSize = getUnifiedValue((m) =>
    typeof m.customFields?.arcStep === 'number' ? m.customFields.arcStep / CLOUD_SIZE_FACTOR : DEFAULT_CLOUD_STEP / CLOUD_SIZE_FACTOR
  );
  const cloudInvert = getUnifiedValue((m) => (m.customFields?.cloudInvert === 1 ? 1 : 0));
  const handleCloudSizeChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed <= 0) return;
    const size = Math.max(0.5, Math.min(parsed, 10));
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { customFields: { arcStep: Math.round(size * CLOUD_SIZE_FACTOR * 100) / 100 } },
      `Set arc size to ${size}`
    );
  };
  const handleCloudInvertChange = (checked: boolean) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { customFields: { cloudInvert: checked ? 1 : undefined } },
      checked ? 'Invert cloud' : 'Cloud not inverted'
    );
  };
  const handleLineStylePick = (id: LineStyleId) => applyLineStyle(selectedMarkupIds, id);

  const hasLineMarkup = selectedMarkups.some(
    (m) => m.type === 'line' || m.type === 'polyLine' || m.type === 'dimension' || m.type === 'length' || m.type === 'callout'
  );
  // Una distancia sin extremos guardados se dibuja con flechas cerradas (Acrobat, ADR-0033)
  // El callout usa flecha abierta por defecto, como Revu (ADR-0042)
  const lineEndingStart = getUnifiedValue(
    (m) => m.style.lineEndingStart || (m.type === 'length' ? 'closedArrow' : m.type === 'callout' ? 'openArrow' : 'none')
  );
  const lineEndingEnd = getUnifiedValue((m) => m.style.lineEndingEnd || (m.type === 'length' ? 'closedArrow' : 'none'));
  // Posición del valor de las distancias ("Caption Style" de Acrobat)
  const allLengths = selectedMarkups.length > 0 && selectedMarkups.every((m) => m.type === 'length');
  const captionStyle = getUnifiedValue((m) => (m.customFields?.captionStyle === 'top' ? 'top' : 'inline'));

  // Manejadores atómicos de actualización
  const handleLineEndingStartChange = (val: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { lineEndingStart: val as LineEndingStyle } },
      `Set start to ${val}`
    );
  };

  const handleLineEndingEndChange = (val: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { lineEndingEnd: val as LineEndingStyle } },
      `Set end to ${val}`
    );
  };

  const handleStrokeColorChange = (newColor: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { strokeColor: newColor } },
      `Set line color to ${newColor}`
    );
  };

  const handleFillColorChange = (newColor: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { fillColor: newColor } },
      newColor ? `Set fill to ${newColor}` : 'Remove fill'
    );
  };

  const handleStrokeWidthChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed < 1) return;
    const width = Math.max(1, Math.min(parsed, 50));
    // El patrón discontinuo es proporcional al grosor: se recalcula si todas comparten tipo de línea
    const dashUpdate =
      strokeDash !== MIXED_VALUE && strokeDash !== 'solid'
        ? { dashArray: dashArrayFor(strokeDash as LineStyleId, width) }
        : {};
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { strokeWidth: width, ...dashUpdate } },
      `Set line width to ${parsed} pt`
    );
  };

  const handleOpacityChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed)) return;
    const clamped = Math.max(0.05, Math.min(parsed, 1));
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { opacity: clamped } },
      `Set opacity to ${Math.round(clamped * 100)}%`
    );
  };

  const handleFontSizeChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed < 6) return;
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { fontSize: Math.max(6, Math.min(parsed, 72)) } },
      `Set font size to ${parsed}pt`
    );
  };

  const handleTextChange = (newText: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { text: newText },
      `Edit markup text`
    );
  };

  const handleStatusChange = (newStatus: string) => {
    if (!VALID_MARKUP_STATUSES.includes(newStatus as MarkupStatus)) return;
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { status: newStatus as MarkupStatus },
      `Set status to ${newStatus}`
    );
  };

  const handleAuthorChange = (newAuthor: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { author: newAuthor },
      `Set author to ${newAuthor}`
    );
  };

  return (
    <aside
      data-testid="properties-inspector-panel"
      data-collapsed="false"
      className="w-[268px] bg-cad-panel border-l border-cad-border flex flex-col text-[12px] select-none overflow-y-auto"
    >
      <div className="h-10 px-3 flex items-center justify-between border-b border-cad-border shrink-0 sticky top-0 bg-cad-panel z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="ui-panel-title">Properties</span>
          <span data-testid="selection-count-badge" className="ui-badge">
            {selectedMarkups.length === 1 ? '1 markup' : `${selectedMarkups.length} markups`}
          </span>
          <button
            type="button"
            data-testid="prop-lock-btn"
            onClick={toggleLockSelectedMarkups}
            title={isAllLocked ? 'Unlock markup(s)' : 'Lock markup(s)'}
            className={`ui-btn !h-6 !px-1.5 !text-[11px] ${isAllLocked ? '!text-amber-500' : ''}`}
          >
            {isAllLocked ? <Lock size={12} className="text-amber-400" /> : <LockOpen size={12} />}
            <span>{isAllLocked ? 'Locked' : 'Lock'}</span>
          </button>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="ui-btn !h-7 !w-7 !p-0"
          title="Collapse properties"
          data-testid="collapse-properties-btn"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="px-3 py-3 space-y-1.5">
        {selectedMarkups.length === 1 &&
          (selectedMarkups[0].type === 'link' ||
            selectedMarkups[0].type === 'fileAttachment' ||
            selectedMarkups[0].type === 'formField') && <InteractiveProperties markup={selectedMarkups[0]} />}
        {/* Color de trazo */}
        <div className="ui-row">
          <label className="ui-label">Stroke</label>
          <div className="flex items-center gap-2 h-7 px-1.5 rounded-md bg-cad-field">
            <input
              type="color"
              data-testid="prop-stroke-color"
              value={strokeColor === MIXED_VALUE ? '#000000' : (strokeColor as string)}
              onChange={(e) => handleStrokeColorChange(e.target.value)}
              className="ui-swatch !w-5 !h-5"
            />
            <span className="text-gray-200 text-[11.5px] tabular-nums uppercase">
              {strokeColor === MIXED_VALUE ? MIXED_VALUE : colorLabel(strokeColor as string)}
            </span>
          </div>
        </div>

        {/* Color de relleno */}
        <div className="ui-row">
          <label className="ui-label">Fill</label>
          <div className="flex items-center gap-2 h-7 px-1.5 rounded-md bg-cad-field min-w-0">
            <input
              type="color"
              data-testid="prop-fill-color"
              value={fillColor === MIXED_VALUE || !fillColor ? '#ffffff' : colorHex(fillColor as string)}
              onChange={(e) => handleFillColorChange(e.target.value)}
              className="ui-swatch !w-5 !h-5"
            />
            <span className="flex-1 text-gray-200 text-[11.5px] tabular-nums uppercase truncate">
              {fillColor === MIXED_VALUE ? MIXED_VALUE : fillColor ? colorLabel(fillColor as string) : 'None'}
            </span>
            {fillColor && fillColor !== MIXED_VALUE && (
              <button
                type="button"
                onClick={() => handleFillColorChange('')}
                title="No fill"
                className="text-gray-400 hover:text-rose-500 text-[13px] leading-none px-0.5"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Grosor de trazo */}
        <div className="ui-row">
          <label className="ui-label">Weight (pt)</label>
          <input
            type="number"
            data-testid="prop-stroke-width"
            min="1"
            max="50"
            value={strokeWidth === MIXED_VALUE ? '' : (strokeWidth as number)}
            placeholder={strokeWidth === MIXED_VALUE ? MIXED_VALUE : '1'}
            onChange={(e) => handleStrokeWidthChange(e.target.value)}
            className="ui-input"
          />
        </div>

        {/* Opacidad */}
        <div className="ui-row">
          <label className="ui-label">Opacity</label>
          <div className="flex items-center gap-2">
          <input
            type="range"
            data-testid="prop-opacity"
            min="0.05"
            max="1"
            step="0.05"
            value={opacity === MIXED_VALUE ? 1 : (opacity as number)}
            onChange={(e) => handleOpacityChange(e.target.value)}
            className="flex-1 min-w-0 cursor-pointer ui-range"
          />
            <span className="w-9 text-right text-gray-300 text-[11.5px] tabular-nums">
              {opacity === MIXED_VALUE ? MIXED_VALUE : `${Math.round((opacity as number) * 100)}%`}
            </span>
          </div>
        </div>

        {/* Estilo de trazo */}
        <div className="ui-row">
          <label className="ui-label">Style</label>
          <IconPicker<LineStyleId>
            testId="prop-stroke-style"
            title="Line style"
            value={markupLineStyle === MIXED_VALUE ? null : (markupLineStyle as LineStyleId)}
            options={LINE_STYLE_OPTIONS}
            withLabels
            renderIcon={(id) => <LineStylePreview id={id} width={64} />}
            onChange={handleLineStylePick}
          />
        </div>

        {/* Borde de la caja del callout, aparte del relleno (ADR-0042) */}
        {allCallouts && (
          <div className="ui-row">
            <label className="ui-label">Text box</label>
            <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="prop-callout-border"
                checked={calloutBorder}
                onChange={(e) =>
                  applyPropertiesToMarkups(
                    selectedMarkupIds,
                    { customFields: { calloutBorder: e.target.checked ? 1 : 0 } },
                    e.target.checked ? 'Add text box border' : 'Remove text box border'
                  )
                }
                className="accent-cad-accent"
              />
              Border
            </label>
          </div>
        )}

        {/* Estilo de nube: tamaño de arco e invertir (como en Revu) */}
        {allCloud && (
          <div className="ui-row" data-testid="prop-cloud-style">
            <label className="ui-label">Arc size</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                data-testid="prop-cloud-size"
                min="0.5"
                max="10"
                step="0.25"
                value={cloudSize === MIXED_VALUE ? '' : (cloudSize as number)}
                placeholder={cloudSize === MIXED_VALUE ? MIXED_VALUE : '2'}
                onChange={(e) => handleCloudSizeChange(e.target.value)}
                className="w-20 ui-input"
              />
            <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="prop-cloud-invert"
                checked={cloudInvert === 1}
                onChange={(e) => handleCloudInvertChange(e.target.checked)}
                className="accent-cad-accent"
              />
              Invert
            </label>
            </div>
          </div>
        )}

        {/* Extremos de línea (flechas y formas) */}
        {hasLineMarkup && (
          <>
            <div className="ui-row">
              <label className="ui-label">Start</label>
              <IconPicker
                testId="prop-line-ending-start"
                title="Start"
                value={lineEndingStart === MIXED_VALUE ? null : (lineEndingStart as LineEndingStyle)}
                options={LINE_ENDING_OPTIONS}
                renderIcon={(id) => <LineEndingPreview ending={id} side="start" width={120} />}
                onChange={(id) => handleLineEndingStartChange(id)}
              />
            </div>

            <div className="ui-row">
              <label className="ui-label">End</label>
              <IconPicker
                testId="prop-line-ending-end"
                title="End"
                value={lineEndingEnd === MIXED_VALUE ? null : (lineEndingEnd as LineEndingStyle)}
                options={LINE_ENDING_OPTIONS}
                renderIcon={(id) => <LineEndingPreview ending={id} side="end" width={120} />}
                onChange={(id) => handleLineEndingEndChange(id)}
              />
            </div>
          </>
        )}

        {/* Valor de la distancia: dentro de la línea o encima (Acrobat, ADR-0033) */}
        {allLengths && (
          <div className="ui-row">
            <label className="ui-label">Value</label>
            <select
              data-testid="prop-caption"
              value={captionStyle === MIXED_VALUE ? '' : (captionStyle as string)}
              onChange={(e) =>
                applyPropertiesToMarkups(selectedMarkupIds, { customFields: { captionStyle: e.target.value } }, 'Set value position')
              }
              className="ui-input"
            >
              {captionStyle === MIXED_VALUE && <option value="">{MIXED_VALUE}</option>}
              <option value="inline">Inside the line</option>
              <option value="top">On top of the line</option>
            </select>
          </div>
        )}

        {/* Texto del valor de las mediciones: fuente, color, negrita y cursiva (ADR-0035) */}
        {allMeasures && (
          <div className="ui-row" data-testid="prop-measure-text">
            <label className="ui-label">Text</label>
            <div className="flex items-center gap-1.5">
              <select
                data-testid="prop-font-family"
                value={textFamily === MIXED_VALUE ? '' : (textFamily as string)}
                onChange={(e) =>
                  applyPropertiesToMarkups(selectedMarkupIds, { style: { fontFamily: e.target.value } }, 'Set font')
                }
                className="flex-1 ui-input"
              >
                {textFamily === MIXED_VALUE && <option value="">{MIXED_VALUE}</option>}
                {CAPTION_FAMILIES.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: captionCssFamily(f) }}>
                    {f}
                  </option>
                ))}
              </select>
              <input
                type="color"
                data-testid="prop-text-color"
                title="Text color"
                value={textColor === MIXED_VALUE ? '#000000' : (textColor as string)}
                onChange={(e) =>
                  applyPropertiesToMarkups(selectedMarkupIds, { style: { textColor: e.target.value } }, 'Set text color')
                }
                className="ui-swatch !w-7 !h-7"
              />
              {(
                [
                  ['bold', textBold, 'B', 'Bold', 'font-bold'],
                  ['italic', textItalic, 'I', 'Italic', 'italic font-serif'],
                ] as const
              ).map(([key, on, glyph, title, cls]) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`prop-text-${key}`}
                  aria-pressed={on}
                  title={title}
                  // textFormat se sustituye entero: se envía también el otro estilo para no perderlo
                  onClick={() =>
                    applyPropertiesToMarkups(
                      selectedMarkupIds,
                      { textFormat: key === 'bold' ? { bold: !on, italic: textItalic } : { bold: textBold, italic: !on } },
                      title
                    )
                  }
                  className={`w-7 h-7 rounded-md text-xs ${cls} ${
                    on ? 'bg-cad-accent/15 text-cad-accent' : 'bg-cad-field text-gray-300 hover:text-cad-strong'
                  }`}
                >
                  {glyph}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tamaño de fuente */}
        <div className="ui-row">
          <label className="ui-label">Font size</label>
          <input
            type="number"
            data-testid="prop-font-size"
            min="6"
            max="72"
            value={fontSize === MIXED_VALUE ? '' : (fontSize as number)}
            placeholder={fontSize === MIXED_VALUE ? MIXED_VALUE : '12'}
            onChange={(e) => handleFontSizeChange(e.target.value)}
            className="ui-input"
          />
        </div>

        {/* Estado */}
        <div className="ui-row">
          <label className="ui-label">Status</label>
          <select
            data-testid="prop-status"
            value={status === MIXED_VALUE ? '' : (status as string)}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="ui-input"
          >
            {status === MIXED_VALUE && <option value="">{MIXED_VALUE}</option>}
            {VALID_MARKUP_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </select>
        </div>

        {/* Autor */}
        <div className="ui-row">
          <label className="ui-label">Author</label>
          <input
            type="text"
            data-testid="prop-author"
            value={author === MIXED_VALUE ? '' : (author as string)}
            placeholder={author === MIXED_VALUE ? MIXED_VALUE : 'Author'}
            onChange={(e) => handleAuthorChange(e.target.value)}
            className="ui-input"
          />
        </div>

        {/* Contenido / Texto */}
        <div className="ui-row">
          <label className="ui-label self-start pt-1.5">Comment</label>
          <textarea
            data-testid="prop-text"
            rows={3}
            value={textContent === MIXED_VALUE ? '' : (textContent as string)}
            placeholder={textContent === MIXED_VALUE ? MIXED_VALUE : 'Markup text...'}
            onChange={(e) => handleTextChange(e.target.value)}
            className="ui-input resize-none"
          />
        </div>
      </div>
    </aside>
  );
};
