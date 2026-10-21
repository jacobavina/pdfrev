import React, { useCallback, useEffect, useRef, useState } from 'react';
import type * as pdfjsLib from 'pdfjs-dist';
import { renderPageToCanvas, RenderResult } from '../../services/pdfService';
import { fitsInSingleCanvas, regionAround, regionCovers, RectPx, visibleRectOfPage } from '../../core/render/tilePlan';

interface PageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  rotation: number;
  /** Página activa (la interactiva): lleva los identificadores históricos y su capa de texto. */
  active: boolean;
  /** Fuera de la zona visible (vista continua) el lienzo se vacía para no retener memoria. */
  shouldRender: boolean;
  /** Contenedor de la capa de texto; solo la página activa lo tiene. */
  textLayerNode: HTMLDivElement | null;
  /** Capas del PDF (ADR-0024) y su versión: cambiar la visibilidad de una capa vuelve a renderizar. */
  ocConfig?: unknown;
  ocVersion?: number;
  onRendered: (pageIndex: number, result: RenderResult, active: boolean) => void;
}

/**
 * Lienzo de una página (ADR-0019). Vive en la misma posición del árbol tanto si la página está activa como si
 * no, así que activar otra página no lo vuelve a montar: el render con doble búfer de pdfService sustituye la
 * imagen sin dejar la hoja en blanco.
 */
export const PageCanvas: React.FC<PageCanvasProps> = ({
  pdfDoc,
  pageIndex,
  scale,
  rotation,
  active,
  shouldRender,
  textLayerNode,
  ocConfig,
  ocVersion,
  onRendered,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;
  // Región visible rasterizada cuando la hoja no cabe en un canvas (ADR-0090); `key` liga la región al zoom y giro
  const zoomKey = `${scale}:${rotation}`;
  const [regionState, setRegionState] = useState<{ key: string; rect: RectPx } | null>(null);
  const regionRef = useRef(regionState);
  regionRef.current = regionState;

  /** Tamaño de la hoja en px CSS: el de su contenedor, que ya lleva el zoom. */
  const pageSize = () => {
    const slot = canvasRef.current?.parentElement;
    return slot ? { w: slot.offsetWidth, h: slot.offsetHeight } : { w: 0, h: 0 };
  };

  const updateRegion = useCallback(() => {
    const canvas = canvasRef.current;
    const slot = canvas?.parentElement;
    if (!canvas || !slot || !shouldRender) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = { w: slot.offsetWidth, h: slot.offsetHeight };
    if (fitsInSingleCanvas(w, h, dpr)) {
      if (regionRef.current) setRegionState(null);
      return;
    }
    const container = slot.closest('[data-testid="pdf-viewer-container"]') ?? slot.parentElement;
    if (!container) return;
    const sr = slot.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    const visible = visibleRectOfPage(
      { x: sr.left, y: sr.top, width: sr.width, height: sr.height },
      { x: cr.left, y: cr.top, width: cr.width, height: cr.height }
    );
    const current = regionRef.current;
    if (current && current.key === zoomKey && regionCovers(current.rect, visible)) return;
    setRegionState({ key: zoomKey, rect: regionAround(visible, w, h, dpr) });
  }, [shouldRender, zoomKey]);

  // Recalcula la región con el zoom, el giro y el desplazamiento del visor
  useEffect(() => {
    updateRegion();
    const container = canvasRef.current?.parentElement?.closest('[data-testid="pdf-viewer-container"]');
    if (!container) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateRegion);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [updateRegion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDoc) return;
    if (!shouldRender) {
      // Liberar el mapa de bits de las páginas lejanas
      if (canvas.width !== 0) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }
    // La página activa espera a su capa de texto para renderizar una sola vez
    if (active && !textLayerNode) return;
    // Hoja demasiado grande para un canvas: espera a la región calculada para este zoom
    const { w, h } = pageSize();
    const needsRegion = !fitsInSingleCanvas(w, h, window.devicePixelRatio || 1);
    if (needsRegion && regionState?.key !== zoomKey) return;
    const region = needsRegion ? regionState!.rect : undefined;

    let cancelled = false;
    renderPageToCanvas(pdfDoc, pageIndex, canvas, {
      scale,
      rotation,
      region,
      textLayerContainer: active ? textLayerNode : null,
      optionalContentConfig: ocConfig ?? undefined,
    })
      .then((result) => {
        if (!cancelled && result) onRenderedRef.current(pageIndex, result, active);
      })
      .catch((err) => {
        console.error(`Error renderizando la página ${pageIndex + 1} del PDF:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex, scale, rotation, active, shouldRender, textLayerNode, ocConfig, ocVersion, regionState, zoomKey]);

  return (
    <canvas
      ref={canvasRef}
      id={active ? 'pdf-render-canvas' : undefined}
      data-testid={active ? 'pdf-canvas' : `pdf-page-canvas-${pageIndex}`}
      data-region={regionState && regionState.key === zoomKey ? 'true' : undefined}
      className="block"
    />
  );
};
