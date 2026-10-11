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
  Highlighter,
  StickyNote,
  Briefcase,
} from 'lucide-react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolChestStore } from '../store/useToolChestStore';
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
    case 'stickyNote':
      return <StickyNote size={14} className="text-amber-400" />;
    case 'highlightVector':
    case 'highlight':
    case 'highlightText':
      return <Highlighter size={14} className="text-yellow-400" />;
    default:
      return <HelpCircle size={14} className="text-gray-400" />;
  }
}

import { filterAndSortMarkups, MarkupSortField, SortDirection } from '../utils/markupFilterSort';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MarkupType | 'all'>('all');
  const [filterAuthor, setFilterAuthor] = useState<string | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<MarkupStatus | 'all'>('all');
  const [sortField, setSortField] = useState<MarkupSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    markup: Markup;
  } | null>(null);

  React.useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const uniqueAuthors = React.useMemo(() => {
    const set = new Set<string>();
    markups.forEach((m) => {
      if (m.author) set.add(m.author);
    });
    return Array.from(set).sort();
  }, [markups]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterType !== 'all' ||
    filterAuthor !== 'all' ||
    filterStatus !== 'all' ||
    filterPageOnly ||
    sortField !== null;

  const resetFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterAuthor('all');
    setFilterStatus('all');
    setFilterPageOnly(false);
    setSortField(null);
    setSortDirection('asc');
  };

  const handleSort = (field: MarkupSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const displayedMarkups = React.useMemo(() => {
    return filterAndSortMarkups(
      markups,
      {
        searchQuery,
        type: filterType,
        author: filterAuthor,
        status: filterStatus,
        pageIndex: filterPageOnly ? currentPageIndex : 'all',
      },
      {
        field: sortField,
        direction: sortDirection,
      }
    );
  }, [
    markups,
    searchQuery,
    filterType,
    filterAuthor,
    filterStatus,
    filterPageOnly,
    currentPageIndex,
    sortField,
    sortDirection,
  ]);

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

  const renderSortIndicator = (field: MarkupSortField) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1 text-cad-accent font-bold" data-testid={`sort-indicator-${field}`}>
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    );
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

      {/* Barra de herramientas de filtros y ordenación (sub-contenedor dedicado en modo expandido) */}
      {isExpanded && (
        <div
          data-testid="markups-toolbar"
          className="bg-cad-panel/95 px-3 py-1 flex flex-wrap items-center gap-2 border-b border-cad-border text-xs"
        >
          {/* Búsqueda rápida por texto o autor (type="search" para no interferir con input[type="text"]) */}
          <input
            type="search"
            data-testid="markups-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar marcas..."
            className="px-2 py-0.5 bg-cad-dark border border-cad-border rounded text-gray-200 placeholder-gray-500 text-xs focus:outline-none focus:border-cad-accent w-36"
          />

          {/* Filtro por tipo */}
          <select
            data-testid="markups-filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as MarkupType | 'all')}
            className="px-2 py-0.5 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
          >
            <option value="all">Todos los tipos</option>
            <option value="rectangle">Rectángulo</option>
            <option value="circle">Círculo</option>
            <option value="line">Línea</option>
            <option value="cloud">Nube</option>
            <option value="cloudPlus">Cloud+</option>
            <option value="text">Texto</option>
            <option value="callout">Callout</option>
            <option value="stickyNote">Nota adhesiva</option>
            <option value="highlightVector">Resaltador vectorial</option>
            <option value="highlightText">Resaltador de texto</option>
          </select>

          {/* Filtro por autor */}
          <select
            data-testid="markups-filter-author"
            value={filterAuthor}
            onChange={(e) => setFilterAuthor(e.target.value)}
            className="px-2 py-0.5 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent max-w-[130px] truncate"
          >
            <option value="all">Todos los autores</option>
            {uniqueAuthors.map((auth) => (
              <option key={auth} value={auth}>
                {auth}
              </option>
            ))}
          </select>

          {/* Filtro por estado */}
          <select
            data-testid="markups-filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as MarkupStatus | 'all')}
            className="px-2 py-0.5 bg-cad-dark border border-cad-border rounded text-gray-200 text-xs focus:outline-none focus:border-cad-accent"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
            <option value="completed">Completado</option>
          </select>

          {/* Botón reset de filtros */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              data-testid="markups-reset-filters-btn"
              className="px-2 py-0.5 bg-cad-hover/70 hover:bg-cad-hover text-gray-300 hover:text-white rounded text-xs transition-colors"
              title="Restablecer todos los filtros"
            >
              Restablecer
            </button>
          )}

          {/* Indicador de orden actual */}
          <span className="text-gray-500 ml-auto text-[11px] font-mono">
            Orden: <span className="text-gray-300 capitalize">{sortField ?? 'natural'}</span> {sortField ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </span>
        </div>
      )}

      {/* Contenedor de la Tabla */}
      {isExpanded && (
        <div className="flex-1 overflow-auto bg-cad-panel">
          {displayedMarkups.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-500 italic" data-testid="markups-empty-message">
              No hay anotaciones que coincidan con los filtros aplicados.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-cad-subtle text-gray-300 sticky top-0 border-b border-cad-border z-10">
                <tr>
                  <th className="py-1 px-2.5 w-8 font-medium"></th>
                  <th
                    onClick={() => handleSort('type')}
                    className="py-1 px-2 font-medium w-28 cursor-pointer hover:text-white select-none"
                    title="Ordenar por tipo"
                  >
                    Tipo {renderSortIndicator('type')}
                  </th>
                  <th
                    onClick={() => handleSort('text')}
                    className="py-1 px-2 font-medium min-w-[160px] cursor-pointer hover:text-white select-none"
                    title="Ordenar por texto / comentario"
                  >
                    Texto / Comentario {renderSortIndicator('text')}
                  </th>
                  <th
                    onClick={() => handleSort('author')}
                    className="py-1 px-2 font-medium w-32 cursor-pointer hover:text-white select-none"
                    title="Ordenar por autor"
                  >
                    Autor {renderSortIndicator('author')}
                  </th>
                  <th
                    onClick={() => handleSort('createdAt')}
                    className="py-1 px-2 font-medium w-32 cursor-pointer hover:text-white select-none"
                    title="Ordenar por fecha"
                  >
                    Fecha {renderSortIndicator('createdAt')}
                  </th>
                  <th
                    onClick={() => handleSort('pageIndex')}
                    className="py-1 px-2 font-medium w-20 text-center cursor-pointer hover:text-white select-none"
                    title="Ordenar por página"
                  >
                    Página {renderSortIndicator('pageIndex')}
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="py-1 px-2 font-medium w-28 text-center cursor-pointer hover:text-white select-none"
                    title="Ordenar por estado"
                  >
                    Estado {renderSortIndicator('status')}
                  </th>
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
                      onContextMenu={(e) => {
                        e.preventDefault();
                        selectMarkup(markup.id, false);
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          markup,
                        });
                      }}
                      data-testid={`markup-row-${markup.id}`}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cad-accent/30 hover:bg-cad-accent/40 font-medium'
                          : 'hover:bg-cad-hover/60'
                      } ${markup.groupId ? 'border-l-2 border-l-purple-500/80' : ''}`}
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
                      <td className="py-1 px-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={async () => {
                            const store = useToolChestStore.getState();
                            const activePaletteId = store.activePaletteId || store.palettes[0]?.id;
                            if (activePaletteId) {
                              await store.createToolFromMarkup(activePaletteId, markup);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-blue-400 rounded transition-colors mr-1"
                          title="Añadir a Tool Chest"
                          data-testid={`add-to-toolchest-btn-${markup.id}`}
                        >
                          <Briefcase size={13} />
                        </button>
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

      {/* Menú contextual: Añadir a Tool Chest */}
      {contextMenu && (
        <div
          data-testid="markups-list-context-menu"
          className="fixed z-50 bg-cad-panel border border-cad-border shadow-2xl rounded py-1 text-xs text-gray-200 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            data-testid="context-menu-add-to-toolchest"
            onClick={async () => {
              const store = useToolChestStore.getState();
              const activePaletteId = store.activePaletteId || store.palettes[0]?.id;
              if (activePaletteId) {
                await store.createToolFromMarkup(activePaletteId, contextMenu.markup);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-cad-hover flex items-center space-x-2 text-gray-200 hover:text-white transition-colors cursor-pointer"
          >
            <Briefcase size={13} className="text-blue-400" />
            <span>Añadir a Tool Chest</span>
          </button>
        </div>
      )}
    </section>
  );
};
