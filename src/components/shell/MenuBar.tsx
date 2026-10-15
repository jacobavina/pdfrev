import React, { useEffect, useRef, useState } from 'react';
import {
  Moon,
  Sun,
  FileText,
  FolderOpen,
  Save,
  FileDown,
  FileSpreadsheet,
  ClipboardList,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Lock,
  Trash2,
  BoxSelect,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  PanelLeft,
  Bookmark,
  Layers,
  SlidersHorizontal,
  Ruler,
  MonitorCog,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  FileOutput,
  FileX2,
  Search,
  Keyboard,
  Contrast,
  SaveAll,
  PenLine,
  Stamp as StampIcon,
  FormInput,
  Signature,
  Link2,
  Paperclip,
  Layers2,
  FileStack,
} from 'lucide-react';
import { FIELD_TYPES, FieldType } from '../../core/markup/formFields';
import { fieldTypeIcon } from './fieldIcons';
import { STAMPS } from '../../core/markup/stamps';
import {
  FitPageIcon,
  FitWidthIcon,
  ActualSizeIcon,
  SinglePageIcon,
  ContinuousIcon,
  CalibrateIcon,
  LengthMeasureIcon,
  RulersIcon,
} from './customIcons';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useToolStore, ToolType } from '../../store/useToolStore';
import { useSearchStore } from '../../store/useSearchStore';
import { useUiStore } from '../../store/useUiStore';
import { QuickAccessToolbar } from './QuickAccessToolbar';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { openPdfDialog } from '../../services/fileDialogService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { TOOL_GROUPS } from './toolDefinitions';
import { exportFlattenedPdf, goToPage, runPageOperation, selectAllOnCurrentPage } from './appActions';
import { saveDocumentAs } from '../../services/documentSaveService';

