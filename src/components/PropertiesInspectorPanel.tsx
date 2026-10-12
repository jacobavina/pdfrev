import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, ChevronRight, Lock, LockOpen } from 'lucide-react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useUiStore } from '../store/useUiStore';
import { dashArrayFor, lineStyleOf, LINE_STYLE_LABELS, LineStyleId } from '../core/markup/lineStyles';
import {
  IconPicker,
  LineStylePreview,
  LineEndingPreview,
  LINE_STYLE_OPTIONS,
  LINE_ENDING_OPTIONS,
} from './shell/IconPicker';
import { CLOUD_SIZE_FACTOR, DEFAULT_CLOUD_STEP } from '../core/markup/revisionCloud';
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

export const PropertiesInspectorPanel: React.FC<PropertiesInspectorPanelProps> = ({
  defaultCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const { markups, selectedMarkupIds, applyPropertiesToMarkups, toggleLockSelectedMarkups, setCloudLineStyle } =
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
        <span className="text-[10px] text-gray-500 font-medium rotate-90 whitespace-nowrap mt-4">
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
        className="w-64 bg-cad-panel border-l border-cad-border flex flex-col p-3 text-xs select-none"
      >
        <div className="flex items-center justify-between pb-1 border-b border-cad-border mb-2">
          <span className="font-semibold text-gray-300 uppercase tracking-wider">
            Properties
          </span>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 text-gray-400 hover:text-cad-strong hover:bg-cad-hover rounded transition-colors"
            title="Collapse properties"
            data-testid="collapse-properties-btn"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div
          data-testid="properties-empty-message"
          className="text-gray-500 italic mt-6 text-center"
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
  const fontSize = getUnifiedValue((m) => m.style.fontSize ?? 12);
  const status = getUnifiedValue((m) => m.status || 'pending');
  const author = getUnifiedValue((m) => m.author || '');

  const isAllLocked =
    selectedMarkups.length > 0 && selectedMarkups.every((m) => Boolean(m.locked));
  // Nube (ADR-0021): "Nube" como tipo de línea para rectángulos y polígonos, tamaño de arco e invertir
  const cloudConvertible =
    selectedMarkups.length > 0 &&
    selectedMarkups.every((m) => m.type === 'rectangle' || m.type === 'polygon' || m.type === 'cloud');
  const allCloud =
    selectedMarkups.length > 0 && selectedMarkups.every((m) => m.type === 'cloud' || m.type === 'cloudPlus');
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
  const handleLineStylePick = (id: LineStyleId | 'cloud') => {
    if (id === 'cloud') {
      setCloudLineStyle(selectedMarkupIds, true);
      return;
    }
    if (selectedMarkups.some((m) => m.type === 'cloud')) setCloudLineStyle(selectedMarkupIds, false);
    handleStrokeDashChange(id);
  };

  const hasLineMarkup = selectedMarkups.some(
    (m) => m.type === 'line' || m.type === 'polyLine' || m.type === 'dimension'
  );
  const lineEndingStart = getUnifiedValue((m) => m.style.lineEndingStart || 'none');
  const lineEndingEnd = getUnifiedValue((m) => m.style.lineEndingEnd || 'none');

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

  const handleStrokeDashChange = (styleType: string) => {
    const width = strokeWidth === MIXED_VALUE ? 2 : (strokeWidth as number);
    const dashArray = dashArrayFor(styleType as LineStyleId, width);
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { dashArray } },
      `Set line style to ${LINE_STYLE_LABELS[styleType as LineStyleId] ?? styleType}`
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
      className="w-64 bg-cad-panel border-l border-cad-border flex flex-col p-3 text-xs select-none overflow-y-auto"
    >
      <div className="flex items-center justify-between pb-1.5 mb-3 border-b border-cad-border">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-gray-200 uppercase tracking-wider">
            Properties
          </span>
          <span
            data-testid="selection-count-badge"
            className="bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-blue-700"
          >
            {selectedMarkups.length === 1 ? '1 markup' : `${selectedMarkups.length} markups`}
          </span>
          <button
            type="button"
            data-testid="prop-lock-btn"
            onClick={toggleLockSelectedMarkups}
            title={isAllLocked ? 'Unlock markup(s)' : 'Lock markup(s)'}
            className={`px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 text-[11px] font-medium border ${
              isAllLocked
                ? 'bg-amber-950/70 text-amber-300 border-amber-600 hover:bg-amber-900'
                : 'bg-cad-dark text-gray-400 border-cad-border hover:text-gray-200'
            }`}
          >
            {isAllLocked ? <Lock size={12} className="text-amber-400" /> : <LockOpen size={12} />}
            <span>{isAllLocked ? 'Locked' : 'Lock'}</span>
          </button>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-gray-400 hover:text-cad-strong hover:bg-cad-hover rounded transition-colors"
          title="Collapse properties"
          data-testid="collapse-properties-btn"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {selectedMarkups.length === 1 &&
          (selectedMarkups[0].type === 'link' ||
            selectedMarkups[0].type === 'fileAttachment' ||
            selectedMarkups[0].type === 'formField') && <InteractiveProperties markup={selectedMarkups[0]} />}
        {/* Color de trazo */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Line color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              data-testid="prop-stroke-color"
              value={strokeColor === MIXED_VALUE ? '#000000' : (strokeColor as string)}
              onChange={(e) => handleStrokeColorChange(e.target.value)}
              className="w-7 h-7 rounded border border-cad-border bg-transparent cursor-pointer p-0"
            />
            <span className="text-gray-300 font-mono text-[11px]">
              {strokeColor === MIXED_VALUE ? MIXED_VALUE : (strokeColor as string)}
            </span>
          </div>
        </div>

        {/* Color de relleno */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-gray-400 font-medium">Fill</label>
            {fillColor && fillColor !== MIXED_VALUE && (
              <button
                type="button"
                onClick={() => handleFillColorChange('')}
                className="text-[10px] text-gray-400 hover:text-rose-400 underline"
              >
                No fill
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              data-testid="prop-fill-color"
              value={fillColor === MIXED_VALUE || !fillColor ? '#ffffff' : (fillColor as string)}
              onChange={(e) => handleFillColorChange(e.target.value)}
              className="w-7 h-7 rounded border border-cad-border bg-transparent cursor-pointer p-0"
            />
            <span className="text-gray-300 font-mono text-[11px]">
              {fillColor === MIXED_VALUE
                ? MIXED_VALUE
                : (fillColor as string) || '(Transparente)'}
            </span>
          </div>
        </div>

        {/* Grosor de trazo */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Line width (pt)</label>
          <input
            type="number"
            data-testid="prop-stroke-width"
            min="1"
            max="50"
            value={strokeWidth === MIXED_VALUE ? '' : (strokeWidth as number)}
            placeholder={strokeWidth === MIXED_VALUE ? MIXED_VALUE : '1'}
            onChange={(e) => handleStrokeWidthChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
          />
        </div>

        {/* Opacidad */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-gray-400 font-medium">Opacity</label>
            <span className="text-gray-400 text-[11px]">
              {opacity === MIXED_VALUE ? MIXED_VALUE : `${Math.round((opacity as number) * 100)}%`}
            </span>
          </div>
          <input
            type="range"
            data-testid="prop-opacity"
            min="0.05"
            max="1"
            step="0.05"
            value={opacity === MIXED_VALUE ? 1 : (opacity as number)}
            onChange={(e) => handleOpacityChange(e.target.value)}
            className="w-full cursor-pointer accent-cad-accent"
          />
        </div>

        {/* Estilo de trazo */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Line style</label>
          <IconPicker<LineStyleId | 'cloud'>
            testId="prop-stroke-style"
            title="Line style"
            value={
              cloudConvertible && selectedMarkups.every((m) => m.type === 'cloud')
                ? 'cloud'
                : strokeDash === MIXED_VALUE
                ? null
                : (strokeDash as LineStyleId)
            }
            options={cloudConvertible ? [...LINE_STYLE_OPTIONS, { value: 'cloud', label: 'Cloud' }] : LINE_STYLE_OPTIONS}
            renderIcon={(id) => <LineStylePreview id={id} width={120} />}
            onChange={handleLineStylePick}
          />
        </div>

        {/* Estilo de nube: tamaño de arco e invertir (como en Revu) */}
        {allCloud && (
          <div className="flex items-end gap-3" data-testid="prop-cloud-style">
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 font-medium">Arc size</label>
              <input
                type="number"
                data-testid="prop-cloud-size"
                min="0.5"
                max="10"
                step="0.25"
                value={cloudSize === MIXED_VALUE ? '' : (cloudSize as number)}
                placeholder={cloudSize === MIXED_VALUE ? MIXED_VALUE : '2'}
                onChange={(e) => handleCloudSizeChange(e.target.value)}
                className="w-20 px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
              />
            </div>
            <label className="flex items-center gap-1.5 text-gray-300 pb-1.5 cursor-pointer">
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
        )}

        {/* Extremos de línea (flechas y formas) */}
        {hasLineMarkup && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 font-medium">Start</label>
              <IconPicker
                testId="prop-line-ending-start"
                title="Start"
                value={lineEndingStart === MIXED_VALUE ? null : (lineEndingStart as LineEndingStyle)}
                options={LINE_ENDING_OPTIONS}
                renderIcon={(id) => <LineEndingPreview ending={id} side="start" width={120} />}
                onChange={(id) => handleLineEndingStartChange(id)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-gray-400 font-medium">End</label>
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

        {/* Tamaño de fuente */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Font size (pt)</label>
          <input
            type="number"
            data-testid="prop-font-size"
            min="6"
            max="72"
            value={fontSize === MIXED_VALUE ? '' : (fontSize as number)}
            placeholder={fontSize === MIXED_VALUE ? MIXED_VALUE : '12'}
            onChange={(e) => handleFontSizeChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
          />
        </div>

        {/* Estado */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Status</label>
          <select
            data-testid="prop-status"
            value={status === MIXED_VALUE ? '' : (status as string)}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
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
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Author</label>
          <input
            type="text"
            data-testid="prop-author"
            value={author === MIXED_VALUE ? '' : (author as string)}
            placeholder={author === MIXED_VALUE ? MIXED_VALUE : 'Author'}
            onChange={(e) => handleAuthorChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
          />
        </div>

        {/* Contenido / Texto */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Comment / Text</label>
          <textarea
            data-testid="prop-text"
            rows={3}
            value={textContent === MIXED_VALUE ? '' : (textContent as string)}
            placeholder={textContent === MIXED_VALUE ? MIXED_VALUE : 'Markup text...'}
            onChange={(e) => handleTextChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent resize-none"
          />
        </div>
      </div>
    </aside>
  );
};
