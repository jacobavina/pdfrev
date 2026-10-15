import React, { useState } from 'react';
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Briefcase,
  Check,
  Plus,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Lock,
  LockOpen,
  Stamp,
  Link2,
  Paperclip,
  FormInput,
} from 'lucide-react';
import {
  RectangleToolIcon,
  LineToolIcon,
  PolylineToolIcon,
  PolygonToolIcon,
  CloudIcon,
  CloudPlusIcon,
  TextBoxIcon,
  CalloutIcon,
  EllipseToolIcon,
  NoteIcon,
  HighlighterIcon,
  TextHighlightIcon,
  UnderlineIcon,
  StrikeoutIcon,
  PenIcon,
  DimensionIcon,
  LengthMeasureIcon,
  PolylengthIcon,
  AreaMeasureIcon,
  CountMeasureIcon,
  PerimeterMeasureIcon,
  VolumeMeasureIcon,
  AngleMeasureIcon,
  RadiusMeasureIcon,
  DiameterMeasureIcon,
} from './shell/customIcons';
import { useMarkupStore } from '../store/useMarkupStore';
import { useDocumentStore } from '../store/useDocumentStore';
import { useToolChestStore } from '../store/useToolChestStore';
import { useUiStore } from '../store/useUiStore';
import { showToast } from '../services/toastService';
import { markupTypeLabel, MARKUP_TYPE_LABELS } from '../core/markup/typeLabels';

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

const LIST_HEIGHT_KEY = 'rea-markups-list-height';
const DEFAULT_LIST_HEIGHT = 200;
const MIN_LIST_HEIGHT = 120;

const STATUS_CONFIG: Record<
  MarkupStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  // Claro por defecto con variante oscura (ADR-0017): colores legibles en ambos temas
  pending: {
    label: 'Pending',
    bg: 'bg-amber-500/[0.13]',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700',
  },
  accepted: {
    label: 'Accepted',
    bg: 'bg-emerald-500/[0.13]',
    text: 'text-emerald-800 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-700',
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-rose-500/[0.13]',
    text: 'text-rose-800 dark:text-rose-300',
    border: 'border-rose-300 dark:border-rose-700',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-blue-500/[0.13]',
    text: 'text-blue-800 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-zinc-100 dark:bg-zinc-800/60',
    text: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-300 dark:border-zinc-600',
  },
};

