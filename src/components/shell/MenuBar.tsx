import React, { useEffect, useRef, useState } from 'react';
import { Moon, Sun, FileText } from 'lucide-react';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useToolStore, ToolType } from '../../store/useToolStore';
import { useSearchStore } from '../../store/useSearchStore';
import { useUiStore } from '../../store/useUiStore';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { openPdfDialog } from '../../services/fileDialogService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { TOOL_GROUPS } from './toolDefinitions';
import { exportFlattenedPdf, goToPage, runPageOperation, selectAllOnCurrentPage } from './appActions';

type MenuEntry =
  | {
      label: string;
      shortcut?: string;
      onSelect: () => void;
      disabled?: boolean;
      checked?: boolean;
      testId?: string;
    }
  | 'separator';

interface MenuDef {
  id: string;
  label: string;
  entries: MenuEntry[];
}

/**
 * Barra de menús de la aplicación (ADR-0017). Es el <header> de la ventana: los tests E2E lo usan
 * como zona neutra para quitar el foco, por eso el centro solo contiene el título del documento.
 */
export const MenuBar: React.FC = () => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const { fileName, filePath, pdfBytes, numPages, currentPageIndex, zoomIn, zoomOut, resetZoom, rotateClockwise } =
    useDocumentStore();
  const { canUndo, canRedo, undo, redo, isDirty, selectedMarkupIds } = useMarkupStore();
  const { activeTool, setActiveTool } = useToolStore();
  const {
    theme,
    toggleTheme,
    themeFollowsSystem,
    useSystemTheme: followSystem,
    setLeftTab,
    requestPropertiesPanel,
    requestMeasurementsPanel,
    requestExport,
    setShortcutsOpen,
    viewMode,
    setViewMode,
    requestFit,
  } = useUiStore();
  const { saveNow } = useAutoSave(0);

  // Cerrar con clic fuera o Escape
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const hasDoc = Boolean(pdfBytes);
  const hasSelection = selectedMarkupIds.length > 0;
  const toolEntry = (type: ToolType, label: string, shortcut?: string): MenuEntry => ({
    label,
    shortcut,
    checked: activeTool === type,
    onSelect: () => setActiveTool(type),
    disabled: !hasDoc,
  });

  const menus: MenuDef[] = [
    {
      id: 'archivo',
      label: 'File',
      entries: [
        { label: 'Open PDF…', shortcut: 'Ctrl+O', onSelect: () => openPdfDialog(), testId: 'menu-open' },
        {
          label: 'Save to PDF',
          shortcut: 'Ctrl+S',
          onSelect: () => saveNow(),
          disabled: !filePath || !isDirty,
          testId: 'menu-save',
        },
        'separator',
        { label: 'Export PDF with Flattened Markups…', onSelect: () => exportFlattenedPdf(), disabled: !hasDoc },
        { label: 'Export Markups List (CSV)…', onSelect: () => requestExport('csv'), disabled: !hasDoc },
        { label: 'Markup Summary Report (PDF)…', onSelect: () => requestExport('report'), disabled: !hasDoc },
      ],
    },
    {
      id: 'editar',
      label: 'Edit',
      entries: [
        { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: undo, disabled: !canUndo },
        { label: 'Redo', shortcut: 'Ctrl+Y', onSelect: redo, disabled: !canRedo },
        'separator',
        { label: 'Copy', shortcut: 'Ctrl+C', onSelect: () => useMarkupStore.getState().copySelectedMarkups(), disabled: !hasSelection },
        {
          label: 'Paste',
          shortcut: 'Ctrl+V',
          onSelect: () => useMarkupStore.getState().pasteMarkups(currentPageIndex),
          disabled: useMarkupStore.getState().clipboardMarkups.length === 0,
        },
        { label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: () => useMarkupStore.getState().duplicateSelectedMarkups(), disabled: !hasSelection },
        { label: 'Lock / Unlock', onSelect: () => useMarkupStore.getState().toggleLockSelectedMarkups(), disabled: !hasSelection },
        { label: 'Delete', shortcut: 'Del', onSelect: () => useMarkupStore.getState().deleteSelectedMarkups(), disabled: !hasSelection },
        'separator',
        { label: 'Select All on Page', shortcut: 'Ctrl+A', onSelect: selectAllOnCurrentPage, disabled: !hasDoc },
      ],
    },
    {
      id: 'ver',
      label: 'View',
      entries: [
        { label: 'Zoom In', shortcut: '+', onSelect: zoomIn, disabled: !hasDoc },
        { label: 'Zoom Out', shortcut: '−', onSelect: zoomOut, disabled: !hasDoc },
        { label: 'Fit Page', shortcut: 'Ctrl+0', onSelect: () => requestFit('page'), disabled: !hasDoc, testId: 'menu-fit-page' },
        { label: 'Actual Size (100%)', shortcut: 'Ctrl+1', onSelect: resetZoom, disabled: !hasDoc },
        { label: 'Fit Width', shortcut: 'Ctrl+2', onSelect: () => requestFit('width'), disabled: !hasDoc },
        { label: 'Rotate View 90°', onSelect: rotateClockwise, disabled: !hasDoc },
        'separator',
        { label: 'Single Page', checked: viewMode === 'single', onSelect: () => setViewMode('single') },
        { label: 'Continuous', checked: viewMode === 'continuous', onSelect: () => setViewMode('continuous'), testId: 'menu-view-continuous' },
        'separator',
        { label: 'Thumbnails Panel', onSelect: () => setLeftTab('pages') },
        { label: 'Bookmarks Panel', onSelect: () => setLeftTab('bookmarks') },
        { label: 'Layers Panel', onSelect: () => setLeftTab('layers') },
        { label: 'Properties Panel', onSelect: requestPropertiesPanel },
        { label: 'Measurements Panel', onSelect: requestMeasurementsPanel },
        'separator',
        {
          label: theme === 'dark' ? 'Light Theme' : 'Dark Theme',
          onSelect: toggleTheme,
          testId: 'menu-toggle-theme',
        },
        {
          label: 'Use System Theme',
          checked: themeFollowsSystem,
          onSelect: followSystem,
          testId: 'menu-system-theme',
        },
      ],
    },
    {
      id: 'documento',
      label: 'Document',
      entries: [
        { label: 'Previous Page', shortcut: 'PgUp', onSelect: () => goToPage(-1), disabled: currentPageIndex <= 0 },
        { label: 'Next Page', shortcut: 'PgDn', onSelect: () => goToPage(1), disabled: currentPageIndex >= numPages - 1 },
        'separator',
        { label: 'Insert Blank Page After', onSelect: () => runPageOperation('insertBlank'), disabled: !hasDoc },
        { label: 'Rotate Page 90°', onSelect: () => runPageOperation('rotate'), disabled: !hasDoc },
        { label: 'Extract Page…', onSelect: () => runPageOperation('extract'), disabled: !hasDoc },
        { label: 'Delete Page', onSelect: () => runPageOperation('delete'), disabled: !hasDoc || numPages <= 1 },
        'separator',
        { label: 'Find Text…', shortcut: 'Ctrl+F', onSelect: () => useSearchStore.getState().setIsOpen(true), disabled: !hasDoc },
      ],
    },
    {
      id: 'marcado',
      label: 'Markup',
      entries: TOOL_GROUPS.filter((g) => g.id !== 'measure').flatMap((g, i) => [
        ...(i > 0 ? (['separator'] as MenuEntry[]) : []),
        ...g.tools.map((t) => toolEntry(t.type, t.short, t.shortcut)),
      ]),
    },
    {
      id: 'medicion',
      label: 'Measure',
      entries: [
        {
          label: 'Calibrate Page Scale…',
          onSelect: () => {
            useCalibrationStore.getState().setPendingCalibrationPoints([]);
            useCalibrationStore.getState().setCalibrationModalOpen(true);
          },
          disabled: !hasDoc,
        },
        { label: 'Calibrate by Two Points', onSelect: () => setActiveTool('calibrate'), disabled: !hasDoc },
        'separator',
        ...(TOOL_GROUPS.find((g) => g.id === 'measure')?.tools ?? [])
          .filter((t) => t.type !== 'calibrate')
          .map((t) => toolEntry(t.type, t.short)),
        'separator',
        { label: 'Measurements Panel', onSelect: requestMeasurementsPanel },
      ],
    },
    {
      id: 'ayuda',
      label: 'Help',
      entries: [{ label: 'Keyboard Shortcuts', shortcut: 'F1', onSelect: () => setShortcutsOpen(true) }],
    },
  ];

  return (
    <header
      ref={barRef as React.RefObject<HTMLElement>}
      className="h-8 min-w-0 bg-cad-panel border-b border-cad-border flex items-center px-2 text-[13px] text-gray-200 select-none z-30 relative"
    >
      <div className="flex items-center gap-1.5 pr-3 mr-1 border-r border-cad-border shrink-0">
        <span className="w-5 h-5 rounded-sm bg-cad-accent text-white text-[10px] font-bold flex items-center justify-center">
          R
        </span>
        <span className="font-semibold text-cad-strong tracking-wide">REA</span>
      </div>

      <nav role="menubar" className="flex items-center shrink-0">
        {menus.map((menu) => (
          <div key={menu.id} className="relative">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={openMenu === menu.id}
              data-testid={`menu-${menu.id}`}
              onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.id)}
              className={`px-2.5 py-1 rounded-sm transition-colors ${
                openMenu === menu.id ? 'bg-cad-accent text-white' : 'hover:bg-cad-hover text-gray-200'
              }`}
            >
              {menu.label}
            </button>
            {openMenu === menu.id && (
              <div
                role="menu"
                data-testid={`menu-popup-${menu.id}`}
                className="absolute left-0 top-full mt-0.5 min-w-[260px] bg-cad-ribbon border border-cad-border rounded shadow-xl py-1 z-50"
              >
                {menu.entries.map((entry, idx) =>
                  entry === 'separator' ? (
                    <div key={`sep-${idx}`} className="my-1 border-t border-cad-border" />
                  ) : (
                    <button
                      key={entry.label}
                      type="button"
                      role="menuitem"
                      data-testid={entry.testId}
                      disabled={entry.disabled}
                      onClick={() => {
                        setOpenMenu(null);
                        entry.onSelect();
                      }}
                      className="w-full flex items-center justify-between gap-6 px-3 py-1.5 text-left text-gray-200 hover:bg-cad-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-200"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-3 text-cad-accent">{entry.checked ? '✓' : ''}</span>
                        {entry.label}
                      </span>
                      {entry.shortcut && <span className="text-[11px] text-gray-500 font-mono">{entry.shortcut}</span>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Centro: título del documento (zona neutra) */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-gray-400 text-xs px-3">
        {fileName && (
          <>
            <FileText size={13} className="shrink-0" />
            <span className="truncate" title={filePath ?? fileName}>
              {fileName}
              {!filePath && ' — demo (not saved)'}
              {filePath && isDirty && ' — unsaved changes'}
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        data-testid="theme-toggle-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="p-1 rounded hover:bg-cad-hover text-gray-400 hover:text-cad-strong shrink-0"
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </header>
  );
};
