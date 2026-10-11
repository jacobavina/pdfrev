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
  Check,
  Plus,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolChestStore } from '../store/useToolChestStore';

import {
  Markup,
  MarkupStatus,
  MarkupType,
  BbxCustomColumn,
  BbxCustomColumnType,
  CANONICAL_CUSTOM_COLUMN_TYPES,
} from '../types/markup';
import {
  filterAndSortMarkups,
  MarkupSortField,
  SortDirection,
} from '../utils/markupFilterSort';
import {
  parseExpression,
  evaluateDocumentCustomColumns,
} from '../core/columns';

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
  cancelled: {
    label: 'Cancelado',
    bg: 'bg-zinc-800/60',
    text: 'text-zinc-400',
    border: 'border-zinc-600',
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

export const MarkupsList: React.FC = () => {
  const {
    markups,
    selectedMarkupIds,
    selectMarkup,
    deleteMarkup,
    deleteSelectedMarkups,
    updateMarkupStatus,
    updateMarkup,
    updateMarkupCustomField,
  } = useMarkupStore();

  const {
    currentPageIndex,
    setCurrentPage,
    customColumns,
    addCustomColumn,
    removeCustomColumn,
    fileName,
  } = useDocumentStore();

  const [isExpanded, setIsExpanded] = useState(true);
  const [filterPageOnly, setFilterPageOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MarkupType | 'all'>('all');
  const [filterAuthor, setFilterAuthor] = useState<string | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<MarkupStatus | 'all'>('all');
  const [sortField, setSortField] = useState<MarkupSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estado para modal de creación de columnas personalizadas
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<BbxCustomColumnType>('text');
  const [newColOptions, setNewColOptions] = useState('');
  const [newColExpr, setNewColExpr] = useState('');

  // Estado para modal de confirmación de eliminación de columna
  const [columnToDelete, setColumnToDelete] = useState<BbxCustomColumn | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    markup: Markup;
  } | null>(null);

  React.useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setIsAddColumnModalOpen(false);
        setColumnToDelete(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const uniqueAuthors = React.useMemo(() => {
    const set = new Set<string>();
    markups.forEach((m) => {
      if (m.author) set.add(m.author);
    });
    return Array.from(set).sort();
  }, [markups]);

  // Matriz de evaluación precomputada para columnas calculadas
  const evaluationMatrix = React.useMemo(() => {
    return evaluateDocumentCustomColumns(markups, customColumns || []);
  }, [markups, customColumns]);

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
        customColumns,
        evaluationMatrix,
      },
      {
        field: sortField,
        direction: sortDirection,
        customColumns,
        evaluationMatrix,
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
    customColumns,
    evaluationMatrix,
  ]);

  // Validación en tiempo real de la fórmula ingresada en el modal
  const formulaValidation = React.useMemo(() => {
    if (newColType !== 'formula') {
      return { ok: true, message: '' };
    }
    const trimmed = newColExpr.trim();
    if (!trimmed) {
      return { ok: false, message: 'La expresión no puede estar vacía' };
    }
    const res = parseExpression(trimmed);
    if (!res.ok) {
      return { ok: false, message: res.message };
    }
    return { ok: true, message: 'Expresión sintácticamente correcta' };
  }, [newColType, newColExpr]);

  const handleCreateColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newColName.trim();
    if (!trimmedName) return;

    if (newColType === 'formula' && !formulaValidation.ok) {
      return;
    }

    const slug =
      trimmedName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 30) || 'col';

    const baseId = slug;
    let id = baseId;
    let counter = 1;
    while (customColumns?.some((c) => c.id === id)) {
      counter++;
      id = `${baseId}_${counter}`;
    }

    let opciones: string[] | undefined;
    if (newColType === 'choice') {
      opciones = newColOptions
        .split(',')
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);
    }

    const newCol: BbxCustomColumn = {
      id,
      nombre: trimmedName,
      tipo: newColType,
      opciones: opciones && opciones.length > 0 ? opciones : undefined,
      expresion: newColType === 'formula' ? newColExpr.trim() : undefined,
    };

    addCustomColumn(newCol);
    setIsAddColumnModalOpen(false);
    setNewColName('');
    setNewColType('text');
    setNewColOptions('');
    setNewColExpr('');
  };

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

  const handleExportCsv = async () => {
    try {
      const { buildCsvContent, saveExportFileWithDialog } = await import('../services/exportService');
      const defaultBase = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'marcas';
      const defaultName = `${defaultBase}-marcas.csv`;
      const bytes = buildCsvContent(displayedMarkups, customColumns, evaluationMatrix);
      await saveExportFileWithDialog(defaultName, 'csv', bytes);
    } catch (err) {
      console.error('Error al exportar CSV:', err);
    }
  };

  const handleExportPdfReport = async () => {
    try {
      const { buildPdfReportContent, saveExportFileWithDialog } = await import('../services/exportService');
      const defaultBase = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'reporte';
      const defaultName = `${defaultBase}-reporte-marcas.pdf`;
      const bytes = await buildPdfReportContent(fileName || 'Documento PDF', displayedMarkups);
      await saveExportFileWithDialog(defaultName, 'pdf', bytes);
    } catch (err) {
      console.error('Error al generar Reporte PDF:', err);
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
            <button
              data-testid="export-csv-button"
              onClick={handleExportCsv}
              className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded border border-emerald-700 text-xs transition-colors"
              title="Exportar marcas visibles a CSV (RFC 4180)"
            >
              <FileSpreadsheet size={12} />
              <span>CSV</span>
            </button>

            <button
              data-testid="export-pdf-report-button"
              onClick={handleExportPdfReport}
              className="flex items-center space-x-1 px-2 py-0.5 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded border border-purple-700 text-xs transition-colors"
              title="Generar Reporte Resumen en PDF"
            >
              <FileText size={12} />
              <span>Reporte PDF</span>
            </button>

            <button
              data-testid="add-custom-column-button"
              onClick={() => {
                setNewColName('');
                setNewColType('text');
                setNewColOptions('');
                setNewColExpr('');
                setIsAddColumnModalOpen(true);
              }}
              className="flex items-center space-x-1 px-2 py-0.5 bg-blue-900/60 hover:bg-blue-800 text-blue-200 rounded border border-blue-700 text-xs transition-colors"
              title="Añadir columna personalizada"
            >
              <Plus size={12} />
              <span>+ Columna</span>
            </button>

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

      {/* Barra de herramientas de filtros y ordenación */}
      {isExpanded && (
        <div
          data-testid="markups-toolbar"
          className="bg-cad-panel/95 px-3 py-1 flex flex-wrap items-center gap-2 border-b border-cad-border text-xs"
        >
          {/* Búsqueda rápida por texto o autor */}
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
            <option value="cancelled">Cancelado</option>
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

                  {/* Cabeceras dinámicas de Columnas Personalizadas (P2-C.3) */}
                  {customColumns?.map((col) => (
                    <th
                      key={col.id}
                      data-testid={`custom-column-header-${col.id}`}
                      onClick={() => handleSort(`custom:${col.id}`)}
                      className="py-1 px-2 font-medium min-w-[110px] cursor-pointer hover:text-white select-none group"
                      title={`Ordenar por ${col.nombre} (${col.tipo})`}
                    >
                      <div className="flex items-center justify-between space-x-1">
                        <span className="truncate">
                          {col.nombre} {renderSortIndicator(`custom:${col.id}`)}
                        </span>
                        <button
                          data-testid={`delete-column-btn-${col.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setColumnToDelete(col);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 text-gray-500 transition-opacity"
                          title={`Eliminar columna ${col.nombre}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </th>
                  ))}

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
                        if (!selectedMarkupIds.includes(markup.id)) {
                          selectMarkup(markup.id, false);
                        }
                        const menuWidth = 180;
                        const menuHeight = 220;
                        const posX = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
                        const posY =
                          e.clientY + menuHeight > window.innerHeight
                            ? Math.max(8, e.clientY - menuHeight)
                            : Math.max(8, e.clientY);
                        setContextMenu({
                          x: posX,
                          y: posY,
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
                          <option value="cancelled" className="bg-cad-dark text-zinc-400">
                            Cancelado
                          </option>
                        </select>
                      </td>

                      {/* Celdas de Columnas Personalizadas (P2-C.3) */}
                      {customColumns?.map((col) => {
                        const cellTestId = `custom-column-cell-${markup.id}-${col.id}`;

                        if (col.tipo === 'formula') {
                          const evalRes = evaluationMatrix.get(markup.id)?.get(col.id);
                          let content: React.ReactNode;
                          if (!evalRes) {
                            content = <span className="text-gray-500 italic">—</span>;
                          } else if (evalRes.ok) {
                            content = (
                              <span className="font-mono text-emerald-400 font-medium">
                                {evalRes.value}
                              </span>
                            );
                          } else {
                            content = (
                              <span
                                className="text-rose-400 font-mono text-[11px] bg-rose-950/60 px-1 py-0.5 rounded border border-rose-800"
                                title={evalRes.message}
                                data-testid={`cell-error-${evalRes.error}`}
                              >
                                #{evalRes.error}!
                              </span>
                            );
                          }
                          return (
                            <td
                              key={col.id}
                              data-testid={cellTestId}
                              className="py-1 px-2 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {content}
                            </td>
                          );
                        }

                        if (col.tipo === 'choice') {
                          const val = (markup.customFields?.[col.id] as string) || '';
                          return (
                            <td
                              key={col.id}
                              data-testid={cellTestId}
                              className="py-1 px-2 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <select
                                value={val}
                                onChange={(e) =>
                                  updateMarkupCustomField(markup.id, col.id, e.target.value)
                                }
                                className="bg-cad-dark border border-cad-border rounded px-1.5 py-0.5 text-xs text-gray-200 outline-none w-full"
                              >
                                <option value="">—</option>
                                {col.opciones?.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }

                        if (col.tipo === 'number') {
                          const val =
                            markup.customFields?.[col.id] !== undefined
                              ? markup.customFields[col.id]
                              : '';
                          return (
                            <td
                              key={col.id}
                              data-testid={cellTestId}
                              className="py-1 px-2 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="number"
                                value={val}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  const num = raw === '' ? undefined : Number(raw);
                                  updateMarkupCustomField(markup.id, col.id, num);
                                }}
                                placeholder="—"
                                className="w-full bg-transparent hover:bg-cad-dark/50 focus:bg-cad-dark px-1.5 py-0.5 rounded border border-transparent focus:border-cad-border text-xs text-right text-gray-200 outline-none font-mono"
                              />
                            </td>
                          );
                        }

                        // tipo text
                        const val = (markup.customFields?.[col.id] as string) || '';
                        return (
                          <td
                            key={col.id}
                            data-testid={cellTestId}
                            className="py-1 px-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={val}
                              onChange={(e) =>
                                updateMarkupCustomField(markup.id, col.id, e.target.value)
                              }
                              placeholder="—"
                              className="w-full bg-transparent hover:bg-cad-dark/50 focus:bg-cad-dark px-1.5 py-0.5 rounded border border-transparent focus:border-cad-border text-xs text-gray-200 outline-none"
                            />
                          </td>
                        );
                      })}

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

      {/* Modal para Crear Columna Personalizada (P2-C.3) */}
      {isAddColumnModalOpen && (
        <div
          data-testid="add-column-modal"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsAddColumnModalOpen(false)}
        >
          <div
            className="bg-cad-panel border border-cad-border rounded-lg shadow-2xl w-full max-w-md p-4 text-xs text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-3">
              Crear Nueva Columna Personalizada
            </h3>
            <form onSubmit={handleCreateColumn} className="space-y-3">
              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Nombre de la columna
                </label>
                <input
                  type="text"
                  data-testid="column-name-input"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="ej. Longitud, Costo estimado, Categoría..."
                  required
                  className="w-full px-2.5 py-1.5 bg-cad-dark border border-cad-border rounded text-gray-200 focus:outline-none focus:border-cad-accent"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Tipo de columna
                </label>
                <select
                  data-testid="column-type-select"
                  value={newColType}
                  onChange={(e) =>
                    setNewColType(e.target.value as BbxCustomColumnType)
                  }
                  className="w-full px-2.5 py-1.5 bg-cad-dark border border-cad-border rounded text-gray-200 focus:outline-none focus:border-cad-accent"
                >
                  {CANONICAL_CUSTOM_COLUMN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'text' && 'Texto (text)'}
                      {t === 'number' && 'Número (number)'}
                      {t === 'choice' && 'Opción / Desplegable (choice)'}
                      {t === 'formula' && 'Calculada / Fórmula (formula)'}
                    </option>
                  ))}
                </select>
              </div>

              {newColType === 'choice' && (
                <div>
                  <label className="block text-gray-400 mb-1 font-medium">
                    Opciones (separadas por comas)
                  </label>
                  <input
                    type="text"
                    data-testid="column-options-input"
                    value={newColOptions}
                    onChange={(e) => setNewColOptions(e.target.value)}
                    placeholder="ej. Alta, Media, Baja"
                    className="w-full px-2.5 py-1.5 bg-cad-dark border border-cad-border rounded text-gray-200 focus:outline-none focus:border-cad-accent"
                  />
                </div>
              )}

              {newColType === 'formula' && (
                <div>
                  <label className="block text-gray-400 mb-1 font-medium">
                    Expresión matemática
                  </label>
                  <input
                    type="text"
                    data-testid="column-expression-input"
                    value={newColExpr}
                    onChange={(e) => setNewColExpr(e.target.value)}
                    placeholder="ej. strokeWidth * 2.5 + {otra_columna}"
                    className="w-full px-2.5 py-1.5 bg-cad-dark border border-cad-border rounded text-gray-200 font-mono focus:outline-none focus:border-cad-accent"
                  />
                  {!formulaValidation.ok && newColExpr.trim().length > 0 && (
                    <p
                      data-testid="formula-syntax-error"
                      className="text-rose-400 text-[11px] mt-1 flex items-center space-x-1"
                    >
                      <AlertTriangle size={12} className="inline mr-1" />
                      <span>{formulaValidation.message}</span>
                    </p>
                  )}
                  {formulaValidation.ok && newColExpr.trim().length > 0 && (
                    <p className="text-emerald-400 text-[11px] mt-1">
                      ✓ Expresión válida
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-cad-border">
                <button
                  type="button"
                  data-testid="cancel-column-button"
                  onClick={() => setIsAddColumnModalOpen(false)}
                  className="px-3 py-1 bg-cad-hover text-gray-300 hover:text-white rounded transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  data-testid="save-column-button"
                  disabled={
                    !newColName.trim() ||
                    (newColType === 'formula' && !formulaValidation.ok)
                  }
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
                >
                  Guardar Columna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación de Columna */}
      {columnToDelete && (
        <div
          data-testid="delete-column-confirmation-modal"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setColumnToDelete(null)}
        >
          <div
            className="bg-cad-panel border border-cad-border rounded-lg shadow-2xl w-full max-w-sm p-4 text-xs text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-rose-300 mb-2 flex items-center space-x-1.5">
              <AlertTriangle size={16} className="text-rose-400" />
              <span>Eliminar Columna Personalizada</span>
            </h3>
            <p className="text-gray-300 mb-4 leading-relaxed">
              ¿Estás seguro de que deseas eliminar la columna{' '}
              <strong className="text-white">"{columnToDelete.nombre}"</strong>?
              Se eliminarán también todos los valores asociados en las marcas del
              documento.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                data-testid="cancel-delete-column-btn"
                onClick={() => setColumnToDelete(null)}
                className="px-3 py-1 bg-cad-hover text-gray-300 hover:text-white rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                data-testid="confirm-delete-column-btn"
                onClick={() => {
                  removeCustomColumn(columnToDelete.id);
                  setColumnToDelete(null);
                }}
                className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white font-medium rounded transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menú contextual: Añadir a Tool Chest y Estados Técnicos */}
      {contextMenu && (
        <div
          data-testid="markups-list-context-menu"
          className="fixed z-50 bg-cad-panel border border-cad-border shadow-2xl rounded py-1 text-xs text-gray-200 min-w-[170px]"
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

          <div className="border-t border-cad-border my-1" />

          {/* Sección de Estados Técnicos (P2-C.2) */}
          <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Estado
          </div>

          {(
            [
              { status: 'pending', label: 'Pendiente', color: 'bg-amber-400' },
              { status: 'accepted', label: 'Aceptado', color: 'bg-emerald-400' },
              { status: 'rejected', label: 'Rechazado', color: 'bg-rose-400' },
              { status: 'completed', label: 'Completado', color: 'bg-blue-400' },
              { status: 'cancelled', label: 'Cancelado', color: 'bg-zinc-400' },
            ] as const
          ).map((item) => {
            const isCurrent = contextMenu.markup.status === item.status;
            return (
              <button
                key={item.status}
                data-testid={`context-menu-status-${item.status}`}
                onClick={() => {
                  updateMarkupStatus(contextMenu.markup.id, item.status);
                  setContextMenu(null);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-cad-hover flex items-center justify-between transition-colors cursor-pointer ${
                  isCurrent ? 'text-white font-medium bg-cad-hover/50' : 'text-gray-300 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${item.color}`} />
                  <span>{item.label}</span>
                </div>
                {isCurrent && <Check size={12} className="text-cad-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
