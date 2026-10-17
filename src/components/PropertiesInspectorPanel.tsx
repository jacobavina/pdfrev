import React, { useMemo } from 'react';
import { ChevronRight, Lock, LockOpen } from 'lucide-react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useRightPanel } from '../store/useUiStore';
import { InteractiveProperties } from './markup/InteractiveProperties';
import { StyleSection } from './shell/StyleSection';
import { Markup, MarkupStatus, VALID_MARKUP_STATUSES } from '../types/markup';

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
  const [isCollapsed, setIsCollapsed] = useRightPanel('properties', defaultCollapsed);
  const { markups, selectedMarkupIds, applyPropertiesToMarkups, toggleLockSelectedMarkups } =
    useMarkupStore();


  const selectedMarkups = useMemo(() => {
    return markups.filter((m) => selectedMarkupIds.includes(m.id));
  }, [markups, selectedMarkupIds]);

  if (isCollapsed) {
    // Plegado: lo abre el riel derecho (ADR-0044)
    return <aside data-testid="properties-inspector-panel" data-collapsed="true" hidden />;
  }

  if (selectedMarkups.length === 0) {
    return (
      <aside
        data-testid="properties-inspector-panel"
        data-collapsed="false"
        className="w-[268px] bg-cad-panel border-l border-cad-border flex flex-col text-xs select-none min-h-0"
      >
        <div className="panel-header">
          <div className="flex items-center gap-2 min-w-0">
            <span className="ui-panel-title">Properties</span>
            {/* Sin selección el estilo es el de las marcas nuevas (ADR-0065: lo dice la cabecera, no un chip) */}
            <span data-testid="style-target-badge" className="ui-badge" title="Changes apply to the next markups you draw">
              New markups
            </span>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="ui-btn !h-7 !w-7 !p-0"
            title="Collapse properties"
            data-testid="collapse-properties-btn"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {/* Una sola fuente de verdad visual del estilo (ADR-0064): sin selección, el de las marcas nuevas */}
        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll">
          <StyleSection />
          <div
            data-testid="properties-empty-message"
            className="text-gray-500 px-4 py-3 border-t border-cad-border leading-relaxed"
          >
            Select one or more markups to edit their status, author and comment.
          </div>
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

  // El estilo lo edita StyleSection (ADR-0064); aquí quedan los datos de revisión y el valor de las distancias
  const textContent = getUnifiedValue((m) => m.text || '');
  const status = getUnifiedValue((m) => m.status || 'pending');
  const author = getUnifiedValue((m) => m.author || '');
  const isAllLocked = selectedMarkups.length > 0 && selectedMarkups.every((m) => Boolean(m.locked));
  // Posición del valor de las distancias ("Caption Style" de Acrobat)
  const allLengths = selectedMarkups.length > 0 && selectedMarkups.every((m) => m.type === 'length');
  const captionStyle = getUnifiedValue((m) => (m.customFields?.captionStyle === 'top' ? 'top' : 'inline'));

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
      className="w-[268px] bg-cad-panel border-l border-cad-border flex flex-col text-xs select-none overflow-y-auto"
    >
      <div className="panel-header sticky top-0 z-10">
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
            className={`ui-btn !h-6 !px-1.5 !text-2xs ${isAllLocked ? '!text-amber-500' : ''}`}
          >
            {isAllLocked ? <Lock size={16} className="text-amber-400" /> : <LockOpen size={16} />}
            <span>{isAllLocked ? 'Locked' : 'Lock'}</span>
          </button>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="ui-btn !h-7 !w-7 !p-0"
          title="Collapse properties"
          data-testid="collapse-properties-btn"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {selectedMarkups.length === 1 &&
        (selectedMarkups[0].type === 'link' ||
          selectedMarkups[0].type === 'fileAttachment' ||
          selectedMarkups[0].type === 'formField') && (
          <div className="px-3 pt-3">
            <InteractiveProperties markup={selectedMarkups[0]} />
          </div>
        )}
      {/* Estilo (ADR-0064): la antigua franja de la cinta, única fuente de verdad visual */}
      <StyleSection />
      <div className="px-3 py-3 space-y-1.5 border-t border-cad-border">
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
