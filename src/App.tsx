import React, { Suspense, lazy, useEffect, useRef } from 'react';
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
import { isTauriEnvironment } from './services/bbxPersistenceService';

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
const RevuToolSetsDialog = lazy(() =>
  import('./components/toolchest/RevuToolSetsDialog').then((m) => ({ default: m.RevuToolSetsDialog }))
);
const FeatureGuideDialog = lazy(() =>
  import('./components/shell/FeatureGuideDialog').then((m) => ({ default: m.FeatureGuideDialog }))
);
const ShortcutsDialog = lazy(() =>
  import('./components/shell/ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog }))
);
const DocumentBar = lazy(() =>
  import('./components/shell/DocumentBar').then((m) => ({ default: m.DocumentBar }))
);
const DocumentPropertiesDialog = lazy(() => import('./components/modals/DocumentPropertiesDialog').then((m) => ({ default: m.DocumentPropertiesDialog })));
const CropPagesDialog = lazy(() => import('./components/modals/CropPagesDialog').then((m) => ({ default: m.CropPagesDialog })));
const NumberPagesDialog = lazy(() => import('./components/modals/NumberPagesDialog').then((m) => ({ default: m.NumberPagesDialog })));
const UndoHistoryDialog = lazy(() => import('./components/modals/UndoHistoryDialog').then((m) => ({ default: m.UndoHistoryDialog })));
const CopyToolsDialog = lazy(() => import('./components/modals/CopyToolsDialog').then((m) => ({ default: m.CopyToolsDialog })));
const CombinePdfsModal = lazy(() =>
  import('./components/modals/CombinePdfsModal').then((m) => ({ default: m.CombinePdfsModal }))
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

/** El foco está en un campo donde se escribe: las teclas sueltas no son atajos. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export const App: React.FC = () => {
  const { pdfBytes, setLoading } = useDocumentStore();
  const showRulers = useUiStore((s) => s.showRulers);
  const markupsListOpen = useUiStore((s) => s.markupsListOpen);
  const combineModalOpen = useUiStore((s) => s.combineModalOpen);
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

  // Perfil de interfaz elegido en una sesión anterior (ADR-0098): se recupera al arrancar
  useEffect(() => {
    const { profile, applyProfile } = useUiStore.getState();
    if (profile) applyProfile(profile);
  }, []);

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
      } else if (
        ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'm' || e.key === 'M')) ||
        (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O') && !isTypingTarget(e.target))
      ) {
        // Multiply (Ctrl+M) y Offset (O) de la selección, como en Revu (ADR-0107)
        if (useMarkupStore.getState().selectedMarkupIds.length > 0) {
          e.preventDefault();
          useUiStore.getState().setCopyToolDialog(e.key.toLowerCase() === 'm' ? 'multiply' : 'offset');
        }
      } else if (e.key === 'F9' && e.shiftKey && !e.altKey) {
        // Show Grid (Shift+F9) y Snap to Grid (Ctrl+Shift+F9), ADR-0106
        e.preventDefault();
        const ui = useUiStore.getState();
        if (e.ctrlKey || e.metaKey) {
          ui.setSnapToGrid(!ui.snapToGrid);
          showToast(`Snap to grid: ${!ui.snapToGrid ? 'on' : 'off'}`);
        } else {
          ui.setShowGrid(!ui.showGrid);
        }
      } else if (e.key === 'F1') {
        e.preventDefault();
        useUiStore.getState().setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [saveNow]);

  // Carga inicial: si se pasa un archivo en el arranque ("Abrir con" o CLI, ADR-0087), se abre;
  // si no, se carga el plano de calibración para desarrollo y E2E
  useEffect(() => {
    async function loadInitialFixture() {
      if (pdfBytes) return;

      if (isTauriEnvironment()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const startupFile = await invoke<string | null>('get_startup_file_arg');
          if (startupFile) {
            const { openPdfFromPath } = await import('./services/fileDialogService');
            await openPdfFromPath(startupFile);
            return;
          }
        } catch (tauriErr) {
          console.warn('[Startup] Error consultando argumento de arranque:', tauriErr);
        }
      }

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
          // El panel de Propiedades arranca plegado (ADR-0064): la selección de la demo no lo abre; lo abre el usuario
          useUiStore.getState().setRightPanel(null);
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
      {/* Una sola fila de navegación: los menús llevan las pestañas de la cinta (ADR-0064) */}
      <MenuBar />
      <Ribbon showTabs={false} />
      <Suspense fallback={null}>
        <SearchBar />
      </Suspense>

      {/* 2. Espacio de trabajo: panel izquierdo con pestañas · documento · paneles derechos */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        <Suspense fallback={<div className="w-11 shrink-0 bg-cad-panel border-r border-cad-border" />}>
          <LeftDock />
        </Suspense>
        <div className="flex-1 min-w-0 flex flex-col">
          <Suspense fallback={<div className="h-7 bg-cad-dark border-y border-cad-border shrink-0" />}>
            <DocumentBar />
          </Suspense>
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
        <FeatureGuideDialog />
        <RevuToolSetsDialog />
        <CopyToolsDialog />
        <UndoHistoryDialog />
        <DocumentPropertiesDialog />
        <CropPagesDialog />
        <NumberPagesDialog />
      </Suspense>
      {combineModalOpen && (
        <Suspense fallback={null}>
          <CombinePdfsModal />
        </Suspense>
      )}
    </div>
  );
};

export default App;
