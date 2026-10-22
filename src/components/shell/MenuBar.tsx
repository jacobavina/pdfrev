import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Moon,
  Sun,
  FileText,
  FolderOpen,
  Save,
  FileDown,
  FileSpreadsheet,
  ClipboardList,
  List as ListIcon,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Lock,
  Trash2,
  BoxSelect,
  Clock,
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
  ScanText,
  EyeOff,
  BookOpen,
  LayoutPanelLeft,
  SaveAll,
  PenLine,
  Stamp as StampIcon,
  FormInput,
  Signature,
  Link2,
  Paperclip,
  Layers2,
  Columns2,
  FileStack,
  Grid3x3,
  Magnet,
} from 'lucide-react';
import { FIELD_TYPES, FieldType } from '../../core/markup/formFields';
import { fieldTypeIcon } from './fieldIcons';
import { STAMPS, STAMP_GROUPS } from '../../core/markup/stamps';
import {
  FitPageIcon,
  FitWidthIcon,
  ActualSizeIcon,
  SinglePageIcon,
  ContinuousIcon,
  CalibrateIcon,
  LengthMeasureIcon,
  PolylengthIcon,
  AreaMeasureIcon,
  PerimeterMeasureIcon,
  DiameterMeasureIcon,
  RadiusMeasureIcon,
  AngleMeasureIcon,
  VolumeMeasureIcon,
  CountMeasureIcon,
  RulersIcon,
  PolygonCutoutIcon,
  EllipseCutoutIcon,
  SnapshotIcon,
} from './customIcons';
import { hasSnapshotInCache } from '../../services/snapshotService';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useToolStore, ToolType } from '../../store/useToolStore';
import { useSearchStore } from '../../store/useSearchStore';
import { useUiStore } from '../../store/useUiStore';
import { QuickAccessToolbar } from './QuickAccessToolbar';
import { RibbonTabs } from './Ribbon';
import { useCalibrationStore } from '../../store/useCalibrationStore';
import { openPdfDialog, openPdfFromPath } from '../../services/fileDialogService';
import { getRecentFiles, clearRecentFiles, subscribeRecentFiles, RecentFile } from '../../services/recentFilesService';
import { useAutoSave } from '../../hooks/useAutoSave';
import { TOOL_GROUPS } from './toolDefinitions';
import { PROFILE_LABELS } from '../../core/ui/profiles';
import { exportFlattenedPdf, unflattenOpenDocument, goToPage, runPageOperation, selectAllOnCurrentPage } from './appActions';

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
      title?: string;
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
/**
 * Submenú que se desplaza lo justo para quedar entero dentro de la ventana (ADR-0104): en una ventana baja o estrecha
 * el submenú de una entrada del final del menú se salía por abajo y no se podían alcanzar sus opciones.
 */
const SubmenuPopup: React.FC<{ testId: string; className: string; children: React.ReactNode }> = ({ testId, className, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  // Posición fija junto a su entrada: el menú de arriba se desplaza cuando no cabe en la ventana y recortaría a un
  // submenú absoluto. Se coloca a la derecha de la entrada (a la izquierda si no hay sitio) y a 8 px del borde de la ventana.
  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;
    const pr = anchor.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.margin = '0';
    el.style.left = `${pr.right}px`;
    el.style.top = `${pr.top}px`;
    el.style.maxHeight = '';
    const r = el.getBoundingClientRect();
    const room = window.innerHeight - 16;
    const w = r.right - r.left;
    const h = Math.min(r.bottom - r.top, room);
    let left = pr.right;
    if (left + w > window.innerWidth - 8) left = pr.left - w >= 8 ? pr.left - w : Math.max(8, window.innerWidth - 8 - w);
    let top = pr.top;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - h);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.maxHeight = `${room}px`;
  });
  return (
    <div ref={ref} role="menu" data-testid={testId} className={className}>
      {children}
    </div>
  );
};

