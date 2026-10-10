import React, { useState } from 'react';
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Square,
  Minus,
  Cloud,
  Type,
  Circle,
  HelpCircle,
} from 'lucide-react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { Markup, MarkupStatus, MarkupType } from '../types/markup';

const STATUS_CONFIG: Record<
  MarkupStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: 'Pendiente',
    bg: 'bg-amber-950/60',
    text: 'text-amber-300',
    border: 'border-amber-700',
  },
  accepted: {
    label: 'Aceptado',
    bg: 'bg-emerald-950/60',
    text: 'text-emerald-300',
    border: 'border-emerald-700',
  },
  rejected: {
    label: 'Rechazado',
    bg: 'bg-rose-950/60',
    text: 'text-rose-300',
    border: 'border-rose-700',
  },
  completed: {
    label: 'Completado',
    bg: 'bg-blue-950/60',
    text: 'text-blue-300',
    border: 'border-blue-700',
  },
};

function getMarkupIcon(type: MarkupType) {
  switch (type) {
    case 'rectangle':
      return <Square size={14} className="text-orange-400" />;
    case 'line':
      return <Minus size={14} className="text-blue-400" />;
    case 'cloud':
    case 'cloudPlus':
      return <Cloud size={14} className="text-emerald-400" />;
    case 'text':
    case 'callout':
      return <Type size={14} className="text-purple-400" />;
    case 'circle':
      return <Circle size={14} className="text-yellow-400" />;
    default:
      return <HelpCircle size={14} className="text-gray-400" />;
  }
}

export const MarkupsList: React.FC = () => {
  const {
    markups,
    selectedMarkupIds,
    selectMarkup,
    deleteMarkup,
    deleteSelectedMarkups,
    updateMarkupStatus,
    updateMarkup,
  } = useMarkupStore();

  const { currentPageIndex, setCurrentPage } = useDocumentStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [filterPageOnly, setFilterPageOnly] = useState(false);

  const displayedMarkups = filterPageOnly
    ? markups.filter((m) => m.pageIndex === currentPageIndex)
    : markups;

  const handleRowClick = (markup: Markup, e: React.MouseEvent) => {
    // Si la marca pertenece a otra página, saltamos automáticamente
    if (markup.pageIndex !== currentPageIndex) {
      setCurrentPage(markup.pageIndex);
    }
    selectMarkup(markup.id, e.ctrlKey || e.metaKey);
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <section
      data-testid="markups-list-panel"
      className="bg-cad-panel border-t border-cad-border flex flex-col transition-all duration-200 select-none z-10"
      style={{ height: isExpanded ? '200px' : '32px' }}
    >
      {/* Barra de cabecera del panel de marcas */}
      <div className="h-8 bg-cad-dark px-3 flex items-center justify-between text-xs font-medium border-b border-cad-border">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-1.5 text-gray-300 hover:text-white"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span className="font-semibold tracking-wide uppercase">
              Lista de Marcas ({displayedMarkups.length})
            </span>
          </button>

          {isExpanded && (
            <label className="flex items-center space-x-1.5 text-gray-400 hover:text-gray-200 cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={filterPageOnly}
                onChange={(e) => setFilterPageOnly(e.target.checked)}
                className="rounded bg-cad-subtle border-cad-border text-blue-500 focus:ring-0"
              />
              <span>Solo pág. actual</span>
            </label>
          )}
        </div>

        {isExpanded && (
          <div className="flex items-center space-x-2">
            {selectedMarkupIds.length > 0 && (
              <button
                onClick={deleteSelectedMarkups}
                className="flex items-center space-x-1 px-2 py-0.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded border border-rose-700 text-xs transition-colors"
                title="Eliminar marcas seleccionadas (Supr)"
              >
                <Trash2 size={12} />
                <span>Eliminar ({selectedMarkupIds.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Contenedor de la Tabla */}
      {isExpanded && (
        <div className="flex-1 overflow-auto bg-cad-panel">
          {displayedMarkups.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-500 italic">
              No hay anotaciones registradas. Selecciona una herramienta para comenzar a marcar.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-cad-subtle text-gray-300 sticky top-0 border-b border-cad-border z-10">
                <tr>
                  <th className="py-1 px-2.5 w-8 font-medium"></th>
                  <th className="py-1 px-2 font-medium w-28">Tipo</th>
                  <th className="py-1 px-2 font-medium min-w-[160px]">Texto / Comentario</th>
                  <th className="py-1 px-2 font-medium w-32">Autor</th>
                  <th className="py-1 px-2 font-medium w-32">Fecha</th>
                  <th className="py-1 px-2 font-medium w-20 text-center">Página</th>
                  <th className="py-1 px-2 font-medium w-28 text-center">Estado</th>
                  <th className="py-1 px-2 font-medium w-12 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cad-border/50 text-gray-200">
                {displayedMarkups.map((markup) => {
                  const isSelected = selectedMarkupIds.includes(markup.id);
                  const statusInfo = STATUS_CONFIG[markup.status];

                  return (
                    <tr
                      key={markup.id}
                      onClick={(e) => handleRowClick(markup, e)}
                      data-testid={`markup-row-${markup.id}`}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cad-accent/30 hover:bg-cad-accent/40 font-medium'
                          : 'hover:bg-cad-hover/60'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-1 px-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => selectMarkup(markup.id, true)}
                          className="rounded bg-cad-dark border-cad-border text-blue-500 focus:ring-0"
                        />
                      </td>

                      {/* Tipo */}
                      <td className="py-1 px-2 flex items-center space-x-1.5 capitalize">
                        {getMarkupIcon(markup.type)}
                        <span>{markup.type}</span>
                      </td>

                      {/* Texto / Comentario editable */}
                      <td className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={markup.text || ''}
                          placeholder="Sin comentario..."
                          onChange={(e) => updateMarkup(markup.id, { text: e.target.value })}
                          className="w-full bg-transparent hover:bg-cad-dark/50 focus:bg-cad-dark px-1.5 py-0.5 rounded border border-transparent focus:border-cad-border text-xs text-gray-200 outline-none truncate"
                        />
                      </td>

                      {/* Autor */}
                      <td className="py-1 px-2 text-gray-400 truncate">{markup.author}</td>

                      {/* Fecha */}
                      <td className="py-1 px-2 text-gray-400 font-mono text-[11px]">
                        {formatDate(markup.createdAt)}
                      </td>

                      {/* Página */}
                      <td className="py-1 px-2 text-center font-mono text-gray-300">
                        {markup.pageIndex + 1}
                      </td>

                      {/* Estado con dropdown interactivo */}
                      <td className="py-1 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={markup.status}
                          onChange={(e) =>
                            updateMarkupStatus(markup.id, e.target.value as MarkupStatus)
                          }
                          className={`text-[11px] font-medium py-0.5 px-2 rounded border outline-none cursor-pointer ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                        >
                          <option value="pending" className="bg-cad-dark text-amber-300">
                            Pendiente
                          </option>
                          <option value="accepted" className="bg-cad-dark text-emerald-300">
                            Aceptado
                          </option>
                          <option value="rejected" className="bg-cad-dark text-rose-300">
                            Rechazado
                          </option>
                          <option value="completed" className="bg-cad-dark text-blue-300">
                            Completado
                          </option>
                        </select>
                      </td>

                      {/* Acciones */}
                      <td className="py-1 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => deleteMarkup(markup.id)}
                          className="p-1 text-gray-400 hover:text-rose-400 rounded transition-colors"
                          title="Eliminar marca"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
};