type MenuEntry =
  | {
      label: string;
      shortcut?: string;
      onSelect?: () => void;
      /** Submenú (ADR-0026), como Tools ▸ Markup / Stamp / Measure de Revu. */
      submenu?: MenuEntry[];
      disabled?: boolean;
      checked?: boolean;
      testId?: string;
      /** Ícono a la izquierda (ADR-0023); si la entrada está activa, el ícono se resalta como en Revu. */
      icon?: React.ReactNode;
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
  const [openSub, setOpenSub] = useState<string | null>(null);
  useEffect(() => {
    if (!openMenu) setOpenSub(null);
  }, [openMenu]);
  const barRef = useRef<HTMLDivElement | null>(null);

  const { fileName, filePath, pdfBytes, numPages, currentPageIndex, zoomIn, zoomOut, resetZoom, rotateClockwise } =
    useDocumentStore();
  const { canUndo, canRedo, undo, redo, isDirty, selectedMarkupIds } = useMarkupStore();
  const { activeTool, setActiveTool, activeStampId, setActiveStampId, activeFieldType, setActiveFieldType } = useToolStore();
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
    showRulers,
    setShowRulers,
    autoOpenPanels,
    setAutoOpenPanels,
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
  /** Entrada de Tools ▸ Form: elige el tipo de campo y activa la herramienta (ADR-0027). */
  const fieldEntry = (type: FieldType, label: string): MenuEntry => ({
    icon: fieldTypeIcon(type),
    label,
    testId: `menu-field-${type}`,
    checked: activeTool === 'formField' && activeFieldType === type,
    disabled: !hasDoc,
    onSelect: () => {
      setActiveFieldType(type);
      setActiveTool('formField');
    },
  });
  const toolEntry = (type: ToolType, label: string, shortcut?: string, icon?: React.ReactNode): MenuEntry => ({
    label,
    shortcut,
    icon,
    checked: activeTool === type,
    onSelect: () => setActiveTool(type),
    disabled: !hasDoc,
  });

  const menus: MenuDef[] = [
    {
      id: 'archivo',
      label: 'File',
      entries: [
        { icon: <FolderOpen size={15} />, label: 'Open PDF…', shortcut: 'Ctrl+O', onSelect: () => openPdfDialog(), testId: 'menu-open' },
        {
          icon: <Save size={15} />,
          label: filePath ? 'Save' : 'Save…',
          shortcut: 'Ctrl+S',
          onSelect: () => saveNow(),
          disabled: !hasDoc,
          testId: 'menu-save',
        },
        {
          icon: <SaveAll size={15} />,
          label: 'Save As…',
          shortcut: 'Ctrl+Shift+S',
          onSelect: () => void saveDocumentAs(),
          disabled: !hasDoc,
          testId: 'menu-save-as',
        },
        'separator',
        {
          icon: <FileDown size={15} />,
          label: 'Export',
          testId: 'menu-export',
          submenu: [
            { icon: <FileDown size={15} />, label: 'PDF with Flattened Markups…', onSelect: () => exportFlattenedPdf(), disabled: !hasDoc, testId: 'menu-export-flattened' },
            { icon: <FileSpreadsheet size={15} />, label: 'Markups List (CSV)…', onSelect: () => requestExport('csv'), disabled: !hasDoc, testId: 'menu-export-csv' },
            { icon: <ClipboardList size={15} />, label: 'Markup Summary Report (PDF)…', onSelect: () => requestExport('report'), disabled: !hasDoc, testId: 'menu-export-report' },
          ],
        },
      ],
    },
    {
      id: 'editar',
      label: 'Edit',
      entries: [
        { icon: <Undo2 size={15} />, label: 'Undo', shortcut: 'Ctrl+Z', onSelect: undo, disabled: !canUndo },
        { icon: <Redo2 size={15} />, label: 'Redo', shortcut: 'Ctrl+Y', onSelect: redo, disabled: !canRedo },
        'separator',
        { icon: <Copy size={15} />, label: 'Copy', shortcut: 'Ctrl+C', onSelect: () => useMarkupStore.getState().copySelectedMarkups(), disabled: !hasSelection },
        {
          icon: <ClipboardPaste size={15} />,
          label: 'Paste',
          shortcut: 'Ctrl+V',
          onSelect: () => useMarkupStore.getState().pasteMarkups(currentPageIndex),
          disabled: useMarkupStore.getState().clipboardMarkups.length === 0,
        },
        { icon: <CopyPlus size={15} />, label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: () => useMarkupStore.getState().duplicateSelectedMarkups(), disabled: !hasSelection },
        { icon: <Lock size={15} />, label: 'Lock / Unlock', onSelect: () => useMarkupStore.getState().toggleLockSelectedMarkups(), disabled: !hasSelection },
        { icon: <Trash2 size={15} />, label: 'Delete', shortcut: 'Del', onSelect: () => useMarkupStore.getState().deleteSelectedMarkups(), disabled: !hasSelection },
        'separator',
        { icon: <BoxSelect size={15} />, label: 'Select All on Page', shortcut: 'Ctrl+A', onSelect: selectAllOnCurrentPage, disabled: !hasDoc },
      ],
    },
    {
      id: 'ver',
      label: 'View',
      entries: [
        { icon: <ZoomIn size={15} />, label: 'Zoom In', shortcut: 'Ctrl+wheel', onSelect: zoomIn, disabled: !hasDoc },
        { icon: <ZoomOut size={15} />, label: 'Zoom Out', shortcut: 'Ctrl+wheel', onSelect: zoomOut, disabled: !hasDoc },
        { icon: <FitPageIcon size={15} />, label: 'Fit Page', shortcut: 'Ctrl+9', onSelect: () => requestFit('page'), disabled: !hasDoc, testId: 'menu-fit-page' },
        { icon: <FitWidthIcon size={15} />, label: 'Fit Width', shortcut: 'Ctrl+0', onSelect: () => requestFit('width'), disabled: !hasDoc },
        { icon: <ActualSizeIcon size={15} />, label: 'Actual Size', shortcut: 'Ctrl+8', onSelect: resetZoom, disabled: !hasDoc },
        { icon: <RotateCw size={15} />, label: 'Rotate View 90°', onSelect: rotateClockwise, disabled: !hasDoc },
        'separator',
        { icon: <SinglePageIcon size={15} />, label: 'Single Page', shortcut: 'Ctrl+4', checked: viewMode === 'single', onSelect: () => setViewMode('single') },
        { icon: <ContinuousIcon size={15} />, label: 'Continuous Pages', shortcut: 'Ctrl+5', checked: viewMode === 'continuous', onSelect: () => setViewMode('continuous'), testId: 'menu-view-continuous' },
        { icon: <RulersIcon size={15} />, label: 'Rulers', shortcut: 'Ctrl+R', checked: showRulers, onSelect: () => setShowRulers(!showRulers), testId: 'menu-view-rulers' },
        'separator',
        { icon: <PanelLeft size={15} />, label: 'Thumbnails Panel', onSelect: () => setLeftTab('pages') },
        { icon: <Bookmark size={15} />, label: 'Bookmarks Panel', onSelect: () => setLeftTab('bookmarks') },
        { icon: <Layers size={15} />, label: 'Layers Panel', onSelect: () => setLeftTab('layers') },
        { icon: <SlidersHorizontal size={15} />, label: 'Properties Panel', onSelect: requestPropertiesPanel },
        { icon: <Ruler size={15} />, label: 'Measurements Panel', onSelect: requestMeasurementsPanel },
        {
          icon: <SlidersHorizontal size={15} />,
          label: 'Open Panel on Selection',
          checked: autoOpenPanels,
          onSelect: () => setAutoOpenPanels(!autoOpenPanels),
          testId: 'menu-view-auto-panels',
        },
        'separator',
        {
          icon: <Contrast size={15} />,
          label: 'Dark Mode',
          shortcut: 'Ctrl+3',
          checked: theme === 'dark',
          onSelect: toggleTheme,
          testId: 'menu-toggle-theme',
        },
        {
          icon: <MonitorCog size={15} />,
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
        { icon: <ChevronLeft size={15} />, label: 'Previous Page', shortcut: 'PgUp', onSelect: () => goToPage(-1), disabled: currentPageIndex <= 0 },
        { icon: <ChevronRight size={15} />, label: 'Next Page', shortcut: 'PgDn', onSelect: () => goToPage(1), disabled: currentPageIndex >= numPages - 1 },
        'separator',
        { icon: <FilePlus2 size={15} />, label: 'Insert Blank Page After', onSelect: () => runPageOperation('insertBlank'), disabled: !hasDoc },
        { icon: <RotateCcw size={15} />, label: 'Rotate Page 90°', shortcut: 'Ctrl+Shift+R', onSelect: () => runPageOperation('rotate'), disabled: !hasDoc },
        { icon: <FileOutput size={15} />, label: 'Extract Page…', shortcut: 'Ctrl+Shift+X', onSelect: () => runPageOperation('extract'), disabled: !hasDoc },
        { icon: <FileX2 size={15} />, label: 'Delete Page', onSelect: () => runPageOperation('delete'), disabled: !hasDoc || numPages <= 1 },
        'separator',
        { icon: <Search size={15} />, label: 'Find Text…', shortcut: 'Ctrl+F', onSelect: () => useSearchStore.getState().setIsOpen(true), disabled: !hasDoc },
        'separator',
        {
          icon: <Layers2 size={15} />,
          label: 'Overlay Pages',
          testId: 'menu-overlay',
          submenu: [
            {
              icon: <FileStack size={15} />,
              label: 'Overlay with Another PDF…',
              testId: 'menu-overlay-file',
              onSelect: () => void import('../../services/overlayService').then((m) => m.startOverlayFromFile()),
              disabled: !hasDoc,
            },
            {
              icon: <Copy size={15} />,
              label: 'Overlay with a Page of This Document',
              testId: 'menu-overlay-self',
              onSelect: () => void import('../../services/overlayService').then((m) => m.startOverlayWithThisDocument()),
              disabled: !hasDoc || numPages < 2,
            },
          ],
        },
      ],
    },
    {
      id: 'herramientas',
      label: 'Tools',
      entries: [
        {
          icon: <PenLine size={15} />,
          label: 'Markup',
          testId: 'menu-tools-markup',
          submenu: TOOL_GROUPS.filter((g) => g.id !== 'measure' && g.id !== 'select').flatMap((g, i) => [
            ...(i > 0 ? (['separator'] as MenuEntry[]) : []),
            ...g.tools.map((t) => toolEntry(t.type, t.short, t.shortcut, t.icon)),
          ]),
        },
        {
          icon: <StampIcon size={15} />,
          label: 'Stamp',
          testId: 'menu-tools-stamp',
          submenu: STAMPS.map((st) => ({
            icon: <span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: st.color }} />,
            label: st.label,
            checked: activeTool === 'stamp' && activeStampId === st.id,
            testId: `menu-stamp-${st.id}`,
            disabled: !hasDoc,
            onSelect: () => {
              setActiveStampId(st.id);
              setActiveTool('stamp');
            },
          })),
        },
        {
          icon: <LengthMeasureIcon size={15} />,
          label: 'Measure',
          testId: 'menu-tools-measure',
          submenu: [
            {
              icon: <CalibrateIcon size={15} />,
              label: 'Calibrate Page Scale…',
              testId: 'menu-calibrate',
              // Un solo flujo (ADR-0031): dos clics sobre una distancia conocida y después el diálogo
              onSelect: () => {
                useCalibrationStore.getState().setPendingCalibrationPoints([]);
                setActiveTool('calibrate');
              },
              disabled: !hasDoc,
            },
            'separator',
            ...(TOOL_GROUPS.find((g) => g.id === 'measure')?.tools ?? [])
              .filter((t) => t.type !== 'calibrate')
              .map((t) => toolEntry(t.type, t.short, t.shortcut, t.icon)),
          ],
        },
        {
          icon: <FormInput size={15} />,
          label: 'Form',
          testId: 'menu-tools-form',
          submenu: FIELD_TYPES.filter((f) => f.id !== 'signature').map((f) => fieldEntry(f.id, f.label)),
        },
        {
          icon: <Signature size={15} />,
          label: 'Signature',
          testId: 'menu-tools-signature',
          submenu: [fieldEntry('signature', 'Digital Signature Field')],
        },
        'separator',
        {
          icon: <Link2 size={15} />,
          label: 'Hyperlink',
          testId: 'menu-tools-hyperlink',
          checked: activeTool === 'link',
          onSelect: () => setActiveTool('link'),
          disabled: !hasDoc,
        },
        {
          icon: <Paperclip size={15} />,
          label: 'File Attachment',
          testId: 'menu-tools-attachment',
          checked: activeTool === 'fileAttachment',
          onSelect: () => setActiveTool('fileAttachment'),
          disabled: !hasDoc,
        },
        'separator',
        { icon: <Ruler size={15} />, label: 'Measurements Panel', onSelect: requestMeasurementsPanel },
      ],
    },
    {
      id: 'ayuda',
      label: 'Help',
      entries: [{ icon: <Keyboard size={15} />, label: 'Keyboard Shortcuts', shortcut: 'F1', onSelect: () => setShortcutsOpen(true) }],
    },
  ];

  return (
    <header
      ref={barRef as React.RefObject<HTMLElement>}
      className="h-8 min-w-0 bg-cad-panel border-b border-cad-border flex items-center px-2 text-[13px] text-gray-200 select-none z-30 relative"
    >
      <div className="flex items-center gap-2 pr-3 mr-1 border-r border-cad-border shrink-0">
        <span className="w-[22px] h-[22px] rounded-md bg-gradient-to-br from-cad-accent to-sky-400 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
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
              className={`px-2.5 py-1 rounded-md transition-colors ${
                openMenu === menu.id ? 'bg-cad-accent text-white' : 'hover:bg-cad-hover text-gray-200'
              }`}
            >
              {menu.label}
            </button>
            {openMenu === menu.id && (
              <div
                role="menu"
                data-testid={`menu-popup-${menu.id}`}
                className="absolute left-0 top-full mt-0.5 min-w-[260px] bg-cad-panel border border-cad-border rounded-lg shadow-[0_10px_32px_rgba(0,0,0,0.28)] p-1 z-50"
              >
                {menu.entries.map((entry, idx) =>
                  entry === 'separator' ? (
                    <div key={`sep-${idx}`} className="my-1 mx-1 border-t border-cad-border" />
                  ) : entry.submenu ? (
                    <div
                      key={entry.label}
                      className="relative"
                      onMouseEnter={() => setOpenSub(entry.label)}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        aria-haspopup="true"
                        aria-expanded={openSub === entry.label}
                        data-testid={entry.testId}
                        onClick={() => setOpenSub(openSub === entry.label ? null : entry.label)}
                        className={`w-full flex items-center justify-between gap-6 px-2 py-1.5 rounded-md text-left text-gray-200 hover:bg-cad-accent hover:text-white ${
                          openSub === entry.label ? 'bg-cad-accent text-white' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-[22px] h-[22px] shrink-0 flex items-center justify-center [&_svg]:w-[15px] [&_svg]:h-[15px]">
                            {entry.icon}
                          </span>
                          {entry.label}
                        </span>
                        <ChevronRight size={13} />
                      </button>
                      {openSub === entry.label && (
                        <div
                          role="menu"
                          data-testid={`${entry.testId}-popup`}
                          className="absolute left-full top-0 -mt-1 ml-0.5 min-w-[240px] max-h-[70vh] overflow-y-auto bg-cad-panel border border-cad-border rounded-lg shadow-[0_10px_32px_rgba(0,0,0,0.28)] p-1 z-50"
                        >
                          {entry.submenu.map((sub, j) =>
                            sub === 'separator' ? (
                              <div key={`ssep-${j}`} className="my-1 border-t border-cad-border" />
                            ) : (
                              <button
                                key={sub.label}
                                type="button"
                                role="menuitem"
                                data-testid={sub.testId}
                                disabled={sub.disabled}
                                onClick={() => {
                                  setOpenMenu(null);
                                  setOpenSub(null);
                                  sub.onSelect?.();
                                }}
                                className="w-full flex items-center justify-between gap-6 px-2 py-1.5 rounded-md text-left text-gray-200 hover:bg-cad-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-200"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`w-[22px] h-[22px] shrink-0 rounded-sm flex items-center justify-center [&_svg]:w-[15px] [&_svg]:h-[15px] ${
                                      sub.checked ? 'bg-cad-accent/25 ring-1 ring-cad-accent text-cad-strong' : ''
                                    }`}
                                  >
                                    {sub.icon}
                                  </span>
                                  {sub.label}
                                </span>
                                {sub.shortcut && <span className="text-[11px] text-gray-500 font-mono">{sub.shortcut}</span>}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      key={entry.label}
                      type="button"
                      role="menuitem"
                      data-testid={entry.testId}
                      disabled={entry.disabled}
                      onMouseEnter={() => setOpenSub(null)}
                      onClick={() => {
                        setOpenMenu(null);
                        entry.onSelect?.();
                      }}
                      className="w-full flex items-center justify-between gap-6 px-2 py-1.5 rounded-md text-left text-gray-200 hover:bg-cad-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-200"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-[22px] h-[22px] shrink-0 rounded-sm flex items-center justify-center [&_svg]:w-[15px] [&_svg]:h-[15px] ${
                            entry.checked && entry.icon ? 'bg-cad-accent/25 ring-1 ring-cad-accent text-cad-strong' : ''
                          }`}
                        >
                          {entry.icon ?? (entry.checked ? <span className="text-cad-accent">✓</span> : null)}
                        </span>
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

      <QuickAccessToolbar />

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