export const MenuBar: React.FC = () => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  useEffect(() => {
    if (!openMenu) setOpenSub(null);
  }, [openMenu]);
  const barRef = useRef<HTMLDivElement | null>(null);

  const { fileName, filePath, pdfBytes, numPages, currentPageIndex, zoomIn, zoomOut, resetZoom, rotateClockwise, rotateCounterClockwise } =
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
    setFeatureGuideOpen,
    setCombineModalOpen,
    viewMode,
    setViewMode,
    requestFit,
    showRulers,
    setShowRulers,
    showGrid,
    setShowGrid,
    snapToGrid,
    setSnapToGrid,
    autoOpenPanels,
    setAutoOpenPanels,
    markupsListOpen,
    toggleMarkupsList,
    markupsListAtStart,
    setMarkupsListAtStart,
    profile,
    customLayout,
    applyProfile,
    saveCustomProfile,
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

  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => getRecentFiles());
  useEffect(() => subscribeRecentFiles((files) => setRecentFiles(files)), []);

  const recentMenuEntries: MenuEntry[] =
    recentFiles.length === 0
      ? [
          {
            label: 'No Recent Files',
            disabled: true,
            testId: 'menu-recent-empty',
          },
        ]
      : [
          ...recentFiles.map((rf, idx): MenuEntry => ({
            label: rf.name + (rf.pageCount ? ` (${rf.pageCount} pgs)` : ''),
            title: rf.path,
            testId: `menu-recent-item-${idx}`,
            onSelect: () => {
              void openPdfFromPath(rf.path);
            },
          })),
          'separator',
          {
            icon: <Trash2 size={16} />,
            label: 'Clear Recent Files',
            testId: 'menu-clear-recent',
            onSelect: () => {
              clearRecentFiles();
            },
          },
        ];

  const menus: MenuDef[] = [
    {
      id: 'archivo',
      label: 'File',
      entries: [
        { icon: <FolderOpen size={16} />, label: 'Open PDF…', shortcut: 'Ctrl+O', onSelect: () => openPdfDialog(), testId: 'menu-open' },
        {
          icon: <Clock size={16} />,
          label: 'Open Recent',
          testId: 'menu-open-recent',
          submenu: recentMenuEntries,
        },
        { icon: <Layers size={16} />, label: 'Combine Files…', onSelect: () => setCombineModalOpen(true), testId: 'menu-combine-files' },
        {
          icon: <Save size={16} />,
          label: filePath ? 'Save' : 'Save…',
          shortcut: 'Ctrl+S',
          onSelect: () => saveNow(),
          disabled: !hasDoc,
          testId: 'menu-save',
        },
        {
          icon: <SaveAll size={16} />,
          label: 'Save As…',
          shortcut: 'Ctrl+Shift+S',
          onSelect: () => void import('../../services/documentSaveService').then((m) => m.saveDocumentAs()),
          disabled: !hasDoc,
          testId: 'menu-save-as',
        },
        'separator',
        {
          icon: <FileDown size={16} />,
          label: 'Export',
          testId: 'menu-export',
          submenu: [
            { icon: <FileDown size={16} />, label: 'PDF with Flattened Markups…', onSelect: () => exportFlattenedPdf(), disabled: !hasDoc, testId: 'menu-export-flattened' },
            { icon: <FileDown size={16} />, label: 'Unflatten Markups of This PDF', onSelect: () => unflattenOpenDocument(), disabled: !hasDoc, testId: 'menu-unflatten' },
            { icon: <FileSpreadsheet size={16} />, label: 'Markups List (CSV)…', onSelect: () => requestExport('csv'), disabled: !hasDoc, testId: 'menu-export-csv' },
            { icon: <FileSpreadsheet size={16} />, label: 'Takeoff Schedule (Excel .xlsx)…', onSelect: () => requestExport('xlsx'), disabled: !hasDoc, testId: 'menu-export-xlsx' },
            { icon: <ClipboardList size={16} />, label: 'Markup Summary Report (PDF)…', onSelect: () => requestExport('report'), disabled: !hasDoc, testId: 'menu-export-report' },
            { icon: <FilePlus2 size={16} />, label: 'Append Summary to PDF…', onSelect: () => requestExport('append-report'), disabled: !hasDoc, testId: 'menu-export-append-report' },
          ],
        },
      ],
    },
    {
      id: 'editar',
      label: 'Edit',
      entries: [
        { icon: <Undo2 size={16} />, label: 'Undo', shortcut: 'Ctrl+Z', onSelect: undo, disabled: !canUndo },
        { icon: <Redo2 size={16} />, label: 'Redo', shortcut: 'Ctrl+Y', onSelect: redo, disabled: !canRedo },
        'separator',
        { icon: <Copy size={16} />, label: 'Copy', shortcut: 'Ctrl+C', onSelect: () => useMarkupStore.getState().copySelectedMarkups(), disabled: !hasSelection },
        {
          icon: <ClipboardPaste size={16} />,
          label: 'Paste',
          shortcut: 'Ctrl+V',
          onSelect: () => useMarkupStore.getState().pasteMarkups(currentPageIndex),
          disabled: useMarkupStore.getState().clipboardMarkups.length === 0 && !hasSnapshotInCache(),
        },
        {
          icon: <SnapshotIcon size={16} />,
          label: 'Snapshot',
          shortcut: 'G',
          onSelect: () => useToolStore.getState().setActiveTool('snapshot'),
          disabled: !hasDoc,
          testId: 'menu-edit-snapshot',
        },
        { icon: <CopyPlus size={16} />, label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: () => useMarkupStore.getState().duplicateSelectedMarkups(), disabled: !hasSelection },
        { icon: <CopyPlus size={16} />, label: 'Offset…', shortcut: 'O', onSelect: () => useUiStore.getState().setCopyToolDialog('offset'), disabled: !hasSelection, testId: 'menu-offset' },
        { icon: <CopyPlus size={16} />, label: 'Multiply…', shortcut: 'Ctrl+M', onSelect: () => useUiStore.getState().setCopyToolDialog('multiply'), disabled: !hasSelection, testId: 'menu-multiply' },
        { icon: <Lock size={16} />, label: 'Lock / Unlock', onSelect: () => useMarkupStore.getState().toggleLockSelectedMarkups(), disabled: !hasSelection },
        { icon: <Trash2 size={16} />, label: 'Delete', shortcut: 'Del', onSelect: () => useMarkupStore.getState().deleteSelectedMarkups(), disabled: !hasSelection },
        'separator',
        {
          icon: <Columns2 size={16} />,
          label: 'Align & Flip',
          testId: 'menu-edit-transform',
          submenu: [
            { label: 'Align Left', disabled: selectedMarkupIds.length < 2, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.alignSelectedMarkups('left')), testId: 'menu-align-left' },
            { label: 'Align Center', disabled: selectedMarkupIds.length < 2, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.alignSelectedMarkups('center')), testId: 'menu-align-center' },
            { label: 'Align Right', disabled: selectedMarkupIds.length < 2, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.alignSelectedMarkups('right')), testId: 'menu-align-right' },
            { label: 'Align Top', disabled: selectedMarkupIds.length < 2, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.alignSelectedMarkups('top')), testId: 'menu-align-top' },
            { label: 'Align Middle', disabled: selectedMarkupIds.length < 2, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.alignSelectedMarkups('middle')), testId: 'menu-align-middle' },
            { label: 'Align Bottom', disabled: selectedMarkupIds.length < 2, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.alignSelectedMarkups('bottom')), testId: 'menu-align-bottom' },
            'separator',
            { label: 'Distribute Horizontally', disabled: selectedMarkupIds.length < 3, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.distributeSelectedMarkups('horizontal')), testId: 'menu-distribute-horizontal' },
            { label: 'Distribute Vertically', disabled: selectedMarkupIds.length < 3, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.distributeSelectedMarkups('vertical')), testId: 'menu-distribute-vertical' },
            'separator',
            { label: 'Flip Horizontal', disabled: !hasSelection, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.flipSelectedMarkups('horizontal')), testId: 'menu-flip-horizontal' },
            { label: 'Flip Vertical', disabled: !hasSelection, onSelect: () => void import('../../core/markup/transformTools').then((m) => m.flipSelectedMarkups('vertical')), testId: 'menu-flip-vertical' },
          ],
        },
        'separator',
        { icon: <BoxSelect size={16} />, label: 'Select All on Page', shortcut: 'Ctrl+A', onSelect: selectAllOnCurrentPage, disabled: !hasDoc },
      ],
    },
    {
      id: 'ver',
      label: 'View',
      entries: [
        { icon: <ZoomIn size={16} />, label: 'Zoom In', shortcut: 'Ctrl+wheel', onSelect: zoomIn, disabled: !hasDoc },
        { icon: <ZoomOut size={16} />, label: 'Zoom Out', shortcut: 'Ctrl+wheel', onSelect: zoomOut, disabled: !hasDoc },
        {
          icon: <ZoomIn size={16} />,
          label: 'Zoom Window',
          shortcut: 'Z',
          onSelect: () => useToolStore.getState().setActiveTool('zoom'),
          disabled: !hasDoc,
          testId: 'menu-zoom-window',
        },
        { icon: <FitPageIcon size={16} />, label: 'Fit Page', shortcut: 'Ctrl+9', onSelect: () => requestFit('page'), disabled: !hasDoc, testId: 'menu-fit-page' },
        { icon: <FitWidthIcon size={16} />, label: 'Fit Width', shortcut: 'Ctrl+0', onSelect: () => requestFit('width'), disabled: !hasDoc },
        { icon: <ActualSizeIcon size={16} />, label: 'Actual Size', shortcut: 'Ctrl+8', onSelect: resetZoom, disabled: !hasDoc },
        'separator',
        {
          icon: <RotateCw size={16} />,
          label: 'Rotate View Clockwise',
          shortcut: 'Ctrl+Shift++',
          onSelect: rotateClockwise,
          disabled: !hasDoc,
          testId: 'menu-rotate-clockwise',
        },
        {
          icon: <RotateCcw size={16} />,
          label: 'Rotate View Counterclockwise',
          shortcut: 'Ctrl+Shift+-',
          onSelect: rotateCounterClockwise,
          disabled: !hasDoc,
          testId: 'menu-rotate-counterclockwise',
        },
        'separator',
        { icon: <SinglePageIcon size={16} />, label: 'Single Page', shortcut: 'Ctrl+4', checked: viewMode === 'single', onSelect: () => setViewMode('single') },
        { icon: <ContinuousIcon size={16} />, label: 'Continuous Pages', shortcut: 'Ctrl+5', checked: viewMode === 'continuous', onSelect: () => setViewMode('continuous'), testId: 'menu-view-continuous' },
        { icon: <RulersIcon size={16} />, label: 'Rulers', shortcut: 'Ctrl+R', checked: showRulers, onSelect: () => setShowRulers(!showRulers), testId: 'menu-view-rulers' },
        { icon: <Grid3x3 size={16} />, label: 'Show Grid', shortcut: 'Shift+F9', checked: showGrid, onSelect: () => setShowGrid(!showGrid), testId: 'menu-view-grid' },
        { icon: <Magnet size={16} />, label: 'Snap to Grid', shortcut: 'Ctrl+Shift+F9', checked: snapToGrid, onSelect: () => setSnapToGrid(!snapToGrid), testId: 'menu-view-snap-grid' },
        'separator',
        { icon: <PanelLeft size={16} />, label: 'Thumbnails Panel', onSelect: () => setLeftTab('pages') },
        { icon: <Bookmark size={16} />, label: 'Bookmarks Panel', onSelect: () => setLeftTab('bookmarks') },
        { icon: <Layers size={16} />, label: 'Layers Panel', onSelect: () => setLeftTab('layers') },
        { icon: <SlidersHorizontal size={16} />, label: 'Properties Panel', onSelect: requestPropertiesPanel },
        { icon: <Ruler size={16} />, label: 'Measurements Panel', onSelect: requestMeasurementsPanel },
        {
          icon: <SlidersHorizontal size={16} />,
          label: 'Open Panel on Selection',
          checked: autoOpenPanels,
          onSelect: () => setAutoOpenPanels(!autoOpenPanels),
          testId: 'menu-view-auto-panels',
        },
        // Lista de marcas de Revu (ADR-0060): abre cerrada salvo que se pida abrirla al arrancar
        {
          icon: <ListIcon size={16} />,
          label: 'Markups List',
          shortcut: 'Alt+L',
          checked: markupsListOpen,
          onSelect: toggleMarkupsList,
          testId: 'menu-view-markups-list',
        },
        {
          icon: <ListIcon size={16} />,
          label: 'Open Markups List at Start',
          checked: markupsListAtStart,
          onSelect: () => setMarkupsListAtStart(!markupsListAtStart),
          testId: 'menu-view-list-at-start',
        },
        'separator',
        // Perfiles de interfaz (ADR-0098): una disposición de la ventana para cada tipo de trabajo
        {
          icon: <LayoutPanelLeft size={16} />,
          label: 'Profiles',
          testId: 'menu-view-profiles',
          submenu: [
            ...(['review', 'takeoff', 'field'] as const).map((id) => ({
              icon: <LayoutPanelLeft size={16} />,
              label: PROFILE_LABELS[id],
              checked: profile === id,
              onSelect: () => applyProfile(id),
              testId: `menu-profile-${id}`,
            })),
            {
              icon: <LayoutPanelLeft size={16} />,
              label: 'Custom',
              checked: profile === 'custom',
              disabled: !customLayout,
              onSelect: () => applyProfile('custom'),
              testId: 'menu-profile-custom',
            },
            'separator' as const,
            {
              icon: <Save size={16} />,
              label: 'Save Current Layout as Custom',
              onSelect: saveCustomProfile,
              testId: 'menu-profile-save',
            },
          ],
        },
        {
          icon: <Contrast size={16} />,
          label: 'Dark Mode',
          shortcut: 'Ctrl+3',
          checked: theme === 'dark',
          onSelect: toggleTheme,
          testId: 'menu-toggle-theme',
        },
        {
          icon: <MonitorCog size={16} />,
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
        { icon: <ChevronLeft size={16} />, label: 'Previous Page', shortcut: 'PgUp', onSelect: () => goToPage(-1), disabled: currentPageIndex <= 0 },
        { icon: <ChevronRight size={16} />, label: 'Next Page', shortcut: 'PgDn', onSelect: () => goToPage(1), disabled: currentPageIndex >= numPages - 1 },
        'separator',
        { icon: <FilePlus2 size={16} />, label: 'Insert Blank Page After', onSelect: () => runPageOperation('insertBlank'), disabled: !hasDoc },
        { icon: <RotateCcw size={16} />, label: 'Rotate Page 90°', shortcut: 'Ctrl+Shift+R', onSelect: () => runPageOperation('rotate'), disabled: !hasDoc },
        { icon: <FileOutput size={16} />, label: 'Extract Page…', shortcut: 'Ctrl+Shift+X', onSelect: () => runPageOperation('extract'), disabled: !hasDoc },
        { icon: <FileX2 size={16} />, label: 'Delete Page', onSelect: () => runPageOperation('delete'), disabled: !hasDoc || numPages <= 1 },
        'separator',
        { icon: <Search size={16} />, label: 'Find Text…', shortcut: 'Ctrl+F', onSelect: () => useSearchStore.getState().setIsOpen(true), disabled: !hasDoc },
        'separator',
        {
          icon: <Layers2 size={16} />,
          label: 'Overlay Pages',
          testId: 'menu-overlay',
          submenu: [
            {
              icon: <FileStack size={16} />,
              label: 'Overlay with Another PDF…',
              testId: 'menu-overlay-file',
              onSelect: () => void import('../../services/overlayService').then((m) => m.startOverlayFromFile()),
              disabled: !hasDoc,
            },
            {
              icon: <Copy size={16} />,
              label: 'Overlay with a Page of This Document',
              testId: 'menu-overlay-self',
              onSelect: () => void import('../../services/overlayService').then((m) => m.startOverlayWithThisDocument()),
              disabled: !hasDoc || numPages < 2,
            },
          ],
        },
        // Redacción permanente (ADR-0103)
        {
          icon: <EyeOff size={16} />,
          label: 'Redaction',
          testId: 'menu-redaction',
          disabled: !hasDoc,
          submenu: [
            {
              icon: <EyeOff size={16} />,
              label: 'Mark Search Results for Redaction',
              testId: 'menu-redaction-mark-search',
              onSelect: () =>
                void import('../../services/redactionService').then((m) => m.markSearchResultsForRedaction(useSearchStore.getState().matches)),
            },
            {
              icon: <EyeOff size={16} />,
              label: 'Apply Redactions…',
              testId: 'menu-redaction-apply',
              onSelect: () => void import('../../services/redactionService').then((m) => m.applyRedactions()),
            },
          ],
        },
        // OCR local con el motor de Windows (ADR-0102): hace buscable un plano escaneado
        {
          icon: <ScanText size={16} />,
          label: 'OCR',
          testId: 'menu-ocr',
          disabled: !hasDoc,
          submenu: [
            {
              icon: <ScanText size={16} />,
              label: 'OCR This Page',
              testId: 'menu-ocr-page',
              onSelect: () => void import('../../services/ocrService').then((m) => m.runOcr('page')),
            },
            {
              icon: <ScanText size={16} />,
              label: 'OCR All Pages Without Text',
              testId: 'menu-ocr-all',
              onSelect: () => void import('../../services/ocrService').then((m) => m.runOcr('all')),
            },
          ],
        },
        {
          icon: <FileStack size={16} />,
          label: 'Compare Documents…',
          testId: 'menu-compare-documents',
          onSelect: () => void import('../../services/compareService').then((m) => m.compareWithFile()),
          disabled: !hasDoc,
        },
        {
          icon: <Columns2 size={16} />,
          label: 'Side by Side',
          testId: 'menu-side-by-side',
          disabled: !hasDoc,
          submenu: [
            {
              icon: <FileText size={16} />,
              label: 'Compare with Another PDF…',
              testId: 'menu-split-file',
              onSelect: () => void import('../../services/splitService').then((m) => m.startSplitFromFile()),
            },
            {
              icon: <Columns2 size={16} />,
              label: 'Compare with a Page of This Document',
              testId: 'menu-split-this',
              onSelect: () => void import('../../services/splitService').then((m) => m.startSplitWithThisDocument()),
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
          icon: <PenLine size={16} />,
          label: 'Markup',
          testId: 'menu-tools-markup',
          submenu: TOOL_GROUPS.filter((g) => g.id !== 'measure' && g.id !== 'select').flatMap((g, i) => [
            ...(i > 0 ? (['separator'] as MenuEntry[]) : []),
            ...g.tools.map((t) => toolEntry(t.type, t.short, t.shortcut, t.icon)),
          ]),
        },
        {
          icon: <StampIcon size={16} />,
          label: 'Stamp',
          testId: 'menu-tools-stamp',
          // Por secciones, como el selector de la cinta (ADR-0045)
          submenu: STAMP_GROUPS.flatMap((group, gi) => [
            ...(gi > 0 ? (['separator'] as MenuEntry[]) : []),
            ...STAMPS.filter((st) => st.group === group).map((st) => ({
              icon: <span className="w-3 h-3 rounded-sm border-2" style={{ borderColor: st.color }} />,
              label: group === 'Construction' ? st.label : `${st.label} · ${group}`,
              checked: activeTool === 'stamp' && activeStampId === st.id,
              testId: `menu-stamp-${st.id}`,
              disabled: !hasDoc,
              onSelect: () => {
                setActiveStampId(st.id);
                setActiveTool('stamp');
              },
            })),
          ]),
        },
        {
          icon: <LengthMeasureIcon size={16} />,
          label: 'Measure',
          testId: 'menu-tools-measure',
          submenu: [
            {
              icon: <CalibrateIcon size={16} />,
              label: 'Set Scale…',
              testId: 'menu-calibrate',
              // Un solo flujo (ADR-0031): dos clics sobre una distancia conocida y después el diálogo
              onSelect: () => {
                useCalibrationStore.getState().setPendingCalibrationPoints([]);
                setActiveTool('calibrate');
              },
              disabled: !hasDoc,
            },
            'separator',
            toolEntry('length', 'Length', 'Shift+Alt+L', <LengthMeasureIcon size={16} />),
            toolEntry('polylineMeasure', 'Polylength', 'Shift+Alt+Q', <PolylengthIcon size={16} />),
            toolEntry('area', 'Area', 'Shift+Alt+A', <AreaMeasureIcon size={16} />),
            toolEntry('perimeter', 'Perimeter', 'Shift+Alt+P', <PerimeterMeasureIcon size={16} />),
            toolEntry('diameter', 'Diameter', 'Shift+Alt+D', <DiameterMeasureIcon size={16} />),
            toolEntry('radius', 'Center Radius', 'Shift+Alt+U', <RadiusMeasureIcon size={16} />),
            toolEntry('angle', 'Angle', 'Shift+Alt+G', <AngleMeasureIcon size={16} />),
            toolEntry('volume', 'Volume', 'Shift+Alt+V', <VolumeMeasureIcon size={16} />),
            'separator',
            toolEntry('polygonCutout', 'Polygon Cutout', 'Shift+Alt+K', <PolygonCutoutIcon size={16} />),
            toolEntry('ellipseCutout', 'Ellipse Cutout', undefined, <EllipseCutoutIcon size={16} />),
            'separator',
            toolEntry('count', 'Count', 'Shift+Alt+C', <CountMeasureIcon size={16} />),
          ],
        },
        {
          icon: <FormInput size={16} />,
          label: 'Form',
          testId: 'menu-tools-form',
          submenu: FIELD_TYPES.filter((f) => f.id !== 'signature').map((f) => fieldEntry(f.id, f.label)),
        },
        {
          icon: <Signature size={16} />,
          label: 'Signature',
          testId: 'menu-tools-signature',
          submenu: [fieldEntry('signature', 'Digital Signature Field')],
        },
        'separator',
        {
          icon: <Link2 size={16} />,
          label: 'Hyperlink',
          testId: 'menu-tools-hyperlink',
          checked: activeTool === 'link',
          onSelect: () => setActiveTool('link'),
          disabled: !hasDoc,
        },
        {
          icon: <Paperclip size={16} />,
          label: 'File Attachment',
          testId: 'menu-tools-attachment',
          checked: activeTool === 'fileAttachment',
          onSelect: () => setActiveTool('fileAttachment'),
          disabled: !hasDoc,
        },
        'separator',
        { icon: <Ruler size={16} />, label: 'Measurements Panel', onSelect: requestMeasurementsPanel },
      ],
    },
    {
      id: 'ayuda',
      label: 'Help',
      entries: [
        { icon: <BookOpen size={16} />, label: 'Feature Guide', onSelect: () => setFeatureGuideOpen(true), testId: 'menu-help-guide' },
        { icon: <Keyboard size={16} />, label: 'Keyboard Shortcuts', shortcut: 'F1', onSelect: () => setShortcutsOpen(true) },
      ],
    },
  ];

  return (
    <header
      ref={barRef as React.RefObject<HTMLElement>}
      className="h-8 min-w-0 bg-cad-panel border-b border-cad-border flex items-center px-2 text-sm text-gray-200 select-none z-30 relative"
    >
      <div className="flex items-center gap-1 pr-3 mr-1 border-r border-cad-border shrink-0" aria-label="REA">
        <span aria-hidden="true" className="text-cad-accent font-bold leading-none">
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
                openMenu === menu.id ? 'bg-cad-hover ring-1 ring-gray-500/60 text-cad-strong' : 'hover:bg-cad-hover text-gray-200'
              }`}
            >
              {menu.label}
            </button>
            {openMenu === menu.id && (
              <div
                role="menu"
                data-testid={`menu-popup-${menu.id}`}
                className="absolute left-0 top-full mt-0.5 min-w-[260px] max-h-[calc(100vh-3.5rem)] overflow-y-auto bg-cad-panel border border-cad-border rounded-lg shadow-float p-1 z-50"
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
                        className={`w-full flex items-center justify-between gap-6 px-2 py-1.5 rounded-md text-left text-gray-200 hover:bg-cad-hover hover:text-cad-strong ${
                          openSub === entry.label ? 'bg-cad-hover ring-1 ring-gray-500/60 text-cad-strong' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-[22px] h-[22px] shrink-0 flex items-center justify-center [&_svg]:w-[15px] [&_svg]:h-[15px]">
                            {entry.icon}
                          </span>
                          {entry.label}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      {openSub === entry.label && (
                        <SubmenuPopup
                          testId={`${entry.testId}-popup`}
                          className="min-w-[240px] overflow-y-auto bg-cad-panel border border-cad-border rounded-lg shadow-float p-1 z-50"
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
                                title={sub.title}
                                disabled={sub.disabled}
                                onClick={() => {
                                  setOpenMenu(null);
                                  setOpenSub(null);
                                  sub.onSelect?.();
                                }}
                                className="w-full flex items-center justify-between gap-6 px-2 py-1.5 rounded-md text-left text-gray-200 hover:bg-cad-hover hover:text-cad-strong disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-200"
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`w-[22px] h-[22px] shrink-0 rounded-sm flex items-center justify-center [&_svg]:w-[15px] [&_svg]:h-[15px] ${
                                      sub.checked ? 'bg-cad-hover ring-1 ring-gray-500/60 text-cad-strong' : ''
                                    }`}
                                  >
                                    {sub.icon}
                                  </span>
                                  {sub.label}
                                </span>
                                {sub.shortcut && <span className="text-2xs text-gray-500">{sub.shortcut}</span>}
                              </button>
                            )
                          )}
                        </SubmenuPopup>
                      )}
                    </div>
                  ) : (
                    <button
                      key={entry.label}
                      type="button"
                      role="menuitem"
                      data-testid={entry.testId}
                      title={entry.title}
                      disabled={entry.disabled}
                      onMouseEnter={() => setOpenSub(null)}
                      onClick={() => {
                        setOpenMenu(null);
                        entry.onSelect?.();
                      }}
                      className="w-full flex items-center justify-between gap-6 px-2 py-1.5 rounded-md text-left text-gray-200 hover:bg-cad-hover hover:text-cad-strong disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-200"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-[22px] h-[22px] shrink-0 rounded-sm flex items-center justify-center [&_svg]:w-[15px] [&_svg]:h-[15px] ${
                            entry.checked && entry.icon ? 'bg-cad-hover ring-1 ring-gray-500/60 text-cad-strong' : ''
                          }`}
                        >
                          {entry.icon ?? (entry.checked ? <span className="text-cad-accent">✓</span> : null)}
                        </span>
                        {entry.label}
                      </span>
                      {entry.shortcut && <span className="text-2xs text-gray-500">{entry.shortcut}</span>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Una sola fila de navegación (ADR-0064): las pestañas de la cinta van junto a los menús */}
      <div data-testid="nav-ribbon-tabs" className="self-stretch flex items-stretch ml-2 pl-2 border-l border-cad-border shrink-0">
        <RibbonTabs />
      </div>

      {/* Centro: título del documento (zona neutra: un clic aquí no hace nada) */}
      <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 text-gray-400 text-xs px-3">
        {fileName && (
          <>
            <FileText size={16} className="shrink-0" />
            <span className="truncate" title={filePath ?? fileName}>
              {fileName}
              {!filePath && ' — demo (not saved)'}
              {filePath && isDirty && ' — unsaved changes'}
            </span>
          </>
        )}
      </div>

      {/* Acceso rápido a la derecha (ADR-0064): con las pestañas en esta fila, el centro queda para el título */}
      <QuickAccessToolbar />

      <button
        type="button"
        data-testid="theme-toggle-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="p-1 rounded hover:bg-cad-hover text-gray-400 hover:text-cad-strong shrink-0"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
};
