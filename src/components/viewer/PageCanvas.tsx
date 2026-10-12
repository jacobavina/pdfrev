import React, { useEffect, useRef } from 'react';
import type * as pdfjsLib from 'pdfjs-dist';
import { renderPageToCanvas, RenderResult } from '../../services/pdfService';

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

    let cancelled = false;
    renderPageToCanvas(pdfDoc, pageIndex, canvas, {
      scale,
      rotation,
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
  }, [pdfDoc, pageIndex, scale, rotation, active, shouldRender, textLayerNode, ocConfig, ocVersion]);

  return (
    <canvas
      ref={canvasRef}
      id={active ? 'pdf-render-canvas' : undefined}
      data-testid={active ? 'pdf-canvas' : `pdf-page-canvas-${pageIndex}`}
      className="block"
    />
  );
};
