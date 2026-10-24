import React from 'react';
import {
  Trash2,
  Plus,
  FileSpreadsheet,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { MarkupStatus, MarkupType } from '../../types/markup';
import { MarkupSortField, SortDirection } from '../../utils/markupFilterSort';
import { MARKUP_TYPE_LABELS } from '../../core/markup/typeLabels';

export interface MarkupsToolbarProps {
  menu: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterType: MarkupType | 'all';
  onFilterTypeChange: (t: MarkupType | 'all') => void;
  filterAuthor: string;
  onFilterAuthorChange: (a: string) => void;
  uniqueAuthors: string[];
  filterStatus: MarkupStatus | 'all';
  onFilterStatusChange: (s: MarkupStatus | 'all') => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  sortField: MarkupSortField | null;
  sortDirection: SortDirection;
  filterPageOnly: boolean;
  onFilterPageOnlyChange: (checked: boolean) => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onExportPdfReport: () => void;
  onAppendPdfReport: () => void;
  onOpenAddColumn: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onHideList: () => void;
}

export const MarkupsToolbar: React.FC<MarkupsToolbarProps> = ({
  menu,
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterAuthor,
  onFilterAuthorChange,
  uniqueAuthors,
  filterStatus,
  onFilterStatusChange,
  hasActiveFilters,
  onResetFilters,
  sortField,
  sortDirection,
  filterPageOnly,
  onFilterPageOnlyChange,
  onExportCsv,
  onExportXlsx,
  onExportPdfReport,
  onAppendPdfReport,
  onOpenAddColumn,
  selectedCount,
  onDeleteSelected,
  onHideList,
}) => {
  return (
    <div className="h-10 border-b border-cad-border shrink-0 bg-cad-panel px-3 flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-3 min-w-0">
        {menu}

        <div
          data-testid="markups-toolbar"
          className="flex items-center gap-1.5 min-w-0 text-xs"
        >
          {/* Búsqueda rápida por texto o autor */}
          <input
            type="search"
            data-testid="markups-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search markups..."
            className="ui-input !h-7 w-40"
          />

          {/* Filtro por tipo */}
          <select
            data-testid="markups-filter-type"
            value={filterType}
            onChange={(e) => onFilterTypeChange(e.target.value as MarkupType | 'all')}
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
            onChange={(e) => onFilterAuthorChange(e.target.value)}
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
            onChange={(e) => onFilterStatusChange(e.target.value as MarkupStatus | 'all')}
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
              onClick={onResetFilters}
              data-testid="markups-reset-filters-btn"
              className="px-2 py-0.5 bg-cad-hover/70 hover:bg-cad-hover text-gray-300 hover:text-cad-strong rounded text-xs transition-colors"
              title="Reset all filters"
            >
              Reset
            </button>
          )}

          {/* Indicador de orden actual */}
          <span className="text-gray-500 text-2xs whitespace-nowrap pl-1">
            Sort: <span className="text-gray-300 capitalize">{sortField ?? 'natural'}</span> {sortField ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </span>
        </div>

        <label className="flex items-center space-x-1.5 text-gray-400 hover:text-gray-200 cursor-pointer ml-3">
          <input
            type="checkbox"
            checked={filterPageOnly}
            onChange={(e) => onFilterPageOnlyChange(e.target.checked)}
            className="rounded bg-cad-subtle border-cad-border text-blue-500 focus:ring-0"
          />
          <span>Current page only</span>
        </label>
      </div>

      <div className="flex items-center space-x-2">
        <button
          data-testid="export-csv-button"
          onClick={onExportCsv}
          className="ui-btn !h-7 !px-2"
          title="Export visible markups to CSV (RFC 4180)"
        >
          <FileSpreadsheet size={16} className="text-gray-400" />
          <span>CSV</span>
        </button>

        <button
          data-testid="export-xlsx-button"
          onClick={onExportXlsx}
          className="ui-btn !h-7 !px-2"
          title="Export takeoff schedule to Excel (.xlsx) with live formulas"
        >
          <FileSpreadsheet size={16} className="text-gray-400" />
          <span>Excel (.xlsx)</span>
        </button>

        <button
          data-testid="export-pdf-report-button"
          onClick={onExportPdfReport}
          className="ui-btn !h-7 !px-2"
          title="Generate PDF summary report with hyperlinks"
        >
          <FileText size={16} className="text-gray-400" />
          <span>PDF Report</span>
        </button>

        <button
          data-testid="append-pdf-report-button"
          onClick={onAppendPdfReport}
          className="ui-btn !h-7 !px-2"
          title="Append summary report with hyperlinks to current PDF"
        >
          <FileText size={16} className="text-blue-400" />
          <span>Append Summary</span>
        </button>

        <button
          data-testid="add-custom-column-button"
          onClick={onOpenAddColumn}
          className="ui-btn !h-7 !px-2"
          title="Add custom column"
        >
          <Plus size={16} className="text-gray-400" />
          <span>Column</span>
        </button>

        {selectedCount > 0 && (
          <button
            onClick={onDeleteSelected}
            className="ui-btn ui-btn-danger !h-7 !px-2"
            title="Delete selected markups (Del)"
          >
            <Trash2 size={16} />
            <span>Delete ({selectedCount})</span>
          </button>
        )}

        <button
          type="button"
          data-testid="markups-list-hide"
          onClick={onHideList}
          className="ui-btn !h-7 !w-7 !p-0"
          title="Hide Markups List (Alt+L)"
        >
          <ChevronDown size={16} />
        </button>
      </div>
    </div>
  );
};
