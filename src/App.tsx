import React, { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { ThumbnailsSidebar } from './components/ThumbnailsSidebar';
import { PdfViewer } from './components/PdfViewer';
import { ToolChestPanel } from './components/toolchest/ToolChestPanel';
import { PropertiesInspectorPanel } from './components/PropertiesInspectorPanel';
import { MarkupsList } from './components/MarkupsList';
import { useDocumentStore } from './store/useDocumentStore';
import { useMarkupStore } from './store/useMarkupStore';
import { useAutoSave } from './hooks/useAutoSave';
import { loadPdfData } from './services/fileDialogService';
import fixtureMeta from '../fixtures/test-blueprint.meta.json';

export const App: React.FC = () => {
  const { pdfBytes, setLoading } = useDocumentStore();
  const { addMarkup } = useMarkupStore();
  const { saveNow } = useAutoSave();

  // Atajo global Ctrl+S / Meta+S para guardar cambios
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveNow();
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
              text: 'Revisión de dimensiones: Rectángulo de control verificado',
              author: 'Ing. Estructural',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: 'pending',
              layer: 'Calibración',
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
      {/* 1. Barra Superior (Herramientas, archivo, zoom) */}
      <TopBar />

      {/* 2. Área Central (Miniaturas a la izquierda + Visor al centro + Tool Chest y Propiedades a la derecha) */}
      <div className="flex-1 flex overflow-hidden relative">
        <ThumbnailsSidebar />
        <PdfViewer />
        <ToolChestPanel />
        <PropertiesInspectorPanel defaultCollapsed={true} />
      </div>

      {/* 3. Panel Inferior (Lista de marcas técnica con sincronización bidireccional) */}
      <MarkupsList />
    </div>
  );
};

export default App;