/** Ícono de cada tipo en la lista: el mismo de su herramienta en la cinta (ADR-0023/0026). */
function getMarkupIcon(type: MarkupType) {
  const I = (node: React.ReactNode, cls: string) => <span className={`inline-flex ${cls}`}>{node}</span>;
  switch (type) {
    case 'rectangle':
      return I(<RectangleToolIcon size={14} />, 'text-orange-400');
    case 'line':
      return I(<LineToolIcon size={14} />, 'text-blue-400');
    case 'polyLine':
      return I(<PolylineToolIcon size={14} />, 'text-cyan-400');
    case 'polygon':
      return I(<PolygonToolIcon size={14} />, 'text-cyan-400');
    case 'cloud':
      return I(<CloudIcon size={14} />, 'text-emerald-400');
    case 'cloudPlus':
      return I(<CloudPlusIcon size={14} />, 'text-emerald-400');
    case 'text':
      return I(<TextBoxIcon size={14} />, 'text-purple-400');
    case 'callout':
      return I(<CalloutIcon size={14} />, 'text-purple-400');
    case 'circle':
      return I(<EllipseToolIcon size={14} />, 'text-yellow-400');
    case 'stickyNote':
      return I(<NoteIcon size={14} />, 'text-amber-400');
    case 'highlightVector':
    case 'highlight':
      return I(<HighlighterIcon size={14} />, 'text-yellow-400');
    case 'highlightText':
      return I(<TextHighlightIcon size={14} />, 'text-yellow-400');
    case 'underline':
      return I(<UnderlineIcon size={14} />, 'text-pink-400');
    case 'strikeOut':
      return I(<StrikeoutIcon size={14} />, 'text-rose-400');
    case 'freehand':
      return I(<PenIcon size={14} />, 'text-blue-400');
    case 'stamp':
      return I(<Stamp size={14} />, 'text-emerald-500');
    case 'link':
      return I(<Link2 size={14} />, 'text-blue-500');
    case 'fileAttachment':
      return I(<Paperclip size={14} />, 'text-amber-600');
    case 'formField':
      return I(<FormInput size={14} />, 'text-slate-400');
    case 'dimension':
      return I(<DimensionIcon size={14} />, 'text-sky-400');
    case 'length':
      return I(<LengthMeasureIcon size={14} />, 'text-violet-400');
    case 'polylineMeasure':
      return I(<PolylengthIcon size={14} />, 'text-violet-400');
    case 'area':
      return I(<AreaMeasureIcon size={14} />, 'text-violet-400');
    case 'count':
      return I(<CountMeasureIcon size={14} />, 'text-violet-400');
    case 'perimeter':
      return I(<PerimeterMeasureIcon size={14} />, 'text-violet-400');
    case 'volume':
      return I(<VolumeMeasureIcon size={14} />, 'text-violet-400');
    case 'angle':
      return I(<AngleMeasureIcon size={14} />, 'text-violet-400');
    case 'radius':
      return I(<RadiusMeasureIcon size={14} />, 'text-violet-400');
    case 'diameter':
      return I(<DiameterMeasureIcon size={14} />, 'text-violet-400');
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
    toggleLockSelectedMarkups,
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

  const measurementTotals = React.useMemo(() => {
    const lengthsByUnit: Record<string, number> = {};
    const areasByUnit: Record<string, number> = {};
    const volumesByUnit: Record<string, number> = {};
    let totalCount = 0;

    for (const m of displayedMarkups) {
      if (m.type === 'count') {
        totalCount += (m.measurement?.value ?? 1);
      } else if (m.type === 'length' || m.type === 'polylineMeasure' || m.type === 'perimeter') {
        if (m.measurement) {
          const unit = m.measurement.unit;
          lengthsByUnit[unit] = (lengthsByUnit[unit] || 0) + m.measurement.value;
        }
      } else if (m.type === 'area') {
        if (m.measurement) {
          const unit = m.measurement.unit;
          areasByUnit[unit] = (areasByUnit[unit] || 0) + m.measurement.value;
        }
      } else if (m.type === 'volume') {
        if (m.measurement) {
          const unit = m.measurement.unit;
          volumesByUnit[unit] = (volumesByUnit[unit] || 0) + m.measurement.value;
        }
      }
    }

    const lengthSummary = Object.entries(lengthsByUnit)
      .map(([u, val]) => `${val.toFixed(2)} ${u}`)
      .join(', ');

    const areaSummary = Object.entries(areasByUnit)
      .map(([u, val]) => `${val.toFixed(2)} ${u}²`)
      .join(', ');

    const volumeSummary = Object.entries(volumesByUnit)
      .map(([u, val]) => `${val.toFixed(2)} ${u}³`)
      .join(', ');

    return {
      lengthSummary,
      areaSummary,
      volumeSummary,
      totalCount,
      hasAny: Boolean(lengthSummary || areaSummary || volumeSummary || totalCount > 0),
    };
  }, [displayedMarkups]);

  // Validación en tiempo real de la fórmula ingresada en el modal
  const formulaValidation = React.useMemo(() => {
    if (newColType !== 'formula') {
      return { ok: true, message: '' };
    }
    const trimmed = newColExpr.trim();
    if (!trimmed) {
      return { ok: false, message: 'The expression cannot be empty' };
    }
    const res = parseExpression(trimmed);
    if (!res.ok) {
      return { ok: false, message: res.message };
    }
    return { ok: true, message: 'Expression is syntactically valid' };
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
      return `${d.toLocaleDateString('en-US')} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
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
      const defaultBase = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'markups';
      const defaultName = `${defaultBase}-markups.csv`;
      const bytes = buildCsvContent(displayedMarkups, customColumns, evaluationMatrix);
      await saveExportFileWithDialog(defaultName, 'csv', bytes);
    } catch (err) {
      console.error('Error al exportar CSV:', err);
      showToast(`Error exporting CSV: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportPdfReport = async () => {
    try {
      const { buildPdfReportContent, saveExportFileWithDialog } = await import('../services/exportService');
      const defaultBase = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'reporte';
      const defaultName = `${defaultBase}-markup-summary.pdf`;
      const bytes = await buildPdfReportContent(fileName || 'PDF document', displayedMarkups);
      await saveExportFileWithDialog(defaultName, 'pdf', bytes);
    } catch (err) {
      console.error('Error al generar Reporte PDF:', err);
      showToast(`Error generating the PDF report: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Altura de la lista: redimensionable con el separador superior y recordada entre sesiones
  const [listHeight, setListHeight] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(LIST_HEIGHT_KEY));
      return stored >= MIN_LIST_HEIGHT && stored <= 1200 ? stored : DEFAULT_LIST_HEIGHT;
    } catch {
      return DEFAULT_LIST_HEIGHT;
    }
  });
  const listHeightRef = React.useRef(listHeight);
  listHeightRef.current = listHeight;
  const startListResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = listHeightRef.current;
    const onMove = (ev: MouseEvent) => {
      const max = Math.max(MIN_LIST_HEIGHT, window.innerHeight * 0.7);
      setListHeight(Math.round(Math.max(MIN_LIST_HEIGHT, Math.min(max, startHeight + (startY - ev.clientY)))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem(LIST_HEIGHT_KEY, String(listHeightRef.current));
      } catch {
        // Preferencia no persistible: se mantiene solo en esta sesión
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Exportaciones pedidas desde los menús o el panel de mediciones: se ejecutan aquí para respetar
  // los filtros, el orden y las columnas visibles de la lista (ADR-0017)
  const exportRequest = useUiStore((s) => s.exportRequest);
  const lastExportSeq = React.useRef(exportRequest?.seq ?? 0);
  React.useEffect(() => {
    if (!exportRequest || exportRequest.seq === lastExportSeq.current) return;
    lastExportSeq.current = exportRequest.seq;
    if (exportRequest.kind === 'csv') void handleExportCsv();
    else void handleExportPdfReport();
    // Solo debe reaccionar a peticiones nuevas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRequest]);

  return (
    <section
      data-testid="markups-list-panel"
      className="bg-cad-panel border-t border-cad-border flex flex-col select-none z-10 relative shrink-0"
      // En ventanas bajas la lista no pasa del 38 % de la altura: el plano conserva el espacio (ADR-0034)
      style={{ height: isExpanded ? `${listHeight}px` : '32px', maxHeight: isExpanded ? '38vh' : undefined }}
    >
      {/* Separador arrastrable para redimensionar la lista (ADR-0017) */}
      {isExpanded && (
        <div
          data-testid="markups-list-resizer"
          onMouseDown={startListResize}
          title="Drag to resize the list"
          className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-20 hover:bg-cad-accent/30"
        />
      )}
      {/* Barra de cabecera del panel de marcas */}
      <div className="h-9 bg-cad-panel px-3 flex items-center justify-between text-[12px] border-b border-cad-border">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-1.5 text-gray-300 hover:text-cad-strong"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            <span className="ui-panel-title">
              Markups List ({displayedMarkups.length})
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
              <span>Current page only</span>
            </label>
          )}
        </div>

        {isExpanded && (
          <div className="flex items-center space-x-2">
            <button
              data-testid="export-csv-button"
              onClick={handleExportCsv}
              className="ui-btn !h-7 !px-2"
              title="Export visible markups to CSV (RFC 4180)"
            >
              <FileSpreadsheet size={13} className="text-gray-400" />
              <span>CSV</span>
            </button>

            <button
              data-testid="export-pdf-report-button"
              onClick={handleExportPdfReport}
              className="ui-btn !h-7 !px-2"
              title="Generate PDF summary report"
            >
              <FileText size={13} className="text-gray-400" />
              <span>PDF Report</span>
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
              className="ui-btn !h-7 !px-2"
              title="Add custom column"
            >
              <Plus size={13} className="text-gray-400" />
              <span>Column</span>
            </button>

            {selectedMarkupIds.length > 0 && (
              <button
                onClick={deleteSelectedMarkups}
                className="ui-btn ui-btn-danger !h-7 !px-2"
                title="Delete selected markups (Del)"
              >
                <Trash2 size={12} />
                <span>Delete ({selectedMarkupIds.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra de herramientas de filtros y ordenación */}
      {isExpanded && (
        <div
          data-testid="markups-toolbar"
          className="bg-cad-panel px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-cad-border text-[12px]"
        >
          {/* Búsqueda rápida por texto o autor */}
          <input
            type="search"
            data-testid="markups-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search markups..."
            className="ui-input w-36"
          />

          {/* Filtro por tipo */}
          <select
            data-testid="markups-filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as MarkupType | 'all')}
            className="ui-input"
          >
            <option value="all">All types</option>
            {(Object.keys(MARKUP_TYPE_LABELS) as MarkupType[])
              .filter((t) => t !== 'highlight')
              .map((t) => (
                <option key={t} value={t}>
                  {MARKUP_TYPE_LABELS[t]}
                </option>
              ))}
          </select>

          {/* Filtro por autor */}
          <select
            data-testid="markups-filter-author"
            value={filterAuthor}
            onChange={(e) => setFilterAuthor(e.target.value)}
            className="ui-input max-w-[130px] truncate"
          >
            <option value="all">All authors</option>
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
            className="ui-input"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Botón reset de filtros */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              data-testid="markups-reset-filters-btn"
              className="px-2 py-0.5 bg-cad-hover/70 hover:bg-cad-hover text-gray-300 hover:text-cad-strong rounded text-xs transition-colors"
              title="Reset all filters"
            >
              Reset
            </button>
          )}

          {/* Indicador de orden actual */}
          <span className="text-gray-500 ml-auto text-[11px] font-mono">
            Sort: <span className="text-gray-300 capitalize">{sortField ?? 'natural'}</span> {sortField ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </span>
        </div>
      )}

      {/* Contenedor de la Tabla */}
      {isExpanded && (
        <div className="flex-1 overflow-auto bg-cad-panel">
          {displayedMarkups.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-500 italic" data-testid="markups-empty-message">
              No markups match the applied filters.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-cad-panel text-gray-500 text-[11px] sticky top-0 shadow-[inset_0_-1px_0_rgb(var(--cad-border))] z-10">
                <tr>
                  <th className="py-1.5 px-2.5 w-8 font-medium"></th>
                  <th
                    onClick={() => handleSort('type')}
                    className="py-1 px-2 font-medium w-28 cursor-pointer hover:text-cad-strong select-none"
                    title="Sort by type"
                  >
                    Type {renderSortIndicator('type')}
                  </th>
                  <th
                    onClick={() => handleSort('text')}
                    className="py-1 px-2 font-medium min-w-[160px] cursor-pointer hover:text-cad-strong select-none"
                    title="Sort by subject / comment"
                  >
                    Comment {renderSortIndicator('text')}
                  </th>
                  <th
                    onClick={() => handleSort('author')}
                    className="py-1 px-2 font-medium w-32 cursor-pointer hover:text-cad-strong select-none"
                    title="Sort by author"
                  >
                    Author {renderSortIndicator('author')}
                  </th>
                  <th
                    onClick={() => handleSort('createdAt')}
                    className="py-1 px-2 font-medium w-32 cursor-pointer hover:text-cad-strong select-none"
                    title="Sort by date"
                  >
                    Date {renderSortIndicator('createdAt')}
                  </th>
                  <th
                    onClick={() => handleSort('pageIndex')}
                    className="py-1 px-2 font-medium w-20 text-center cursor-pointer hover:text-cad-strong select-none"
                    title="Sort by page"
                  >
                    Page {renderSortIndicator('pageIndex')}
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="py-1 px-2 font-medium w-28 text-center cursor-pointer hover:text-cad-strong select-none"
                    title="Sort by status"
                  >
                    Status {renderSortIndicator('status')}
                  </th>
                  <th
                    onClick={() => handleSort('measurement')}
                    className="py-1 px-2 font-medium w-24 text-right cursor-pointer hover:text-cad-strong select-none"
                    title="Sort by measurement"
                  >
                    Measurement {renderSortIndicator('measurement')}
                  </th>
                  <th className="py-1.5 px-2 font-medium w-16 text-center select-none">
                    Unit
                  </th>

                  {/* Cabeceras dinámicas de Columnas Personalizadas (P2-C.3) */}
                  {customColumns?.map((col) => (
                    <th
                      key={col.id}
                      data-testid={`custom-column-header-${col.id}`}
                      onClick={() => handleSort(`custom:${col.id}`)}
                      className="py-1 px-2 font-medium min-w-[110px] cursor-pointer hover:text-cad-strong select-none group"
                      title={`Sort by ${col.nombre} (${col.tipo})`}
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
                          title={`Delete column ${col.nombre}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </th>
                  ))}

                  <th className="py-1.5 px-2 font-medium w-12 text-center">Action</th>
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
                          ? 'bg-cad-accent/[0.14] hover:bg-cad-accent/20 text-cad-strong'
                          : 'hover:bg-cad-hover/70'
                      } ${markup.groupId ? 'border-l-2 border-l-purple-500/80' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-1.5 px-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => selectMarkup(markup.id, true)}
                          className="rounded bg-cad-dark border-cad-border text-blue-500 focus:ring-0"
                        />
                      </td>

                      {/* Tipo */}
                      <td className="py-1.5 px-2 flex items-center space-x-1.5">
                        {getMarkupIcon(markup.type)}
                        <span>{markupTypeLabel(markup.type)}</span>
                        {markup.locked && (
                          <span title="Locked markup" data-testid={`markup-locked-badge-${markup.id}`}>
                            <Lock size={12} className="text-amber-400 shrink-0 ml-1" />
                          </span>
                        )}
                      </td>

                      {/* Texto / Comentario editable */}
                      <td className="py-1.5 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={markup.text || ''}
                          placeholder="No comment..."
                          onChange={(e) => updateMarkup(markup.id, { text: e.target.value })}
                          className="w-full bg-transparent hover:bg-cad-dark/50 focus:bg-cad-dark px-1.5 py-0.5 rounded border border-transparent focus:border-cad-border text-xs text-gray-200 outline-none truncate"
                        />
                      </td>

                      {/* Autor */}
                      <td className="py-1.5 px-2 text-gray-400 truncate">{markup.author}</td>

                      {/* Fecha */}
                      <td className="py-1.5 px-2 text-gray-400 tabular-nums text-[11px]">
                        {formatDate(markup.createdAt)}
                      </td>

                      {/* Página */}
                      <td className="py-1.5 px-2 text-center tabular-nums text-gray-300">
                        {markup.pageIndex + 1}
                      </td>

                      {/* Estado con dropdown interactivo */}
                      <td className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={markup.status}
                          onChange={(e) =>
                            updateMarkupStatus(markup.id, e.target.value as MarkupStatus)
                          }
                          className={`text-[11px] font-medium py-0.5 pl-2 pr-1 rounded-full border-0 outline-none cursor-pointer ${statusInfo.bg} ${statusInfo.text}`}
                        >
                          <option value="pending" className="bg-cad-dark text-amber-300">
                            Pending
                          </option>
                          <option value="accepted" className="bg-cad-dark text-emerald-300">
                            Accepted
                          </option>
                          <option value="rejected" className="bg-cad-dark text-rose-300">
                            Rejected
                          </option>
                          <option value="completed" className="bg-cad-dark text-blue-300">
                            Completed
                          </option>
                          <option value="cancelled" className="bg-cad-dark text-zinc-400">
                            Cancelled
                          </option>
                        </select>
                      </td>

                      {/* Medida */}
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-200">
                        {markup.measurement?.formatted || (markup.measurement?.value !== undefined ? String(markup.measurement.value) : '—')}
                      </td>

                      {/* Unidad */}
                      <td className="py-1.5 px-2 text-center text-gray-400 tabular-nums text-[11px]">
                        {markup.measurement?.unit ? (markup.type === 'area'
                            ? `${markup.measurement.unit}²`
                            : markup.type === 'volume'
                              ? `${markup.measurement.unit}³`
                              : markup.type === 'angle'
                                ? '°'
                                : markup.measurement.unit) : '—'}
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
                                className="ui-input w-full"
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
                      <td className="py-1.5 px-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={async () => {
                            const store = useToolChestStore.getState();
                            const activePaletteId = store.activePaletteId || store.palettes[0]?.id;
                            if (activePaletteId) {
                              await store.createToolFromMarkup(activePaletteId, markup);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-blue-400 rounded transition-colors mr-1"
                          title="Add to Tool Chest"
                          data-testid={`add-to-toolchest-btn-${markup.id}`}
                        >
                          <Briefcase size={13} />
                        </button>
                        <button
                          onClick={() => deleteMarkup(markup.id)}
                          className="p-1 text-gray-400 hover:text-rose-400 rounded transition-colors"
                          title="Delete markup"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {measurementTotals.hasAny && (
                <tfoot className="bg-cad-subtle border-t border-cad-border text-gray-300 font-medium">
                  <tr data-testid="markups-totals-summary">
                    <td colSpan={9} className="py-1.5 px-3 text-xs">
                      <span className="font-semibold text-cad-accent mr-2">Measurement totals:</span>
                      {measurementTotals.lengthSummary && (
                        <span className="mr-3">
                          Length: <strong className="text-cad-strong font-mono">{measurementTotals.lengthSummary}</strong>
                        </span>
                      )}
                      {measurementTotals.areaSummary && (
                        <span className="mr-3">
                          Area: <strong className="text-cad-strong font-mono">{measurementTotals.areaSummary}</strong>
                        </span>
                      )}
                      {measurementTotals.volumeSummary && (
                        <span className="mr-3">
                          Volume: <strong className="text-cad-strong font-mono">{measurementTotals.volumeSummary}</strong>
                        </span>
                      )}
                      {measurementTotals.totalCount > 0 && (
                        <span>
                          Count: <strong className="text-cad-strong font-mono">{measurementTotals.totalCount}</strong>
                        </span>
                      )}
                    </td>
                    <td colSpan={(customColumns?.length || 0) + 2}></td>
                  </tr>
                </tfoot>
              )}
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
            className="bg-cad-panel border border-cad-border rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.38)] w-full max-w-md p-5 text-xs text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-cad-strong mb-3">
              Create Custom Column
            </h3>
            <form onSubmit={handleCreateColumn} className="space-y-3">
              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Column name
                </label>
                <input
                  type="text"
                  data-testid="column-name-input"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. Length, Estimated cost, Category..."
                  required
                  className="w-full ui-input"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-medium">
                  Column type
                </label>
                <select
                  data-testid="column-type-select"
                  value={newColType}
                  onChange={(e) =>
                    setNewColType(e.target.value as BbxCustomColumnType)
                  }
                  className="w-full ui-input"
                >
                  {CANONICAL_CUSTOM_COLUMN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'text' && 'Text (text)'}
                      {t === 'number' && 'Number (number)'}
                      {t === 'choice' && 'Choice / Dropdown (choice)'}
                      {t === 'formula' && 'Calculated / Formula (formula)'}
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
                    className="w-full ui-input"
                  />
                </div>
              )}

              {newColType === 'formula' && (
                <div>
                  <label className="block text-gray-400 mb-1 font-medium">
                    Math expression
                  </label>
                  <input
                    type="text"
                    data-testid="column-expression-input"
                    value={newColExpr}
                    onChange={(e) => setNewColExpr(e.target.value)}
                    placeholder="ej. strokeWidth * 2.5 + {otra_columna}"
                    className="w-full ui-input font-mono"
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
                      ✓ Valid expression
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-cad-border">
                <button
                  type="button"
                  data-testid="cancel-column-button"
                  onClick={() => setIsAddColumnModalOpen(false)}
                  className="ui-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-column-button"
                  disabled={
                    !newColName.trim() ||
                    (newColType === 'formula' && !formulaValidation.ok)
                  }
                  className="ui-btn ui-btn-primary"
                >
                  Save Column
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
            className="bg-cad-panel border border-cad-border rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.38)] w-full max-w-sm p-5 text-xs text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-rose-300 mb-2 flex items-center space-x-1.5">
              <AlertTriangle size={16} className="text-rose-400" />
              <span>Delete Custom Column</span>
            </h3>
            <p className="text-gray-300 mb-4 leading-relaxed">
              Are you sure you want to delete the column{' '}
              <strong className="text-cad-strong">"{columnToDelete.nombre}"</strong>?
              All values stored in this column for the document's markups will also be deleted.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                data-testid="cancel-delete-column-btn"
                onClick={() => setColumnToDelete(null)}
                className="ui-btn"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-delete-column-btn"
                onClick={() => {
                  removeCustomColumn(columnToDelete.id);
                  setColumnToDelete(null);
                }}
                className="ui-btn !bg-rose-600 !text-white hover:!bg-rose-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menú contextual: Añadir a Tool Chest y Estados Técnicos */}
      {contextMenu && (
        <div
          data-testid="markups-list-context-menu"
          className="fixed z-50 bg-cad-panel border border-cad-border shadow-[0_10px_32px_rgba(0,0,0,0.28)] rounded-lg p-1 text-xs text-gray-200 min-w-[170px]"
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
            className="w-full text-left px-3 py-1.5 hover:bg-cad-hover flex items-center space-x-2 text-gray-200 hover:text-cad-strong transition-colors cursor-pointer"
          >
            <Briefcase size={13} className="text-blue-400" />
            <span>Add to Tool Chest</span>
          </button>

          <button
            data-testid="context-menu-toggle-lock"
            onClick={() => {
              toggleLockSelectedMarkups();
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-cad-hover flex items-center space-x-2 text-gray-200 hover:text-cad-strong transition-colors cursor-pointer"
          >
            {contextMenu.markup.locked ? (
              <>
                <LockOpen size={13} className="text-amber-400" />
                <span>Unlock markup</span>
              </>
            ) : (
              <>
                <Lock size={13} className="text-gray-400" />
                <span>Lock markup</span>
              </>
            )}
          </button>

          <div className="border-t border-cad-border my-1" />

          {/* Sección de Estados Técnicos (P2-C.2) */}
          <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Status
          </div>

          {(
            [
              { status: 'pending', label: 'Pending', color: 'bg-amber-400' },
              { status: 'accepted', label: 'Accepted', color: 'bg-emerald-400' },
              { status: 'rejected', label: 'Rejected', color: 'bg-rose-400' },
              { status: 'completed', label: 'Completed', color: 'bg-blue-400' },
              { status: 'cancelled', label: 'Cancelled', color: 'bg-zinc-400' },
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
                  isCurrent ? 'text-cad-strong font-medium bg-cad-hover/50' : 'text-gray-300 hover:text-cad-strong'
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
