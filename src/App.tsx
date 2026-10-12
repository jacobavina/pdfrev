import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { PdfViewer } from './components/PdfViewer';
import { MarkupsList } from './components/MarkupsList';
import { MenuBar } from './components/shell/MenuBar';
import { Ribbon } from './components/shell/Ribbon';
import { LeftDock } from './components/shell/LeftDock';
import { StatusBar } from './components/shell/StatusBar';
import { ToastHost } from './components/shell/ToastHost';
import { useDocumentStore } from './store/useDocumentStore';
import { useMarkupStore } from './store/useMarkupStore';
import { useSearchStore } from './store/useSearchStore';
import { useUiStore } from './store/useUiStore';
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
const SidePanelFallback: React.FC = () => <aside className="w-10 bg-cad-panel border-l border-cad-border" />;
import { RULER_SIZE } from './core/measurements/rulers';
import { CalibrateHint } from './components/viewer/CalibrateHint';
const Rulers = lazy(() => import('./components/viewer/Rulers'));
import fixtureMeta from '../fixtures/test-blueprint.meta.json';

/** Pestaña del documento abierto sobre el área de trabajo. */
const DocumentTab: React.FC = () => {
  const { fileName, filePath } = useDocumentStore();
  const isDirty = useMarkupStore((s) => s.isDirty);
  if (!fileName) return null;
  return (
    <div className="h-8 bg-cad-subtle border-b border-cad-border flex items-end px-2 shrink-0" data-testid="document-tabs">
      <div
        className="flex items-center gap-1.5 h-7 px-3 bg-cad-canvas/0 bg-cad-ribbon border border-b-0 border-cad-border rounded-t text-xs text-gray-200 max-w-[22rem]"
        title={filePath ?? fileName}
      >
        <FileText size={13} className="text-rose-600 dark:text-rose-400 shrink-0" />
        <span className="truncate">{fileName}</span>
        {isDirty && filePath && <span className="text-amber-600 dark:text-amber-400">●</span>}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const { pdfBytes, setLoading } = useDocumentStore();
  const showRulers = useUiStore((s) => s.showRulers);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const { addMarkup } = useMarkupStore();
  const { saveNow } = useAutoSave();

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
        <LeftDock />
        <div className="flex-1 min-w-0 flex flex-col">
          <DocumentTab />
          <div
            ref={viewerHostRef}
            data-testid="viewer-host"
            className="flex-1 min-h-0 flex relative"
            style={showRulers ? { paddingLeft: RULER_SIZE, paddingTop: RULER_SIZE } : undefined}
          >
            {showRulers && (
              <Suspense fallback={null}>
                <Rulers hostRef={viewerHostRef} />
              </Suspense>
            )}
            <PdfViewer />
            <CalibrateHint />
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
      </div>

      {/* 3. Lista de marcas y barra de estado */}
      <MarkupsList />
      <StatusBar />

      <ToastHost />
      <Suspense fallback={null}>
        <ShortcutsDialog />
      </Suspense>
    </div>
  );
};

export default App;
