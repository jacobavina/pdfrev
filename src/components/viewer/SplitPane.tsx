import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns2, Link2, X } from 'lucide-react';
import { useSplitStore } from '../../store/useSplitStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useOverlayStore } from '../../store/useOverlayStore';
import { loadPdfDocument, renderPageToCanvas } from '../../services/pdfService';
import { showToast } from '../../services/toastService';
import { getMarkupSvgDescriptor, renderSvgDescriptor } from '../../core/markup/render';
import { mainToSplitCenter, scrollToCenter, splitToMainCenter, viewCenterOnPage } from '../../core/compare/splitSync';

type PdfDoc = Awaited<ReturnType<typeof loadPdfDocument>>;

/**
 * Panel de la vista lado a lado (ADR-0049 / ADR-0054), como Split View de Revu: otra página del documento o de otro PDF, al
 * mismo zoom que el visor y, con Sync, centrado en ambos sentidos en la misma zona del plano (y en la misma página si es otro PDF).
 * Solo lectura: muestra las marcas de REA de esa página o las anotaciones del otro PDF.
 */
export const SplitPane: React.FC = () => {
  const { sourceName, sourceBytes, pageIndex, pageCount, sync, mainView, driver, setPage, setSync, setSplitView, close } = useSplitStore();
  const { pdfDoc, scale, rotation } = useDocumentStore();
  const overlayMatrix = useOverlayStore((s) => s.matrix);
  const overlayOffset = useOverlayStore((s) => s.offset);
  const markups = useMarkupStore((s) => s.markups);
  const [otherDoc, setOtherDoc] = useState<PdfDoc | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef<{ left: number; top: number } | null>(null);

  // Documento del panel: el propio o el otro PDF (se libera al cerrar o cambiar)
  useEffect(() => {
    if (!sourceBytes) {
      setOtherDoc(null);
      return;
    }
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    loadPdfDocument(sourceBytes)
      .then((doc) => {
        loaded = doc;
        if (cancelled) void doc.destroy();
        else setOtherDoc(doc);
      })
      .catch((err) => {
        console.error('[Split] No se pudo cargar el PDF del panel:', err);
        showToast('Could not load the PDF to compare side by side.');
      });
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [sourceBytes]);

  const doc = (sourceBytes ? otherDoc : (pdfDoc as PdfDoc | null)) ?? null;

  // Página al mismo zoom y rotación que el visor; el otro PDF muestra sus propias anotaciones
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas || pageIndex >= doc.numPages) return;
    let cancelled = false;
    renderPageToCanvas(doc, pageIndex, canvas, { scale, rotation, annotationMode: sourceBytes ? 1 : 0 })
      .then((r) => {
        if (!cancelled) setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
      })
      .catch((err) => {
        if (cancelled || (err as { name?: string })?.name === 'RenderingCancelledException') return;
        console.error('[Split] No se pudo dibujar la página del panel:', err);
        showToast('Could not draw the page in the side-by-side panel.');
      });
    return () => {
      cancelled = true;
    };
  }, [doc, pageIndex, scale, rotation, sourceBytes]);

  // Sync (main -> split): misma página si es otro PDF y misma zona del plano
  useEffect(() => {
    if (!sync || !mainView || !sourceBytes || driver === 'split') return;
    if (mainView.pageIndex !== pageIndex && mainView.pageIndex < pageCount) setPage(mainView.pageIndex);
  }, [sync, mainView, sourceBytes, pageIndex, pageCount, driver, setPage]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const pageEl = pageRef.current;
    if (!sync || !mainView || !el || !pageEl || !size || driver === 'split') return;
    const ptSize = { width: size.width / (scale || 1), height: size.height / (scale || 1) };
    const mapped = mainToSplitCenter(mainView, ptSize, overlayMatrix, overlayOffset);
    const target = scrollToCenter(
      mapped.nx,
      mapped.ny,
      size,
      { x: pageEl.offsetLeft, y: pageEl.offsetTop },
      { width: el.clientWidth, height: el.clientHeight },
      { width: el.scrollWidth, height: el.scrollHeight }
    );
    el.scrollLeft = target.left;
    el.scrollTop = target.top;
    programmaticScrollRef.current = { left: el.scrollLeft, top: el.scrollTop };
  }, [sync, mainView, size, scale, driver, overlayMatrix, overlayOffset]);

  // Sync (split -> main): al desplazar o cambiar de página en el panel derecho, el visor principal sigue (ADR-0054)
  const handleSplitScroll = () => {
    const el = scrollRef.current;
    const pageEl = pageRef.current;
    if (!el || !pageEl) return;
    const prog = programmaticScrollRef.current;
    if (prog) {
      programmaticScrollRef.current = null;
      if (Math.abs(prog.left - el.scrollLeft) < 1 && Math.abs(prog.top - el.scrollTop) < 1) return;
    }
    const c = viewCenterOnPage(el.getBoundingClientRect(), pageEl.getBoundingClientRect());
    if (!c) return;
    const ptSize = size ? { width: size.width / (scale || 1), height: size.height / (scale || 1) } : null;
    const mapped = ptSize ? splitToMainCenter(c, ptSize, overlayMatrix, overlayOffset) : c;
    setSplitView({ pageIndex, ...mapped });
  };

  const changeSplitPage = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(pageCount - 1, nextIndex));
    setPage(clamped);
    if (sync && sourceBytes !== null) {
      const prev = useSplitStore.getState().splitView ?? useSplitStore.getState().mainView ?? { pageIndex: clamped, nx: 0.5, ny: 0.5 };
      setSplitView({ pageIndex: clamped, nx: prev.nx, ny: prev.ny });
      const { numPages: mainCount, currentPageIndex, setCurrentPage } = useDocumentStore.getState();
      if (clamped < mainCount && currentPageIndex !== clamped) {
        setCurrentPage(clamped);
      }
    }
  };

  const pageMarkups = sourceBytes ? [] : markups.filter((m) => m.pageIndex === pageIndex);
  const transform = size ? { width: size.width, height: size.height, scale: 1, offsetX: 0, offsetY: 0, zoom: scale } : null;

  return (
    <aside data-testid="split-pane" className="w-1/2 min-w-0 flex flex-col border-l border-cad-border bg-cad-canvas">
      <div className="h-9 shrink-0 flex items-center gap-2 px-2.5 bg-cad-panel border-b border-cad-border text-[12px] select-none">
        <Columns2 size={14} className="text-gray-400 shrink-0" />
        <span className="font-semibold text-cad-strong truncate" title={sourceName} data-testid="split-source">
          {sourceName}
        </span>
        <div className="flex items-center gap-0.5 ml-1">
          <button
            type="button"
            data-testid="split-prev"
            className="ui-btn !h-6 !w-6 !p-0"
            disabled={pageIndex <= 0}
            onClick={() => changeSplitPage(pageIndex - 1)}
            title="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span data-testid="split-page" className="tabular-nums text-gray-300 px-1">
            {pageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            data-testid="split-next"
            className="ui-btn !h-6 !w-6 !p-0"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => changeSplitPage(pageIndex + 1)}
            title="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="split-sync"
          aria-pressed={sync}
          onClick={() => setSync(!sync)}
          title={sync ? 'Synchronized with the main view (click to unlink)' : 'Not synchronized (click to follow the main view)'}
          className={`ui-btn !h-6 !px-2 !text-[11.5px] ${sync ? '!bg-cad-accent/15 !text-cad-accent' : ''}`}
        >
          <Link2 size={13} />
          Sync
        </button>
        <button type="button" data-testid="split-close" className="ui-btn !h-6 !w-6 !p-0" onClick={close} title="Close side by side">
          <X size={14} />
        </button>
      </div>
      <div ref={scrollRef} onScroll={handleSplitScroll} data-testid="split-scroll" className="relative flex-1 min-h-0 overflow-auto flex p-8">
        <div
          ref={pageRef}
          className="relative shrink-0 m-auto sheet-shadow bg-white"
          style={size ? { width: size.width, height: size.height } : { width: 1, height: 1 }}
        >
          <canvas ref={canvasRef} data-testid="split-canvas" className="block" />
          {transform && pageMarkups.length > 0 && (
            <svg
              data-testid="split-markups"
              className="absolute inset-0 pointer-events-none"
              width={transform.width}
              height={transform.height}
              viewBox={`0 0 ${transform.width} ${transform.height}`}
            >
              {pageMarkups.map((m) => (
                <g key={m.id}>{renderSvgDescriptor(getMarkupSvgDescriptor(m, transform), m.id)}</g>
              ))}
            </svg>
          )}
        </div>
      </div>
    </aside>
  );
};

export default SplitPane;
