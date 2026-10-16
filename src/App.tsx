import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { PdfViewer } from './components/PdfViewer';
import { MenuBar } from './components/shell/MenuBar';
import { Ribbon } from './components/shell/Ribbon';
import { StatusBar } from './components/shell/StatusBar';
import { ToastHost } from './components/shell/ToastHost';
import { useDocumentStore } from './store/useDocumentStore';
import { useMarkupStore } from './store/useMarkupStore';
import { useSplitStore } from './store/useSplitStore';
import { showToast } from './services/toastService';
import { RightRail } from './components/shell/RightRail';
import { watchSelectionPanels } from './services/selectionPanelService';
import { useSearchStore } from './store/useSearchStore';
import { useUiStore } from './store/useUiStore';
import { useOverlayStore } from './store/useOverlayStore';
import { useAutoSave } from './hooks/useAutoSave';
import { loadPdfData, openPdfDialog } from './services/fileDialogService';

// Paneles y diálogos que no hacen falta para el primer render: se cargan aparte (bundle principal ≤ 800 kB)
const MeasurementsPanel = lazy(() =>
  import('./components/shell/MeasurementsPanel').then((m) => ({ default: m.MeasurementsPanel }))
);
const ToolChestPanel = lazy(() =>
  import('./components/toolchest/ToolChestPanel').then((m) => ({ default: m.ToolChestPanel }))
);
const PropertiesInspectorPanel = lazy(() =>
  import('./components/PropertiesInspectorPanel').then((m) => ({ default: m.PropertiesInspectorPanel }))
);
const SearchBar = lazy(() => import('./components/SearchBar').then((m) => ({ default: m.SearchBar })));
const ShortcutsDialog = lazy(() =>
  import('./components/shell/ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog }))
);
/** Hueco de la barra lateral plegada mientras carga el panel. */
const SidePanelFallback: React.FC = () => null;
// Panel izquierdo (miniaturas, marcadores y capas) en su propio fragmento: presupuesto del bundle (ADR-0045)
const LeftDock = lazy(() => import('./components/shell/LeftDock').then((m) => ({ default: m.LeftDock })));
import { RULER_SIZE } from './core/measurements/rulers';
import { CalibrateHint } from './components/viewer/CalibrateHint';
const Rulers = lazy(() => import('./components/viewer/Rulers'));
const OverlayBar = lazy(() => import('./components/viewer/OverlayBar'));
// Vista lado a lado (ADR-0049): fragmento aparte, solo se carga al abrirla
const SplitPane = lazy(() => import('./components/viewer/SplitPane'));
// Lista de marcas bajo demanda (ADR-0035): libera presupuesto del bundle principal; mientras carga se reserva su barra
const MarkupsList = lazy(() => import('./components/MarkupsList').then((m) => ({ default: m.MarkupsList })));
import fixtureMeta from '../fixtures/test-blueprint.meta.json';

/** Pestaña del documento abierto sobre el área de trabajo. */
const DocumentTab: React.FC = () => {
  const { fileName, filePath } = useDocumentStore();
  const isDirty = useMarkupStore((s) => s.isDirty);
  if (!fileName) return null;
  return (
    <div className="h-9 bg-cad-panel border-b border-cad-border flex items-end px-2 shrink-0" data-testid="document-tabs">
      <div
        className="relative flex items-center gap-2 h-9 px-3 text-xs text-cad-strong max-w-[22rem] shadow-[inset_0_-2px_0_rgb(var(--cad-accent))]"
        title={filePath ?? fileName}
      >
        <FileText size={13} className="text-gray-400 shrink-0" />
        <span className="truncate">{fileName}</span>
        {isDirty && filePath && <span className="text-amber-600 dark:text-amber-400">●</span>}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const { pdfBytes, setLoading } = useDocumentStore();
  const showRulers = useUiStore((s) => s.showRulers);
  const markupsListOpen = useUiStore((s) => s.markupsListOpen);
  const markupsListEverOpened = useRef(markupsListOpen);
  if (markupsListOpen) markupsListEverOpened.current = true;
  const markupsListMounted = markupsListEverOpened.current;
  const overlayActive = useOverlayStore((s) => s.active);
  const splitActive = useSplitStore((s) => s.active);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const { addMarkup } = useMarkupStore();
  const { saveNow } = useAutoSave();

  // Al seleccionar marcas se abre su panel: Measure o Properties (ADR-0043)
  useEffect(() => watchSelectionPanels(), []);

  // Atajos globales: Ctrl+S (guardar), Ctrl+Shift+S (guardar como), Ctrl+O (abrir), Ctrl+F (buscar), F1 (atajos)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void import('./services/documentSaveService').then((m) => m.saveDocumentAs());
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveNow();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        openPdfDialog();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        useSearchStore.getState().setIsOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        // Reglas (como Revu); también evita que Ctrl+R recargue la ventana
        e.preventDefault();
        const ui = useUiStore.getState();
        ui.setShowRulers(!ui.showRulers);
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyL' || e.code === 'KeyP')) {
        // Alt+L lista de marcas, Alt+P propiedades (como en Revu, ADR-0052)
        e.preventDefault();
        const ui = useUiStore.getState();
        if (e.code === 'KeyL') ui.toggleMarkupsList();
        else ui.setRightPanel(ui.rightPanel === 'properties' ? null : 'properties');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F7' || e.key === 'F8')) {
        // Snap to Markup (Ctrl+Shift+F7) y Snap to Content (Ctrl+Shift+F8), como en Revu
        e.preventDefault();
        const { snap, setSnap } = useUiStore.getState();
        if (e.key === 'F8') {
          setSnap({ content: !snap.content });
          showToast(`Snap to content: ${!snap.content ? 'on' : 'off'}`);
        } else {
          const on = !(snap.endpoint || snap.midpoint || snap.intersection);
          setSnap({ endpoint: on, midpoint: on, intersection: on });
          showToast(`Snap to markups: ${on ? 'on' : 'off'}`);
        }
      } else if (e.key === 'F1') {
        e.preventDefault();
        useUiStore.getState().setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [saveNow]);

  // Carga automática inicial del plano de calibración para desarrollo y E2E
  useEffect(() => {
    async function loadInitialFixture() {
      if (pdfBytes) return;

      try {
        setLoading(true);
        const res = await fetch('/fixtures/test-blueprint.pdf');
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          await loadPdfData(
            null,
            'test-blueprint.pdf',
            new Uint8Array(buffer)
          );

          // Si no hay marcas cargadas por .bbx.json, creamos una marca de referencia
          // exactamente sobre el rectángulo conocido para validar alineación
          if (useMarkupStore.getState().markups.length === 0) {
            const rect = fixtureMeta.knownRectangle.normalized;
            addMarkup({
              id: 'calibration-markup-1',
              type: 'rectangle',
              pageIndex: 0,
              points: [
                { x: rect.x, y: rect.y },
                { x: rect.x + rect.width, y: rect.y + rect.height },
              ],
              style: {
                strokeColor: '#0284c7', // Cyan de revisión
                fillColor: 'rgba(2, 132, 199, 0.15)',
                strokeWidth: 2,
                opacity: 1,
              },
              text: 'Dimension check: control rectangle verified',
              author: 'Structural Eng.',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: 'pending',
              layer: 'Calibration',
            });
          }
        }
      } catch (err) {
        console.warn('No se pudo cargar el PDF de prueba inicial:', err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialFixture();
  }, [pdfBytes, setLoading, addMarkup]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-cad-dark">
      {/* 1. Barra de menús (<header>) y cinta de herramientas agrupada (ADR-0017) */}
      <MenuBar />
      <Ribbon />
      <Suspense fallback={null}>
        <SearchBar />
      </Suspense>

      {/* 2. Espacio de trabajo: panel izquierdo con pestañas · documento · paneles derechos */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        <Suspense fallback={<div className="w-11 shrink-0 bg-cad-panel border-r border-cad-border" />}>
          <LeftDock />
        </Suspense>
        <div className="flex-1 min-w-0 flex flex-col">
          <DocumentTab />
          <div className="flex-1 min-h-0 flex">
          <div
            ref={viewerHostRef}
            data-testid="viewer-host"
            className="flex-1 min-w-0 min-h-0 flex relative"
            style={showRulers ? { paddingLeft: RULER_SIZE, paddingTop: RULER_SIZE } : undefined}
          >
            {showRulers && (
              <Suspense fallback={null}>
                <Rulers hostRef={viewerHostRef} />
              </Suspense>
            )}
            <PdfViewer />
            <CalibrateHint />
            {overlayActive && (
              <Suspense fallback={null}>
                <OverlayBar />
              </Suspense>
            )}
          </div>
          {splitActive && (
            <Suspense fallback={<div className="w-1/2 border-l border-cad-border bg-cad-canvas" />}>
              <SplitPane />
            </Suspense>
          )}
          </div>
        </div>
        <Suspense fallback={<SidePanelFallback />}>
          <PropertiesInspectorPanel defaultCollapsed={true} />
        </Suspense>
        <Suspense fallback={<SidePanelFallback />}>
          <MeasurementsPanel defaultCollapsed={true} />
        </Suspense>
        <Suspense fallback={<SidePanelFallback />}>
          <ToolChestPanel />
        </Suspense>
        <RightRail />
      </div>

      {/* 3. Lista de marcas y barra de estado */}
      {/* Abre cerrada, como en Revu (ADR-0060); una vez abierta queda montada para conservar filtros y orden */}
      {markupsListMounted && (
        <Suspense fallback={markupsListOpen ? <div className="h-8 shrink-0 bg-cad-panel border-t border-cad-border" /> : null}>
          <MarkupsList hidden={!markupsListOpen} />
        </Suspense>
      )}
      <StatusBar />

      <ToastHost />
      <Suspense fallback={null}>
        <ShortcutsDialog />
      </Suspense>
    </div>
  );
};

export default App;
