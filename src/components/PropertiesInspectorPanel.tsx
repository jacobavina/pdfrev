import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, ChevronRight } from 'lucide-react';
import { useMarkupStore } from '../store/useMarkupStore';
import { Markup, MarkupStatus, VALID_MARKUP_STATUSES } from '../types/markup';

const STATUS_LABELS: Record<MarkupStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const MIXED_VALUE = '—';

export interface PropertiesInspectorPanelProps {
  defaultCollapsed?: boolean;
}

export const PropertiesInspectorPanel: React.FC<PropertiesInspectorPanelProps> = ({
  defaultCollapsed = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const { markups, selectedMarkupIds, applyPropertiesToMarkups } = useMarkupStore();

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
          className="p-1.5 text-gray-400 hover:text-white hover:bg-cad-hover rounded mb-3 transition-colors"
          title="Expandir propiedades"
          data-testid="expand-properties-btn"
        >
          <SlidersHorizontal size={16} />
        </button>
        <span className="text-[10px] text-gray-500 font-medium rotate-90 whitespace-nowrap mt-4">
          Propiedades
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
            Propiedades
          </span>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 text-gray-400 hover:text-white hover:bg-cad-hover rounded transition-colors"
            title="Colapsar propiedades"
            data-testid="collapse-properties-btn"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div
          data-testid="properties-empty-message"
          className="text-gray-500 italic mt-6 text-center"
        >
          Selecciona una o más marcas para ver y editar sus propiedades.
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
  const strokeDash = getUnifiedValue((m) =>
    m.style.dashArray && m.style.dashArray.length > 0 ? 'dashed' : 'solid'
  );
  const textContent = getUnifiedValue((m) => m.text || '');
  const fontSize = getUnifiedValue((m) => m.style.fontSize ?? 12);
  const status = getUnifiedValue((m) => m.status || 'pending');
  const author = getUnifiedValue((m) => m.author || '');

  // Manejadores atómicos de actualización
  const handleStrokeColorChange = (newColor: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { strokeColor: newColor } },
      `Cambiar color de trazo a ${newColor}`
    );
  };

  const handleFillColorChange = (newColor: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { fillColor: newColor } },
      newColor ? `Cambiar relleno a ${newColor}` : 'Quitar relleno'
    );
  };

  const handleStrokeWidthChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed < 1) return;
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { strokeWidth: Math.max(1, Math.min(parsed, 50)) } },
      `Cambiar grosor a ${parsed}px`
    );
  };

  const handleOpacityChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed)) return;
    const clamped = Math.max(0.05, Math.min(parsed, 1));
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { opacity: clamped } },
      `Cambiar opacidad a ${Math.round(clamped * 100)}%`
    );
  };

  const handleStrokeDashChange = (styleType: string) => {
    const dashArray = styleType === 'dashed' ? [6, 4] : undefined;
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { dashArray } },
      `Cambiar trazo a ${styleType}`
    );
  };

  const handleFontSizeChange = (valStr: string) => {
    const parsed = parseFloat(valStr);
    if (isNaN(parsed) || parsed < 6) return;
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { style: { fontSize: Math.max(6, Math.min(parsed, 72)) } },
      `Cambiar tamaño de fuente a ${parsed}pt`
    );
  };

  const handleTextChange = (newText: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { text: newText },
      `Editar texto de marca`
    );
  };

  const handleStatusChange = (newStatus: string) => {
    if (!VALID_MARKUP_STATUSES.includes(newStatus as MarkupStatus)) return;
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { status: newStatus as MarkupStatus },
      `Cambiar estado a ${newStatus}`
    );
  };

  const handleAuthorChange = (newAuthor: string) => {
    applyPropertiesToMarkups(
      selectedMarkupIds,
      { author: newAuthor },
      `Cambiar autor a ${newAuthor}`
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
            Propiedades
          </span>
          <span
            data-testid="selection-count-badge"
            className="bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-blue-700"
          >
            {selectedMarkups.length === 1 ? '1 marca' : `${selectedMarkups.length} marcas`}
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-gray-400 hover:text-white hover:bg-cad-hover rounded transition-colors"
          title="Colapsar propiedades"
          data-testid="collapse-properties-btn"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Color de trazo */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Color de Trazo</label>
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
            <label className="text-gray-400 font-medium">Relleno</label>
            {fillColor && fillColor !== MIXED_VALUE && (
              <button
                type="button"
                onClick={() => handleFillColorChange('')}
                className="text-[10px] text-gray-400 hover:text-rose-400 underline"
              >
                Sin relleno
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
          <label className="text-gray-400 font-medium">Grosor de Trazo (px)</label>
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
            <label className="text-gray-400 font-medium">Opacidad</label>
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
          <label className="text-gray-400 font-medium">Estilo de Línea</label>
          <select
            data-testid="prop-stroke-style"
            value={strokeDash === MIXED_VALUE ? '' : (strokeDash as string)}
            onChange={(e) => handleStrokeDashChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
          >
            {strokeDash === MIXED_VALUE && <option value="">{MIXED_VALUE}</option>}
            <option value="solid">Continuo</option>
            <option value="dashed">Discontinuo</option>
          </select>
        </div>

        {/* Tamaño de fuente */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Tamaño de Fuente (pt)</label>
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
          <label className="text-gray-400 font-medium">Estado de Revisión</label>
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
          <label className="text-gray-400 font-medium">Autor</label>
          <input
            type="text"
            data-testid="prop-author"
            value={author === MIXED_VALUE ? '' : (author as string)}
            placeholder={author === MIXED_VALUE ? MIXED_VALUE : 'Autor'}
            onChange={(e) => handleAuthorChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
          />
        </div>

        {/* Contenido / Texto */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 font-medium">Comentario / Texto</label>
          <textarea
            data-testid="prop-text"
            rows={3}
            value={textContent === MIXED_VALUE ? '' : (textContent as string)}
            placeholder={textContent === MIXED_VALUE ? MIXED_VALUE : 'Texto de la marca...'}
            onChange={(e) => handleTextChange(e.target.value)}
            className="px-2 py-1 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent resize-none"
          />
        </div>
      </div>
    </aside>
  );
};
